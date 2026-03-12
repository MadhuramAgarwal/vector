import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { availableTrucks, buyerDemand, traderId } = await req.json()

    const prompt = `You are optimizing sand truck assignments in Surat, India.
Available trucks: ${JSON.stringify(availableTrucks, null, 2)}
Buyer demand: ${JSON.stringify(buyerDemand, null, 2)}
Suggest the best assignment of trucks to buyers to minimize total distance and maximize fulfilled demand.
Return ONLY valid JSON with this exact shape:
{
  "assignments": [{"truck_number": "", "driver_id": "", "driver_name": "", "buyer_id": "", "buyer_name": "", "reason": ""}],
  "unassigned_trucks": [{"truck_number": "", "driver_name": ""}],
  "unmet_demand": [{"buyer_name": "", "trucks_still_needed": 0}]
}`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    )

    const geminiJson = await geminiRes.json()
    const text = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    let result: Record<string, unknown>
    try { result = JSON.parse(text) } catch { result = { assignments: [], unassigned_trucks: [], unmet_demand: [] } }

    const supabase = await createClient()
    if (traderId) {
      await supabase.from('ai_conversations').insert({
        user_id:   traderId,
        user_role: 'trader',
        type:      'truck_assignment',
        prompt,
        response:  text,
        metadata:  { availableTrucks, buyerDemand },
      })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('suggest-assignments error:', err)
    return NextResponse.json({ error: 'Suggestion failed' }, { status: 500 })
  }
}
