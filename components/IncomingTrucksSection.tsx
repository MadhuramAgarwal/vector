'use client'

import { useState, useEffect, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'

type DispatchTruck = {
  id: string
  truck_number: string | null
  capacity_mt: number | null
  status: string
  driver: { full_name: string | null; email: string } | null
  buyer: { full_name: string | null; email: string } | null
}

type DispatchBatch = {
  id: string
  dispatch_date: string
  total_trucks: number | null
  total_capacity_mt: number | null
  status: string
  notes: string | null
  trader: { full_name: string | null; email: string } | null
  dispatch_trucks: DispatchTruck[]
}

const TRUCK_STATUS_STYLES: Record<string, string> = {
  heading_to_stockyard: 'bg-orange-900/40 text-sx-accent',
  at_stockyard:         'bg-blue-900/40 text-sx-blue',
  loading:              'bg-purple-900/40 text-purple-300',
  loaded:               'bg-indigo-900/40 text-indigo-300',
  in_transit:           'bg-amber-900/40 text-sx-amber',
  delivered:            'bg-green-900/40 text-sx-green',
  unassigned_alert:     'bg-red-900/40 text-sx-red',
}

export default function IncomingTrucksSection({
  userId,
  supabase,
}: {
  userId: string
  supabase: SupabaseClient
}) {
  const [batches, setBatches]         = useState<DispatchBatch[]>([])
  const [loading, setLoading]         = useState(true)
  const [markingReady, setMarkingReady] = useState<string | null>(null)

  const fetchBatches = useCallback(async () => {
    const today    = new Date().toISOString().split('T')[0]
    const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0]
    const { data } = await supabase
      .from('dispatch_batches')
      .select(`
        *,
        trader:users!dispatch_batches_trader_id_fkey(full_name, email),
        dispatch_trucks(
          id, truck_number, capacity_mt, status,
          driver:users!dispatch_trucks_driver_id_fkey(full_name, email),
          buyer:users!dispatch_trucks_buyer_id_fkey(full_name, email)
        )
      `)
      .eq('supplier_id', userId)
      .gte('dispatch_date', today)
      .lte('dispatch_date', dayAfter)
      .neq('status', 'cancelled')
      .order('dispatch_date', { ascending: true })
    setBatches((data as DispatchBatch[]) ?? [])
    setLoading(false)
  }, [userId, supabase])

  useEffect(() => { fetchBatches() }, [fetchBatches])

  async function markReady(batchId: string) {
    setMarkingReady(batchId)
    await supabase
      .from('dispatch_trucks')
      .update({ status: 'loading' })
      .eq('batch_id', batchId)
      .eq('status', 'at_stockyard')
    await fetchBatches()
    setMarkingReady(null)
  }

  if (loading) return (
    <p className="text-sm text-sx-lo text-center py-6">Loading incoming trucks…</p>
  )

  if (batches.length === 0) return (
    <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-10 text-center text-sx-lo text-sm">
      No incoming trucks for today or tomorrow.
    </div>
  )

  return (
    <div className="space-y-4">
      {batches.map(batch => {
        const trucks = batch.dispatch_trucks ?? []
        const atYard = trucks.filter(t => t.status === 'at_stockyard').length

        return (
          <div key={batch.id} className="bg-sx-card border border-sx-border rounded-2xl p-5 space-y-4">
            {/* Batch header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-sx-hi text-sm">
                  {new Date(batch.dispatch_date + 'T00:00:00').toLocaleDateString('en-IN', {
                    weekday: 'short', day: 'numeric', month: 'short',
                  })}
                  {' · '}
                  {trucks.length} truck{trucks.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-sx-lo mt-0.5">
                  Trader: {batch.trader?.full_name ?? batch.trader?.email ?? '—'}
                </p>
                {batch.notes && (
                  <p className="text-xs text-sx-lo mt-0.5">{batch.notes}</p>
                )}
              </div>

              {atYard > 0 && (
                <button
                  onClick={() => markReady(batch.id)}
                  disabled={markingReady === batch.id}
                  className="text-xs bg-purple-900/40 text-purple-300 border border-purple-900/60 px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 transition shrink-0"
                >
                  {markingReady === batch.id ? '…' : `Mark ${atYard} Ready to Load`}
                </button>
              )}
            </div>

            {/* Truck rows — privacy wall: no buyer name/email shown */}
            <div className="space-y-1.5">
              {trucks.map(t => (
                <div
                  key={t.id}
                  className="flex items-center justify-between bg-sx-raised border border-sx-border rounded-xl px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sx-hi">
                      {t.truck_number ?? '—'}
                    </span>
                    <span className="text-sx-lo text-xs">
                      · {t.driver?.full_name ?? t.driver?.email ?? '—'}
                    </span>
                    {/* Privacy wall: never show buyer name — only show assignment status */}
                    <span className="text-xs text-sx-lo">
                      → {t.buyer ? 'Buyer assigned' : 'Unassigned'}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize whitespace-nowrap ${TRUCK_STATUS_STYLES[t.status] ?? 'bg-sx-raised text-sx-lo'}`}
                  >
                    {t.status.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
