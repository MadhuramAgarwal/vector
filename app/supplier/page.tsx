'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import IncomingTrucksSection from '@/components/IncomingTrucksSection'
import BillingView from '@/components/BillingView'

const STATUS_STYLES: Record<string, string> = {
  pending:    'bg-amber-900/40 text-sx-amber',
  confirmed:  'bg-blue-900/40 text-sx-blue',
  loading:    'bg-purple-900/40 text-purple-300',
  loaded:     'bg-indigo-900/40 text-indigo-300',
  in_transit: 'bg-orange-900/40 text-sx-accent',
  delivered:  'bg-green-900/40 text-sx-green',
  cancelled:  'bg-red-900/40 text-sx-red',
  declined:   'bg-red-900/40 text-sx-red',
}

type Trip = {
  id: string
  status: string
  quantity_mt: number
  created_at: string
  supplier_accepted: boolean | null
  driver_accepted:   boolean | null
  supplier_rate_per_mt: number | null
  supplier_amount: number | null
  order: {
    material_type: string
    delivery_address: string
    scheduled_date: string
    trader_id: string | null
  } | null
  driver: { full_name: string | null; email: string } | null
}

const TABS = [
  { id: 'trips',    label: 'Trips',    icon: '📦' },
  { id: 'incoming', label: 'Incoming', icon: '🚛' },
  { id: 'earnings', label: 'Earnings', icon: '₹' },
]

/** Return the last 1–2 words of an address as a zone, hiding full address. */
function toZone(address: string | undefined | null): string {
  if (!address) return '—'
  const parts = address.trim().split(/[\s,]+/).filter(Boolean)
  if (parts.length <= 2) return parts.join(' ')
  return parts.slice(-2).join(' ')
}

