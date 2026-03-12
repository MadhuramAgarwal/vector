import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY

export async function POST(req: Request) {
  try {
    const { truckId, traderId, truckNumber, capacityMt, materialType } = await req.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Fetch all buyers linked to this trader
    const { data: orders } = await supabase
      .from('orders')
      .select('buyer_id, quantity_mt, material_type, status, created_at, buyer:users!orders_buyer_id_fkey(full_name, email)')
      .eq('trader_id', traderId)
      .in('status', ['pending', 'confirmed'])
      .order('created_at', { ascending: false })

    // Fetch recent delivered orders for demand history
    const { data: recentOrders } = await supabase
      .from('orders')
      .select('buyer_id, quantity_mt, material_type, created_at, buyer:users!orders_buyer_id_fkey(full_name)')
      .eq('trader_id', traderId)
      .eq('status', 'delivered')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(30)

    // Fetch overdue payments to exclude those buyers
    const { data: overdueBills } = await supabase
      .from('monthly_bills')
      .select('party_id')
      .eq('trader_id', traderId)
      .eq('party_role', 'buyer')
      .neq('status', 'paid')
      .lt('due_date', new Date().toISOString().split('T')[0])

    const overdueIds = new Set((overdueBills ?? []).map(b => b.party_id))

    // Build buyer demand summary
    const buyerDemand: Record<string, { name: string; pendingMt: number; lastOrderDays: number; hasOverdue: boolean }> = {}

    for (const o of (orders ?? [])) {
      const id   = o.buyer_id
      const name = (o.buyer as { full_name: string | null; email: string })?.full_name ?? 'Unknown'
      if (!buyerDemand[id]) buyerDemand[id] = { name, pendingMt: 0, lastOrderDays: 999, hasOverdue: overdueIds.has(id) }
      buyerDemand[id].pendingMt += o.quantity_mt ?? 0
    }

    for (const o of (recentOrders ?? [])) {
      const id   = o.buyer_id
      const name = (o.buyer as { full_name: string | null })?.full_name ?? 'Unknown'
      if (!buyerDemand[id]) buyerDemand[id] = { name, pendingMt: 0, lastOrderDays: 999, hasOverdue: overdueIds.has(id) }
      const days = Math.round((Date.now() - new Date(o.created_at).getTime()) / 86400000)
      if (days < buyerDemand[id].lastOrderDays) buyerDemand[id].lastOrderDays = days
    }

    const eligibleBuyers = Object.entries(buyerDemand)
      .filter(([, b]) => !b.hasOverdue)
      .map(([id, b]) => ({ id, ...b }))

    if (eligibleBuyers.length === 0) {
      return NextResponse.json({ ranked: [], reason: 'No eligible buyers (all have overdue payments or none found)' })
    }

    // Call Gemini for ranking
    let ranked = eligibleBuyers

    if (GEMINI_API_KEY) {
      const prompt = `You are a logistics assistant for a sand trading business in Surat, India.

A truck is available:
- Truck Number: ${truckNumber}
- Material: ${materialType}
- Capacity: ${capacityMt} MT

Eligible buyers (not sorted):
${eligibleBuyers.map((b, i) => `${i+1}. ${b.name} — Pending demand: ${b.pendingMt}MT, Last order: ${b.lastOrderDays} days ago`).join('\n')}

Rank these buyers from most to least likely to want sand today. Prioritize:
1. Buyers with high pending demand
2. Buyers who haven't ordered in a while (higher lastOrderDays = higher priority)
3. Regular buyers who order frequently

Return ONLY a JSON array like: [{"id":"...", "reason":"one sentence why"}]
Use the exact IDs provided. Do not include any other text.`

      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          }
        )
        const geminiData = await geminiRes.json()
        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const geminiRanked: { id: string; reason: string }[] = JSON.parse(jsonMatch[0])
          ranked = geminiRanked
            .map(g => ({ ...g, ...(buyerDemand[g.id] ?? {}) }))
            .filter(b => b.name)
        }

        // Log to ai_conversations
        await supabase.from('ai_conversations').insert({
          user_id:   traderId,
          user_role: 'trader',
          type:      'buyer_suggestion',
          prompt,
          response:  text,
          metadata:  { truckId, truckNumber, materialType, capacityMt },
        })
      } catch {
        // Gemini unavailable — use heuristic ranking
        ranked = eligibleBuyers.sort((a, b) => {
          const score = (x: typeof a) => x.pendingMt * 2 + Math.min(x.lastOrderDays, 30)
          return score(b) - score(a)
        }).map(b => ({ ...b, reason: `${b.pendingMt > 0 ? `Has ${b.pendingMt}MT pending. ` : ''}Last ordered ${b.lastOrderDays} days ago.` }))
      }
    }

    return NextResponse.json({ ranked: ranked.slice(0, 5) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
