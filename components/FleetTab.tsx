'use client'

import { useState, useEffect, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'

type User = { id: string; full_name: string | null; email: string }

type FleetAvailability = {
  id: string
  driver_id: string
  truck_number: string
  truck_capacity_mt: number
  available_date: string
  status: string
  notes: string | null
  driver: { full_name: string | null; email: string } | null
}

type DispatchTruck = {
  id: string
  batch_id: string
  driver_id: string | null
  truck_number: string | null
  capacity_mt: number | null
  buyer_id: string | null
  status: string
  driver: { full_name: string | null; email: string } | null
  buyer: { full_name: string | null; email: string } | null
}

type DispatchBatch = {
  id: string
  supplier_id: string
  dispatch_date: string
  total_trucks: number | null
  total_capacity_mt: number | null
  status: string
  notes: string | null
  supplier: { full_name: string | null; email: string } | null
  dispatch_trucks: DispatchTruck[]
}

type BuyerDemand = {
  id: string
  buyer_id: string
  demand_date: string
  trucks_requested: number
  trucks_assigned: number
  material_type: string
  notes: string | null
  buyer: { full_name: string | null; email: string } | null
}

type GeminiAssignment = {
  truck_number: string
  driver_id: string
  driver_name: string
  buyer_id: string
  buyer_name: string
  reason: string
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

export default function FleetTab({
  userId,
  supabase,
  buyers,
  suppliers,
}: {
  userId: string
  supabase: SupabaseClient
  buyers: User[]
  suppliers: User[]
}) {
  const [section, setSection] = useState<'available' | 'active' | 'demand'>('available')
  const [fleet, setFleet]     = useState<FleetAvailability[]>([])
  const [batches, setBatches] = useState<DispatchBatch[]>([])
  const [demand, setDemand]   = useState<BuyerDemand[]>([])
  const [loading, setLoading] = useState(true)

  // Batch creation
  const [showBatch, setShowBatch]         = useState(false)
  const [batchSupplier, setBatchSupplier] = useState('')
  const [batchDate, setBatchDate]         = useState(new Date().toISOString().split('T')[0])
  const [batchSelected, setBatchSelected] = useState<string[]>([])
  const [batchNotes, setBatchNotes]       = useState('')
  const [batchSaving, setBatchSaving]     = useState(false)
  const [batchError, setBatchError]       = useState('')

  // Assign buyer
  const [assigningTruck, setAssigningTruck] = useState<DispatchTruck | null>(null)
  const [assignBuyer, setAssignBuyer]       = useState('')
  const [assignSaving, setAssignSaving]     = useState(false)

  // Demand logging
  const [showDemand, setShowDemand]         = useState(false)
  const [demandBuyer, setDemandBuyer]       = useState('')
  const [demandTrucks, setDemandTrucks]     = useState('1')
  const [demandMaterial, setDemandMaterial] = useState('Sand')
  const [demandNotes, setDemandNotes]       = useState('')
  const [demandSaving, setDemandSaving]     = useState(false)

  // Gemini
  const [geminiLoading, setGeminiLoading] = useState(false)
  const [geminiResult, setGeminiResult]   = useState<{
    assignments: GeminiAssignment[]
    unassigned_trucks: { truck_number: string; driver_name: string }[]
    unmet_demand: { buyer_name: string; trucks_still_needed: number }[]
  } | null>(null)
  const [acceptingSuggestion, setAcceptingSuggestion] = useState(false)

  const today    = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  const fetchAll = useCallback(async () => {
    const [fleetRes, batchRes, demandRes] = await Promise.all([
      supabase
        .from('fleet_availability')
        .select('*, driver:users!fleet_availability_driver_id_fkey(full_name, email)')
        .in('available_date', [today, tomorrow])
        .eq('status', 'available')
        .order('available_date', { ascending: true }),
      supabase
        .from('dispatch_batches')
        .select(`*, supplier:users!dispatch_batches_supplier_id_fkey(full_name, email),
          dispatch_trucks(id, batch_id, driver_id, truck_number, capacity_mt, buyer_id, status,
            driver:users!dispatch_trucks_driver_id_fkey(full_name, email),
            buyer:users!dispatch_trucks_buyer_id_fkey(full_name, email))`)
        .eq('trader_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase
        .from('buyer_demand')
        .select('*, buyer:users!buyer_demand_buyer_id_fkey(full_name, email)')
        .eq('trader_id', userId)
        .eq('demand_date', today)
        .order('created_at', { ascending: false }),
    ])
    setFleet((fleetRes.data as FleetAvailability[]) ?? [])
    setBatches((batchRes.data as DispatchBatch[]) ?? [])
    setDemand((demandRes.data as BuyerDemand[]) ?? [])
    setLoading(false)
  }, [userId, supabase, today, tomorrow])

  useEffect(() => { fetchAll() }, [fetchAll])

  const fleetForBatch = fleet.filter(f => f.available_date === batchDate)

  async function createBatch() {
    if (!batchSupplier || batchSelected.length === 0) { setBatchError('Select a supplier and at least one truck.'); return }
    setBatchSaving(true)
    setBatchError('')
    const selectedFleet = fleet.filter(f => batchSelected.includes(f.id))
    const totalCap = selectedFleet.reduce((s, f) => s + f.truck_capacity_mt, 0)

    const { data: batch, error: bErr } = await supabase
      .from('dispatch_batches')
      .insert({ trader_id: userId, supplier_id: batchSupplier, dispatch_date: batchDate,
        total_trucks: selectedFleet.length, total_capacity_mt: totalCap, notes: batchNotes || null })
      .select().single()

    if (bErr || !batch) { setBatchError(bErr?.message ?? 'Failed'); setBatchSaving(false); return }

    await supabase.from('dispatch_trucks').insert(
      selectedFleet.map(f => ({ batch_id: batch.id, fleet_id: f.id, driver_id: f.driver_id, truck_number: f.truck_number, capacity_mt: f.truck_capacity_mt }))
    )
    await supabase.from('fleet_availability').update({ status: 'dispatched' }).in('id', batchSelected)

    const sup = suppliers.find(s => s.id === batchSupplier)
    const truckList = selectedFleet.map(f => f.truck_number).join(', ')
    await supabase.from('notifications').insert({
      user_id: batchSupplier, title: 'Dispatch Batch Created',
      body: `${selectedFleet.length} truck(s) heading to your stockyard on ${batchDate}. Trucks: ${truckList}`,
      type: 'dispatch_created', ref_id: batch.id,
    })
    for (const f of selectedFleet) {
      if (f.driver_id) {
        await supabase.from('notifications').insert({
          user_id: f.driver_id, title: 'Dispatched to Stockyard',
          body: `You have been dispatched to ${sup?.full_name ?? 'Supplier'}. Please head there on ${batchDate}.`,
          type: 'dispatch_created', ref_id: batch.id,
        })
      }
    }

    setShowBatch(false); setBatchSelected([]); setBatchNotes(''); setBatchSupplier('')
    await fetchAll()
    setBatchSaving(false)
  }

  async function assignBuyerToTruck() {
    if (!assigningTruck || !assignBuyer) return
    setAssignSaving(true)
    await supabase.from('dispatch_trucks').update({ buyer_id: assignBuyer, assigned_at: new Date().toISOString() }).eq('id', assigningTruck.id)
    const demandRow = demand.find(d => d.buyer_id === assignBuyer)
    if (demandRow) await supabase.from('buyer_demand').update({ trucks_assigned: demandRow.trucks_assigned + 1 }).eq('id', demandRow.id)
    if (assigningTruck.driver_id) {
      const buyer = buyers.find(b => b.id === assignBuyer)
      await supabase.from('notifications').insert({
        user_id: assigningTruck.driver_id, title: 'Buyer Assigned',
        body: `Delivery assigned to ${buyer?.full_name ?? 'Buyer'}. You will receive the delivery address soon.`,
        type: 'buyer_assigned', ref_id: assigningTruck.id,
      })
    }
    setAssigningTruck(null); setAssignBuyer('')
    await fetchAll()
    setAssignSaving(false)
  }

  async function logDemand() {
    if (!demandBuyer || !demandTrucks) return
    setDemandSaving(true)
    await supabase.from('buyer_demand').insert({
      trader_id: userId, buyer_id: demandBuyer, demand_date: today,
      trucks_requested: Number(demandTrucks), material_type: demandMaterial, notes: demandNotes || null,
    })
    setShowDemand(false); setDemandBuyer(''); setDemandTrucks('1'); setDemandNotes('')
    await fetchAll()
    setDemandSaving(false)
  }

  async function runGeminiSuggestion() {
    setGeminiLoading(true); setGeminiResult(null)
    const activeTrucks = batches.flatMap(b => b.dispatch_trucks ?? []).filter(t => !t.buyer_id && !['delivered'].includes(t.status))
    const availTruckData = activeTrucks.map(t => ({ truck_number: t.truck_number, driver_name: t.driver?.full_name ?? t.driver?.email ?? '?', driver_id: t.driver_id, status: t.status }))
    const demandData = demand.map(d => ({ buyer_name: d.buyer?.full_name ?? d.buyer?.email ?? '?', buyer_id: d.buyer_id, trucks_needed: d.trucks_requested - d.trucks_assigned, material_type: d.material_type })).filter(d => d.trucks_needed > 0)
    try {
      const res = await fetch('/api/suggest-assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ availableTrucks: availTruckData, buyerDemand: demandData, traderId: userId }) })
      const json = await res.json()
      setGeminiResult(json)
    } catch { /* ignore */ }
    setGeminiLoading(false)
  }

  async function acceptAllSuggestions() {
    if (!geminiResult) return
    setAcceptingSuggestion(true)
    for (const a of geminiResult.assignments) {
      const truck = batches.flatMap(b => b.dispatch_trucks ?? []).find(t => t.truck_number === a.truck_number && !t.buyer_id)
      if (!truck || !a.buyer_id) continue
      await supabase.from('dispatch_trucks').update({ buyer_id: a.buyer_id, assigned_at: new Date().toISOString() }).eq('id', truck.id)
      const demandRow = demand.find(d => d.buyer_id === a.buyer_id)
      if (demandRow) await supabase.from('buyer_demand').update({ trucks_assigned: demandRow.trucks_assigned + 1 }).eq('id', demandRow.id)
      if (truck.driver_id) {
        await supabase.from('notifications').insert({ user_id: truck.driver_id, title: 'Buyer Assigned', body: `Delivery assigned to ${a.buyer_name}. Reason: ${a.reason}`, type: 'buyer_assigned', ref_id: truck.id })
      }
    }
    setGeminiResult(null)
    await fetchAll()
    setAcceptingSuggestion(false)
  }

  if (loading) return <p className="text-sm text-sx-lo text-center py-6">Loading fleet data…</p>

  const activeTrucks    = batches.flatMap(b => b.dispatch_trucks ?? []).filter(t => t.status !== 'delivered')
  const unassignedCount = activeTrucks.filter(t => !t.buyer_id).length

  return (
    <div className="space-y-6">
      {unassignedCount > 0 && (
        <div className="bg-red-900/20 border border-sx-red rounded-2xl p-4 flex items-center gap-3">
          <span className="text-sx-red font-bold text-lg">⚠</span>
          <div>
            <p className="text-sm font-semibold text-sx-red">{unassignedCount} truck{unassignedCount > 1 ? 's' : ''} without buyer assigned</p>
            <p className="text-xs text-sx-red/70">Assign buyers immediately to avoid losses.</p>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-sx-border">
        {(['available', 'active', 'demand'] as const).map(s => (
          <button key={s} onClick={() => setSection(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition ${section === s ? 'border-sx-accent text-sx-accent' : 'border-transparent text-sx-lo hover:text-sx-hi'}`}>
            {s === 'available' ? 'Available Fleet' : s === 'active' ? 'Active Dispatches' : 'Buyer Demand'}
          </button>
        ))}
      </div>

      {/* Available Fleet */}
      {section === 'available' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-sx-lo">{fleet.length} truck{fleet.length !== 1 ? 's' : ''} available today/tomorrow</p>
            <button onClick={() => setShowBatch(true)}
              className="bg-sx-accent text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition">
              + Create Dispatch Batch
            </button>
          </div>
          {fleet.length === 0 ? (
            <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-10 text-center text-sx-lo text-sm">No trucks declared available for today or tomorrow.</div>
          ) : (
            <div className="space-y-2">
              {fleet.map(f => (
                <div key={f.id} className="bg-sx-raised border border-sx-border rounded-xl p-3 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-sx-hi text-sm">{f.truck_number}</span>
                    <span className="text-sx-lo text-xs ml-2">· {f.truck_capacity_mt} MT</span>
                    <p className="text-xs text-sx-lo mt-0.5">
                      {f.driver?.full_name ?? f.driver?.email ?? '—'} · {new Date(f.available_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <span className="text-xs bg-green-900/40 text-sx-green font-semibold px-2 py-0.5 rounded-full">Available</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Dispatches */}
      {section === 'active' && (
        <div className="space-y-4">
          {batches.length === 0 ? (
            <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-10 text-center text-sx-lo text-sm">No active dispatch batches.</div>
          ) : batches.map(b => (
            <div key={b.id} className="bg-sx-card border border-sx-border rounded-2xl px-5 py-4 space-y-3">
              <div>
                <p className="font-semibold text-sx-hi text-sm">
                  {b.supplier?.full_name ?? b.supplier?.email ?? '—'} · {new Date(b.dispatch_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                </p>
                <p className="text-xs text-sx-lo">{b.total_trucks} trucks · {b.total_capacity_mt} MT{b.notes ? ` · ${b.notes}` : ''}</p>
              </div>
              <div className="space-y-1.5">
                {(b.dispatch_trucks ?? []).map(t => (
                  <div key={t.id} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${!t.buyer_id && t.status !== 'delivered' ? 'bg-red-900/20 border border-sx-red/40' : 'bg-sx-raised border border-sx-border'}`}>
                    <div className="min-w-0">
                      <span className="font-medium text-sx-hi">{t.truck_number ?? '—'}</span>
                      <span className="text-sx-lo text-xs ml-2">· {t.driver?.full_name ?? '—'}</span>
                      {t.buyer ? (
                        <span className="text-xs text-sx-blue ml-2">→ {t.buyer.full_name ?? t.buyer.email}</span>
                      ) : (
                        <span className="text-xs text-sx-red font-semibold ml-2">UNASSIGNED</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TRUCK_STATUS_STYLES[t.status] ?? 'bg-sx-raised text-sx-lo'}`}>
                        {t.status.replace(/_/g, ' ')}
                      </span>
                      {!t.buyer_id && (
                        <button onClick={() => { setAssigningTruck(t); setAssignBuyer('') }}
                          className="text-xs bg-sx-blue text-white px-2 py-1 rounded-lg font-semibold hover:opacity-90 transition">
                          Assign
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Buyer Demand */}
      {section === 'demand' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-sx-lo">Today&apos;s demand ({today})</p>
            <div className="flex gap-2">
              <button onClick={runGeminiSuggestion} disabled={geminiLoading}
                className="border border-purple-500 text-purple-300 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-purple-900/20 disabled:opacity-50 transition">
                {geminiLoading ? 'Thinking…' : '✨ Suggest Assignments'}
              </button>
              <button onClick={() => setShowDemand(true)}
                className="border border-sx-accent text-sx-accent px-3 py-2 rounded-xl text-xs font-semibold hover:bg-orange-900/20 transition">
                + Log Demand
              </button>
            </div>
          </div>

          {geminiResult && (
            <div className="bg-purple-900/20 border border-purple-900/60 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-purple-300 text-sm">✨ AI Suggestions</p>
                <div className="flex gap-2">
                  <button onClick={acceptAllSuggestions} disabled={acceptingSuggestion}
                    className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 transition">
                    {acceptingSuggestion ? 'Applying…' : 'Accept All'}
                  </button>
                  <button onClick={() => setGeminiResult(null)} className="text-xs text-purple-400 hover:text-purple-200 transition">Dismiss</button>
                </div>
              </div>
              <div className="space-y-1.5">
                {(geminiResult.assignments ?? []).map((a, i) => (
                  <div key={i} className="bg-sx-raised rounded-xl px-3 py-2 text-sm border border-sx-border">
                    <span className="font-medium text-sx-hi">{a.truck_number}</span>
                    <span className="text-sx-lo mx-1">→</span>
                    <span className="text-sx-blue">{a.buyer_name}</span>
                    <p className="text-xs text-sx-lo mt-0.5">{a.reason}</p>
                  </div>
                ))}
                {(geminiResult.unmet_demand ?? []).length > 0 && (
                  <div className="bg-red-900/20 rounded-xl px-3 py-2 text-xs text-sx-red border border-sx-red/30">
                    Unmet: {geminiResult.unmet_demand.map(u => `${u.buyer_name} (${u.trucks_still_needed} trucks)`).join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {demand.length === 0 ? (
            <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-10 text-center text-sx-lo text-sm">No demand logged for today.</div>
          ) : (
            <div className="space-y-2">
              {demand.map(d => {
                const gap = d.trucks_requested - d.trucks_assigned
                return (
                  <div key={d.id} className="bg-sx-card border border-sx-border rounded-xl p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sx-hi text-sm">{d.buyer?.full_name ?? d.buyer?.email ?? '—'}</p>
                      <p className="text-xs text-sx-lo">
                        Requested: <strong className="text-sx-hi">{d.trucks_requested}</strong> · Assigned: <strong className="text-sx-green">{d.trucks_assigned}</strong>
                        {gap > 0 && <span className="text-sx-red font-semibold"> · Gap: {gap}</span>}
                      </p>
                    </div>
                    {gap > 0 && <span className="text-xs bg-red-900/40 text-sx-red font-bold px-2 py-1 rounded-lg">{gap} needed</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Create Batch Modal */}
      {showBatch && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-sx-card border border-sx-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sx-hi">Create Dispatch Batch</h3>
              <button onClick={() => setShowBatch(false)} className="text-sx-lo hover:text-sx-hi text-xl transition">✕</button>
            </div>
            <div>
              <label className="text-xs text-sx-lo mb-1 block">Supplier</label>
              <select value={batchSupplier} onChange={e => setBatchSupplier(e.target.value)}
                className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
                <option value="">Select supplier…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.full_name ?? s.email}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-sx-lo mb-1 block">Dispatch Date</label>
              <input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)}
                className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent" />
            </div>
            <div>
              <label className="text-xs text-sx-lo mb-1 block">Available Trucks on {batchDate} ({fleetForBatch.length} available)</label>
              {fleetForBatch.length === 0 ? (
                <p className="text-sm text-sx-lo py-2">No trucks declared for this date.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto border border-sx-border rounded-xl p-2">
                  {fleetForBatch.map(f => (
                    <label key={f.id} className="flex items-center gap-3 py-1 cursor-pointer hover:bg-sx-raised rounded-lg px-1 transition">
                      <input type="checkbox" checked={batchSelected.includes(f.id)}
                        onChange={e => setBatchSelected(prev => e.target.checked ? [...prev, f.id] : prev.filter(x => x !== f.id))}
                        className="rounded accent-sx-accent" />
                      <div>
                        <span className="text-sm font-medium text-sx-hi">{f.truck_number}</span>
                        <span className="text-xs text-sx-lo ml-2">· {f.driver?.full_name ?? f.driver?.email ?? '—'} · {f.truck_capacity_mt} MT</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {batchSelected.length > 0 && (
                <p className="text-xs text-sx-blue mt-1">{batchSelected.length} selected · {fleet.filter(f => batchSelected.includes(f.id)).reduce((s, f) => s + f.truck_capacity_mt, 0)} MT total</p>
              )}
            </div>
            <div>
              <label className="text-xs text-sx-lo mb-1 block">Notes (optional)</label>
              <input type="text" value={batchNotes} onChange={e => setBatchNotes(e.target.value)} placeholder="Special instructions…"
                className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent" />
            </div>
            {batchError && <p className="text-xs text-sx-red">{batchError}</p>}
            <button onClick={createBatch} disabled={batchSaving || batchSelected.length === 0}
              className="w-full bg-sx-accent text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition">
              {batchSaving ? 'Creating…' : 'Create Batch & Notify'}
            </button>
          </div>
        </div>
      )}

      {/* Assign Buyer Modal */}
      {assigningTruck && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-sx-card border border-sx-border rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sx-hi">Assign Buyer — {assigningTruck.truck_number}</h3>
              <button onClick={() => setAssigningTruck(null)} className="text-sx-lo hover:text-sx-hi text-xl transition">✕</button>
            </div>
            <select value={assignBuyer} onChange={e => setAssignBuyer(e.target.value)}
              className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
              <option value="">Select buyer…</option>
              {buyers.map(b => {
                const d = demand.find(x => x.buyer_id === b.id)
                const gap = d ? d.trucks_requested - d.trucks_assigned : 0
                return <option key={b.id} value={b.id}>{b.full_name ?? b.email}{gap > 0 ? ` (needs ${gap})` : ''}</option>
              })}
            </select>
            <button onClick={assignBuyerToTruck} disabled={assignSaving || !assignBuyer}
              className="w-full bg-sx-blue text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition">
              {assignSaving ? 'Assigning…' : 'Confirm Assignment'}
            </button>
          </div>
        </div>
      )}

      {/* Log Demand Modal */}
      {showDemand && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-sx-card border border-sx-border rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sx-hi">Log Buyer Demand</h3>
              <button onClick={() => setShowDemand(false)} className="text-sx-lo hover:text-sx-hi text-xl transition">✕</button>
            </div>
            <div>
              <label className="text-xs text-sx-lo mb-1 block">Buyer</label>
              <select value={demandBuyer} onChange={e => setDemandBuyer(e.target.value)}
                className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
                <option value="">Select buyer…</option>
                {buyers.map(b => <option key={b.id} value={b.id}>{b.full_name ?? b.email}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-sx-lo mb-1 block">Trucks Requested</label>
              <input type="number" min={1} value={demandTrucks} onChange={e => setDemandTrucks(e.target.value)}
                className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent" />
            </div>
            <div>
              <label className="text-xs text-sx-lo mb-1 block">Material</label>
              <input type="text" value={demandMaterial} onChange={e => setDemandMaterial(e.target.value)}
                className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent" />
            </div>
            <div>
              <label className="text-xs text-sx-lo mb-1 block">Notes</label>
              <input type="text" value={demandNotes} onChange={e => setDemandNotes(e.target.value)} placeholder="Optional…"
                className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent" />
            </div>
            <button onClick={logDemand} disabled={demandSaving || !demandBuyer}
              className="w-full bg-sx-accent text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition">
              {demandSaving ? 'Logging…' : 'Log Demand'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