export default function SupplierDashboard() {
  const router   = useRouter()
  const supabase = createClient()

  const [userId, setUserId]       = useState<string | null>(null)
  const [trips, setTrips]         = useState<Trip[]>([])
  const [loading, setLoading]     = useState(true)
  const [updating, setUpdating]   = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'trips' | 'incoming' | 'earnings'>('trips')

  const fetchTrips = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('trips')
      .select('*, order:orders(material_type, delivery_address, scheduled_date, trader_id), driver:users!trips_driver_id_fkey(full_name, email)')
      .eq('supplier_id', uid)
      .order('created_at', { ascending: false })
    setTrips((data as Trip[]) ?? [])
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)
      await fetchTrips(user.id)
      setLoading(false)
    }
    init()
  }, [])

  async function handleAccept(tripId: string, accepted: boolean, traderId: string | null) {
    setUpdating(tripId)
    const update: Record<string, unknown> = { supplier_accepted: accepted }
    if (!accepted) update.status = 'declined'

    await supabase.from('trips').update(update).eq('id', tripId)

    if (traderId) {
      await supabase.from('notifications').insert({
        user_id: traderId,
        title:   accepted ? 'Supplier Accepted Trip' : 'Supplier Declined Trip',
        body:    accepted
          ? 'The supplier has accepted the trip assignment.'
          : 'The supplier declined the trip. Please reassign.',
        type:    accepted ? 'trip_accepted' : 'trip_declined',
        ref_id:  tripId,
      })
    }

    if (userId) await fetchTrips(userId)
    setUpdating(null)
  }

  async function updateStatus(tripId: string, newStatus: string) {
    setUpdating(tripId)
    await supabase.from('trips').update({ status: newStatus }).eq('id', tripId)
    if (userId) await fetchTrips(userId)
    setUpdating(null)
  }

  if (loading) return (
    <div className="min-h-screen bg-sx-base flex items-center justify-center text-sx-lo text-sm">
      Loading…
    </div>
  )

  const pending = trips.filter(t => t.status === 'confirmed' && t.supplier_accepted === null)
  const active  = trips.filter(t => !['delivered', 'cancelled', 'declined'].includes(t.status) && t.supplier_accepted !== null)
  const done    = trips.filter(t => ['delivered', 'cancelled', 'declined'].includes(t.status))

  let content: React.ReactNode

  if (activeTab === 'earnings') {
    content = userId
      ? <BillingView userId={userId} role="supplier" />
      : null
  } else if (activeTab === 'incoming') {
    content = (
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest">
          Incoming Dispatch Batches
        </h3>
        {userId && (
          <IncomingTrucksSection userId={userId} supabase={supabase} />
        )}
      </div>
    )
  } else {
    content = (
      <div className="space-y-8 pb-24 pt-16">
        {pending.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">
              New Assignments{' '}
              <span className="text-sx-accent">({pending.length})</span>
            </h3>
            <div className="space-y-3">
              {pending.map(t => (
                <TripCard key={t.id} trip={t} updating={updating}
                  onAccept={handleAccept} onUpdate={updateStatus} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">
            Active Trips{' '}
            <span className="text-sx-accent">({active.length})</span>
          </h3>
          {active.length === 0 ? (
            <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-10 text-center text-sx-lo text-sm">
              No active trips.
            </div>
          ) : (
            <div className="space-y-3">
              {active.map(t => (
                <TripCard key={t.id} trip={t} updating={updating}
                  onAccept={handleAccept} onUpdate={updateStatus} />
              ))}
            </div>
          )}
        </section>

        {done.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">
              Completed / Declined
            </h3>
            <div className="space-y-3">
              {done.map(t => (
                <TripCard key={t.id} trip={t} updating={updating}
                  onAccept={handleAccept} onUpdate={updateStatus} />
              ))}
            </div>
          </section>
        )}
      </div>
    )
  }

  return (
    <AppShell
      role="supplier"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={id => setActiveTab(id as typeof activeTab)}
      userId={userId}
      supabase={supabase}
    >
      {content}
    </AppShell>
  )
}

// ─── TripCard ─────────────────────────────────────────────────────────────────

function TripCard({ trip, updating, onAccept, onUpdate }: {
  trip: Trip
  updating: string | null
  onAccept: (id: string, accepted: boolean, traderId: string | null) => void
  onUpdate: (id: string, s: string) => void
}) {
  const busy              = updating === trip.id
  const awaitingResponse  = trip.status === 'confirmed' && trip.supplier_accepted === null

  // Privacy wall: show only zone (last 1-2 words) of delivery address
  const zone = toZone(trip.order?.delivery_address)

  return (
    <div className="bg-sx-card border border-sx-border rounded-2xl p-5 space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-semibold text-sx-hi">
            {trip.order?.material_type ?? '—'}
          </span>
          <span className="text-sx-lo text-sm ml-2">· {trip.quantity_mt} MT</span>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize whitespace-nowrap ${STATUS_STYLES[trip.status] ?? 'bg-sx-raised text-sx-lo'}`}>
          {trip.status === 'declined' ? 'Declined' : trip.status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Trip details — no buyer info exposed */}
      <div className="text-sm space-y-1">
        <p>
          <span className="text-sx-lo">Zone: </span>
          <span className="text-sx-hi">{zone}</span>
        </p>
        <p>
          <span className="text-sx-lo">Driver: </span>
          <span className="font-medium text-sx-hi">
            {trip.driver?.full_name ?? trip.driver?.email ?? '—'}
          </span>
        </p>
        {trip.order?.scheduled_date && (
          <p>
            <span className="text-sx-lo">Date: </span>
            <span className="text-sx-hi">
              {new Date(trip.order.scheduled_date + 'T00:00:00').toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
            </span>
          </p>
        )}
      </div>

      {/* Rate box (read-only — set by trader) */}
      {trip.supplier_rate_per_mt != null && (
        <div className="bg-sx-raised border border-sx-border rounded-xl p-3 flex items-center justify-between">
          <div>
            <span className="text-xs text-sx-lo">Your rate: </span>
            <span className="font-semibold text-sx-accent">₹{trip.supplier_rate_per_mt}/MT</span>
            {trip.supplier_amount != null && (
              <span className="text-xs text-sx-lo ml-1">
                · Total: ₹{trip.supplier_amount.toLocaleString('en-IN')}
              </span>
            )}
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-900/40 text-sx-green">
            Confirmed
          </span>
        </div>
      )}

      {/* Accept / Decline */}
      {awaitingResponse && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-sx-lo">You have been assigned this trip. Do you accept?</p>
          <div className="flex gap-2">
            <button
              onClick={() => onAccept(trip.id, true, trip.order?.trader_id ?? null)}
              disabled={busy}
              className="flex-1 bg-sx-green text-sx-base rounded-xl py-3 text-sm font-semibold disabled:opacity-50 transition"
            >
              {busy ? '…' : 'Accept'}
            </button>
            <button
              onClick={() => onAccept(trip.id, false, trip.order?.trader_id ?? null)}
              disabled={busy}
              className="flex-1 bg-sx-red text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50 transition"
            >
              {busy ? '…' : 'Decline'}
            </button>
          </div>
        </div>
      )}

      {/* Work buttons */}
      {trip.supplier_accepted === true && trip.status === 'confirmed' && (
        <button
          onClick={() => onUpdate(trip.id, 'loading')}
          disabled={busy}
          className="w-full bg-purple-900/40 text-purple-300 border border-purple-900/60 rounded-xl py-3 text-sm font-semibold disabled:opacity-50 transition"
        >
          {busy ? 'Updating…' : 'Mark Ready to Load'}
        </button>
      )}
      {trip.supplier_accepted === true && trip.status === 'loading' && (
        <button
          onClick={() => onUpdate(trip.id, 'loaded')}
          disabled={busy}
          className="w-full bg-indigo-900/40 text-indigo-300 border border-indigo-900/60 rounded-xl py-3 text-sm font-semibold disabled:opacity-50 transition"
        >
          {busy ? 'Updating…' : 'Mark Loaded'}
        </button>
      )}

      {/* Declined notice */}
      {trip.supplier_accepted === false && (
        <p className="text-xs text-sx-red bg-red-900/20 border border-red-900/40 rounded-xl px-3 py-2">
          You declined this trip.
        </p>
      )}
    </div>
  )
}
