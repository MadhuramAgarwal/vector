import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// One-shot data reset endpoint — wipes all transactional data, keeps users
export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const tables = [
    'ai_conversations',
    'payment_term_confirmations',
    'trip_status_log',
    'trip_rates',
    'weight_slips',
    'royalty_passes',
    'challans',
    'dispatch_trucks',
    'dispatch_batches',
    'fleet_availability',
    'buyer_demand',
    'bill_trips',
    'monthly_bills',
    'notifications',
    'trips',
    'orders',
  ]

  const errors: string[] = []
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (error && !error.message.includes('does not exist')) {
      errors.push(`${table}: ${error.message}`)
    }
  }

  // Clear storage
  for (const bucket of ['documents', 'challans']) {
    const { data: files } = await supabase.storage.from(bucket).list()
    if (files && files.length > 0) {
      await supabase.storage.from(bucket).remove(files.map(f => f.name))
    }
  }

  return NextResponse.json({
    ok: true,
    cleared: tables,
    errors: errors.length > 0 ? errors : undefined,
  })
}
