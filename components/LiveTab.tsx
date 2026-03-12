'use client'

import { useState, useEffect, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'

type User = { id: string; full_name: string | null; email: string }

type DispatchTruck = {
  id: string
  driver_id: string | null
  truck_number: string | null
  buyer_id: string | null
  status: string
  driver: { full_name: string | null; email: string } | null
  buyer: { full_name: string | null; email: string } | null
  batch: {
    dispatch_date: string
    supplier: { full_name: string | null; email: string } | null
  } | null
}

const STATUS_ORDER = ['heading_to_stockyard','at_stockyard','loading','loaded','in_transit','delivered']

const STATUS_LABELS: Record<string, string> = {
  heading_to_stockyard: 'Heading to Stockyard',
  at_stockyard:         'At Stockyard',
  loading:              'Loading',
  loaded:               'Loaded',
  in_transit:           'In Transit',
  delivered:            'Delivered',
}

const STATUS_COLORS: Record<string, string> = {
  heading_to_stockyard: 'bg-orange-900/20 border-orange-700/40',
  at_stockyard:         'bg-blue-900/20 border-blue-700/40',
  loading:              'bg-purple-900/20 border-purple-700/40',
  loaded:               'bg-indigo-900/20 border-indigo-700/40',
  in_transit:           'bg-yellow-900/20 border-yellow-700/40',
  delivered:            'bg-green-900/20 border-green-700/40',
}

export default function LiveTab({
  userId,
  supabase,
  buyers,
}: {
  userId: string
  supabase: SupabaseClient
  buyers: User[]
}) {
  const [trucks, setTrucks]         = useState<DispatchTruck[]>([])
  const [loading, setLoading]       = useState(true)
  const [assigningTruck, setAssigningTruck] = useState<DispatchTruck | null>(null)
  const [assignBuyer, setAssignBuyer]       = useState('')
  const [assignSaving, setAssignSaving]     = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const fetchTrucks = useCallback(async () => {
    const { data } = await supabase
      .from('dispatch_trucks')
      .select(`
        id, driver_id, truck_number, buyer_id, status,
        driver:users!dispatch_trucks_driver_id_fkey(full_name, email),
        buyer:users!dispatch_trucks_buyer_id_fkey(full_name, email),
        batch:dispatch_batches!dispatch_trucks_batch_id_fkey(
          dispatch_date,
          supplier:users!dispatch_batches_supplier_id_fkey(full_name, email)
        )
      `)
      .not('status', 'eq', 'delivered')
      .order('status')
    // Filter to today's batches client-side
    const filtered = ((data as unknown as DispatchTruck[]) ?? []).filter(t => t.batch?.dispatch_date === today)
    setTrucks(filtered)
    setLoading(false)
  }, [supabase, today])

  useEffect(() => {
    fetchTrucks()
    const channel = supabase.channel('live-trucks-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_trucks' }, fetchTrucks)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchTrucks, supabase, userId])

  async function assignBuyerToTruck() {
    if (!assigningTruck || !assignBuyer) return
    setAssignSaving(true)
    await supabase.from('dispatch_trucks').update({ buyer_id: assignBuyer, assigned_at: new Date().toISOString() }).eq('id', assigningTruck.id)
    if (assigningTruck.driver_id) {
      const buyer = buyers.find(b => b.id === assignBuyer)
      await supabase.from('notifications').insert({
        user_id: assigningTruck.driver_id, title: 'Buyer Assigned',
        body: `Delivery assigned to ${buyer?.full_name ?? 'Buyer'}.`,
        type: 'buyer_assigned', ref_id: assigningTruck.id,
      })
    }
    setAssigningTruck(null); setAssignBuyer('')
    await fetchTrucks()
    setAssignSaving(false)
  }

  if (loading) return <p className="text-sm text-sx-lo text-center py-6">Loading live operations…</p>

  const grouped = STATUS_ORDER.map(s => ({ status: s, trucks: trucks.filter(t => t.status === s) })).filter(g => g.trucks.length > 0)
  const total      = trucks.length
  const inTransit  = trucks.filter(t => t.status === 'in_transit').length
  const unassigned = trucks.filter(t => !t.buyer_id).length

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active Today', value: total,      color: 'text-sx-hi' },
          { label: 'In Transit',   value: inTransit,  color: 'text-sx-amber' },
          { label: 'Unassigned',   value: unassigned, color: unassigned > 0 ? 'text-sx-red font-bold' : 'text-sx-lo' },
          { label: 'Delivered',    value: 0,          color: 'text-sx-green' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-sx-card border border-sx-border rounded-xl px-3 py-3 text-center">
            <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-xs text-sx-lo mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {grouped.length === 0 ? (
        <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-10 text-center text-sx-lo text-sm">No trucks in motion today.</div>
      ) : grouped.map(({ status, trucks: group }) => (
        <div key={status}>
          <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-2">{STATUS_LABELS[status]} ({group.length})</h3>
          <div className="space-y-2">
            {group.map(t => (
              <div key={t.id} className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${!t.buyer_id ? 'bg-red-900/20 border-sx-red' : STATUS_COLORS[t.status] ?? 'bg-sx-card border-sx-border'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sx-hi text-sm">{t.truck_number ?? '—'}</span>
                    {!t.buyer_id && <span className="text-[10px] font-bold bg-red-900/50 text-sx-red px-2 py-0.5 rounded-full">NO BUYER</span>}
                  </div>
                  <p className="text-xs text-sx-lo">
                    Driver: {t.driver?.full_name ?? t.driver?.email ?? '—'}
                    {t.buyer && <span className="ml-2">· Buyer: {t.buyer.full_name ?? t.buyer.email}</span>}
                  </p>
                  {t.batch?.supplier && <p className="text-xs text-sx-lo">From: {t.batch.supplier.full_name ?? t.batch.supplier.email}</p>}
                </div>
                {!t.buyer_id && (
                  <button onClick={() => { setAssigningTruck(t); setAssignBuyer('') }}
                    className="text-xs bg-sx-accent text-white px-3 py-1.5 rounded-lg font-semibold hover:opacity-90 transition shrink-0">
                    Assign
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {assigningTruck && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-sx-card border border-sx-border rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sx-hi">Assign Buyer — {assigningTruck.truck_number}</h3>
              <button onClick={() => setAssigningTruck(null)} className="text-sx-lo hover:text-sx-hi text-xl">✕</button>
            </div>
            <select value={assignBuyer} onChange={e => setAssignBuyer(e.target.value)}
              className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
              <option value="">Select buyer…</option>
              {buyers.map(b => <option key={b.id} value={b.id}>{b.full_name ?? b.email}</option>)}
            </select>
            <button onClick={assignBuyerToTruck} disabled={assignSaving || !assignBuyer}
              className="w-full bg-sx-accent text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition">
              {assignSaving ? 'Assigning…' : 'Confirm Assignment'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
