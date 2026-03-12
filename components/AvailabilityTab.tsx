'use client'

import { useState, useEffect, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'

type FleetAvailability = {
  id: string
  truck_number: string
  truck_capacity_mt: number
  available_date: string
  declared_at: string
  status: string
  notes: string | null
}

const STATUS_STYLES: Record<string, string> = {
  available:  'bg-green-900/40 text-sx-green',
  assigned:   'bg-blue-900/40 text-sx-blue',
  dispatched: 'bg-purple-900/40 text-purple-300',
  completed:  'bg-sx-raised text-sx-lo',
  cancelled:  'bg-red-900/40 text-sx-red',
}

const INPUT = 'w-full bg-sx-raised border border-sx-border rounded-xl px-3 py-3 text-sm text-sx-hi placeholder-sx-lo focus:outline-none focus:ring-2 focus:ring-sx-accent'

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export default function AvailabilityTab({
  userId,
  supabase,
  profile,
}: {
  userId: string
  supabase: SupabaseClient
  profile: { truck_number?: string | null; truck_capacity_mt?: number | null } | null
}) {
  const [declarations, setDeclarations] = useState<FleetAvailability[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const [date,     setDate]     = useState(tomorrow())
  const [truck,    setTruck]    = useState(profile?.truck_number ?? '')
  const [capacity, setCapacity] = useState(String(profile?.truck_capacity_mt ?? 24))
  const [notes,    setNotes]    = useState('')
  const [error,    setError]    = useState('')

  const fetchDeclarations = useCallback(async () => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 1)
    const { data } = await supabase
      .from('fleet_availability')
      .select('*')
      .eq('driver_id', userId)
      .gte('available_date', cutoff.toISOString().split('T')[0])
      .order('available_date', { ascending: true })
    setDeclarations((data as FleetAvailability[]) ?? [])
    setLoading(false)
  }, [userId, supabase])

  useEffect(() => { fetchDeclarations() }, [fetchDeclarations])

  async function submit() {
    if (!date || !truck) { setError('Date and truck number are required.'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('fleet_availability').insert({
      driver_id:         userId,
      truck_number:      truck.trim().toUpperCase(),
      truck_capacity_mt: Number(capacity) || 24,
      available_date:    date,
      notes:             notes.trim() || null,
    })
    if (err) setError(err.message)
    else { setNotes(''); await fetchDeclarations() }
    setSaving(false)
  }

  async function cancel(id: string) {
    setCancelling(id)
    await supabase.from('fleet_availability').update({ status: 'cancelled' }).eq('id', id)
    await fetchDeclarations()
    setCancelling(null)
  }

  return (
    <div className="space-y-6">
      {/* Form */}
      <div className="bg-sx-card border border-sx-border rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold text-sx-hi">Declare Availability</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-sx-lo mb-2 block uppercase tracking-wide">Date</label>
            <input type="date" value={date} min={tomorrow()}
              onChange={e => setDate(e.target.value)}
              className={INPUT} />
          </div>
          <div>
            <label className="text-xs text-sx-lo mb-2 block uppercase tracking-wide">Capacity (MT)</label>
            <input type="number" value={capacity} min={1} max={100}
              onChange={e => setCapacity(e.target.value)}
              className={INPUT} />
          </div>
        </div>
        <div>
          <label className="text-xs text-sx-lo mb-2 block uppercase tracking-wide">Truck Number</label>
          <input type="text" value={truck} placeholder="e.g. GJ05AB1234"
            onChange={e => setTruck(e.target.value)}
            className={INPUT + ' uppercase'} />
        </div>
        <div>
          <label className="text-xs text-sx-lo mb-2 block uppercase tracking-wide">Notes (optional)</label>
          <input type="text" value={notes} placeholder="e.g. Available from 8 AM"
            onChange={e => setNotes(e.target.value)}
            className={INPUT} />
        </div>
        {error && <p className="text-xs text-sx-red bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
        <button onClick={submit} disabled={saving}
          className="w-full bg-sx-accent text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition">
          {saving ? 'Declaring…' : 'Declare Availability'}
        </button>
      </div>

      {/* List */}
      <div>
        <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">Upcoming Declarations</h3>
        {loading ? (
          <p className="text-sm text-sx-lo text-center py-6">Loading…</p>
        ) : declarations.length === 0 ? (
          <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-10 text-center text-sx-lo text-sm">
            No declarations yet.
          </div>
        ) : (
          <div className="space-y-3">
            {declarations.map(d => (
              <div key={d.id} className="bg-sx-card border border-sx-border rounded-2xl px-5 py-4 flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sx-hi text-sm">{d.truck_number}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[d.status] ?? 'bg-sx-raised text-sx-lo'}`}>
                      {d.status}
                    </span>
                  </div>
                  <p className="text-xs text-sx-lo">
                    {new Date(d.available_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' · '}{d.truck_capacity_mt} MT
                  </p>
                  {d.notes && <p className="text-xs text-sx-lo">{d.notes}</p>}
                </div>
                {d.status === 'available' && (
                  <button onClick={() => cancel(d.id)} disabled={cancelling === d.id}
                    className="text-xs text-sx-red hover:opacity-80 font-medium shrink-0 disabled:opacity-50 transition">
                    {cancelling === d.id ? '…' : 'Cancel'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
