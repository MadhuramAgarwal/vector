'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import BillingView from '@/components/BillingView'

// ─── Constants ────────────────────────────────────────────────────────────────

const MATERIALS = ['Ordinary Sand', 'River Sand', 'M-Sand']

const TABS = [
  { id: 'today',    label: 'Today',    icon: '🏠' },
  { id: 'orders',   label: 'Orders',   icon: '📋' },
  { id: 'payments', label: 'Payments', icon: '₹' },
]

const STATUS_STYLES: Record<string, string> = {
  pending:     'bg-amber-900/40 text-sx-amber',
  confirmed:   'bg-blue-900/40 text-sx-blue',
  in_progress: 'bg-orange-900/40 text-sx-accent',
  completed:   'bg-green-900/40 text-sx-green',
  cancelled:   'bg-red-900/40 text-sx-red',
}

const TIMELINE = ['Order Placed', 'Confirmed', 'Loading', 'In Transit', 'Delivered']

const emptyForm = {
  material_type: 'Ordinary Sand',
  quantity_mt: '',
  scheduled_date: '',
  special_instructions: '',
}

// ─── Types ────────────────────────────────────────────────────────────────────

type WeightSlip = {
  id: string
  wb_type: string
  net_weight: number | null
  wb1_weight: number | null
  wb2_weight: number | null
  image_url: string
  extracted: Record<string, unknown> | null
}

type Trip = {
  id: string
  status: string
  truck_number: string | null
  weight_slips: WeightSlip[]
  royalty_passes: { id: string; extracted: Record<string, unknown> | null }[]
  driver: { full_name: string | null } | null
}

type Challan = {
  id: string
  pdf_url: string | null
  net_weight: number | null
  material_type: string | null
  buyer_confirmed: boolean
  trader_approved: boolean
}

type Order = {
  id: string
  material_type: string
  quantity_mt: number
  delivery_address: string
  scheduled_date: string
  status: string
  special_instructions: string | null
  created_at: string
  trader_id: string | null
  trips: Trip[]
  challans: Challan[]
}

type AvailTruck = {
  id: string
  truck_number: string
  capacity_mt: number
  instant_rate_per_mt: number | null
  batch: { dispatch_date: string }[] | null
}

type TraderPing = {
  id: string
  truck_id: string | null
  quantity_mt: number | null
  response: string
  created_at: string
  notes: string | null
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function getStep(order: Order): number {
  const trip = order.trips?.[0]
  if (!trip) {
    if (order.status === 'pending')   return 0
    if (order.status === 'confirmed') return 1
    return 0
  }
  if (trip.status === 'delivered')  return 4
  if (trip.status === 'in_transit') return 3
  if (['loading', 'loaded'].includes(trip.status)) return 2
  return 1
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BuyerDashboard() {
  const router   = useRouter()
  const supabase = createClient()

  const [userId, setUserId]             = useState<string | null>(null)
  const [buyerAddress, setBuyerAddress] = useState('')
  const [buyerLat, setBuyerLat]         = useState<number | null>(null)
  const [buyerLng, setBuyerLng]         = useState<number | null>(null)
  const [orders, setOrders]             = useState<Order[]>([])
  const [form, setForm]                 = useState(emptyForm)
  const [submitting, setSubmitting]     = useState(false)
  const [formError, setFormError]       = useState('')
  const [formSuccess, setFormSuccess]   = useState(false)
  const [showForm, setShowForm]         = useState(false)
  const [loading, setLoading]           = useState(true)
  const [activeTab, setActiveTab]       = useState('today')

  // Today tab state
  const [availTrucks, setAvailTrucks]   = useState<AvailTruck[]>([])
  const [traderPings, setTraderPings]   = useState<TraderPing[]>([])
  const [todayLoading, setTodayLoading] = useState(true)

  const fetchOrders = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        trips(
          id, status, truck_number,
          driver:users!trips_driver_id_fkey(full_name),
          weight_slips(*),
          royalty_passes(id, extracted)
        ),
        challans(*)
      `)
      .eq('buyer_id', uid)
      .order('created_at', { ascending: false })
    setOrders((data as Order[]) ?? [])
  }, [])

  const fetchTodayData = useCallback(async (uid: string) => {
    setTodayLoading(true)
    const [{ data: trucks }, { data: pings }] = await Promise.all([
      supabase
        .from('dispatch_trucks')
        .select('id, truck_number, capacity_mt, instant_rate_per_mt, batch:dispatch_batches(dispatch_date)')
        .eq('instant_available', true)
        .is('buyer_id', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('buyer_responses')
        .select('*')
        .eq('buyer_id', uid)
        .eq('response', 'pending'),
    ])
    setAvailTrucks((trucks as unknown as AvailTruck[]) ?? [])
    setTraderPings((pings as TraderPing[]) ?? [])
    setTodayLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('users')
        .select('address, lat, lng')
        .eq('id', user.id)
        .single()
      if (profile?.address) setBuyerAddress(profile.address)
      if (profile?.lat)     setBuyerLat(profile.lat)
      if (profile?.lng)     setBuyerLng(profile.lng)

      await Promise.all([fetchOrders(user.id), fetchTodayData(user.id)])
      setLoading(false)

      const channel = supabase.channel('buyer-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders',
            filter: `buyer_id=eq.${user.id}` }, () => fetchOrders(user.id))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' },
            () => fetchOrders(user.id))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'challans' },
            () => fetchOrders(user.id))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'weight_slips' },
            () => fetchOrders(user.id))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_trucks' },
            () => fetchTodayData(user.id))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'buyer_responses',
            filter: `buyer_id=eq.${user.id}` }, () => fetchTodayData(user.id))
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    }
    init()
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    if (!userId) return
    setSubmitting(true)

    const { error } = await supabase.from('orders').insert({
      buyer_id:             userId,
      material_type:        form.material_type,
      quantity_mt:          parseFloat(form.quantity_mt),
      delivery_address:     buyerAddress,
      delivery_lat:         buyerLat,
      delivery_lng:         buyerLng,
      scheduled_date:       form.scheduled_date,
      special_instructions: form.special_instructions || null,
      status:               'pending',
    })

    setSubmitting(false)
    if (error) { setFormError(error.message); return }

    setForm(emptyForm)
    setFormSuccess(true)
    setShowForm(false)
    setTimeout(() => setFormSuccess(false), 3000)
    await fetchOrders(userId)
  }

  if (loading) return (
    <div className="min-h-screen bg-sx-base flex items-center justify-center text-sx-lo">
      Loading…
    </div>
  )

  // Active deliveries for Today tab (in_transit or loaded trips)
  const activeDeliveries = orders.filter(o =>
    o.trips?.some(t => ['in_transit', 'loaded', 'loading'].includes(t.status))
  )

  return (
    <AppShell
      role="buyer"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      userId={userId}
      supabase={supabase}
    >
      {/* ── TODAY TAB ── */}
      {activeTab === 'today' && (
        <div className="space-y-6">

          {/* Instant Available Trucks */}
          <section className="space-y-3">
            <h2 className="text-xs font-semibold text-sx-lo uppercase tracking-widest">
              Available Trucks
            </h2>
            {todayLoading ? (
              <div className="text-sx-lo text-sm py-4 text-center">Loading…</div>
            ) : availTrucks.length === 0 ? (
              <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-8 text-center text-sx-lo text-sm">
                No trucks available right now. Check back soon.
              </div>
            ) : (
              <div className="space-y-3">
                {availTrucks.map(truck => (
                  <InstantTruckCard
                    key={truck.id}
                    truck={truck}
                    userId={userId!}
                    onBooked={() => userId && fetchTodayData(userId)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Trader Pings */}
          {traderPings.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold text-sx-lo uppercase tracking-widest">
                Trader is Offering Sand
              </h2>
              <div className="space-y-3">
                {traderPings.map(ping => (
                  <TraderPingCard
                    key={ping.id}
                    ping={ping}
                    userId={userId!}
                    onResponded={() => userId && fetchTodayData(userId)}
                  />
                ))}
            </div>
            </section>
          )}

          {/* Active Deliveries */}
          <section className="space-y-3">
            <h2 className="text-xs font-semibold text-sx-lo uppercase tracking-widest">
              Active Deliveries
            </h2>
            {activeDeliveries.length === 0 ? (
              <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-8 text-center text-sx-lo text-sm">
                No active deliveries right now.
              </div>
            ) : (
              <div className="space-y-3">
                {activeDeliveries.map(order => {
                  const trip = order.trips?.find(t =>
                    ['in_transit', 'loaded', 'loading'].includes(t.status)
                  )
                  if (!trip) return null
                  return (
                    <div key={order.id} className="bg-sx-card border border-sx-border rounded-2xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sx-hi">{order.material_type}</p>
                          <p className="text-xs text-sx-lo mt-0.5">{order.quantity_mt} MT · Sand Source: Surat Stockyard</p>
                        </div>
                        <TripStatusBadge status={trip.status} />
                      </div>
                      {trip.truck_number && (
                        <p className="text-xs text-sx-lo">Truck: <span className="text-sx-hi font-medium">{trip.truck_number}</span></p>
                      )}
                      <p className="text-xs text-sx-lo">{order.delivery_address}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── ORDERS TAB ── */}
      {activeTab === 'orders' && (
        <div className="space-y-5">

          {formSuccess && (
            <div className="bg-green-900/40 border border-green-900/60 text-sx-green text-sm px-4 py-3 rounded-xl">
              Order placed successfully!
            </div>
          )}

          {/* New Order collapsible */}
          <div className="bg-sx-card border border-sx-border rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowForm(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <span className="font-semibold text-sx-hi">Place New Order</span>
              <span className={`text-xl leading-none transition-transform ${showForm ? 'text-sx-accent rotate-45' : 'text-sx-accent'}`}>+</span>
            </button>

            {showForm && (
              <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4 border-t border-sx-border pt-4">

                <div>
                  <label className="block text-xs font-semibold text-sx-lo uppercase tracking-wide mb-1.5">
                    Material Type
                  </label>
                  <select
                    value={form.material_type}
                    onChange={e => setForm(f => ({ ...f, material_type: e.target.value }))}
                    className="w-full border border-sx-border bg-sx-raised text-sx-hi rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent"
                  >
                    {MATERIALS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-sx-lo uppercase tracking-wide mb-1.5">
                    Quantity (MT)
                  </label>
                  <input
                    type="number" min="0.1" step="0.1" required
                    placeholder="e.g. 10"
                    value={form.quantity_mt}
                    onChange={e => setForm(f => ({ ...f, quantity_mt: e.target.value }))}
                    className="w-full border border-sx-border bg-sx-raised text-sx-hi rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent placeholder:text-sx-lo"
                  />
                </div>

                {buyerAddress && (
                  <div className="bg-sx-raised border border-sx-border rounded-xl px-3 py-2.5 text-xs text-sx-lo">
                    <span className="font-semibold text-sx-hi">Delivering to:</span>{' '}
                    {buyerAddress}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-sx-lo uppercase tracking-wide mb-1.5">
                    Scheduled Date
                  </label>
                  <input
                    type="date" required
                    min={new Date().toISOString().split('T')[0]}
                    value={form.scheduled_date}
                    onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
                    className="w-full border border-sx-border bg-sx-raised text-sx-hi rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-sx-lo uppercase tracking-wide mb-1.5">
                    Special Instructions <span className="text-sx-lo font-normal normal-case">(optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Any special instructions…"
                    value={form.special_instructions}
                    onChange={e => setForm(f => ({ ...f, special_instructions: e.target.value }))}
                    className="w-full border border-sx-border bg-sx-raised text-sx-hi rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent resize-none placeholder:text-sx-lo"
                  />
                </div>

                {formError && (
                  <p className="text-sm text-sx-red">{formError}</p>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="submit" disabled={submitting}
                    className="flex-1 bg-sx-accent text-white rounded-xl py-3 font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition"
                  >
                    {submitting ? 'Placing Order…' : 'Place Order'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setForm(emptyForm); setFormError('') }}
                    className="px-4 py-3 text-sm text-sx-lo hover:text-sx-hi border border-sx-border rounded-xl transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Orders list */}
          <div>
            <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">
              Your Orders
            </h3>
            {orders.length === 0 ? (
              <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-10 text-center text-sx-lo text-sm">
                No orders yet. Place your first order above.
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    userId={userId!}
                    onRefresh={() => userId && fetchOrders(userId)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PAYMENTS TAB ── */}
      {activeTab === 'payments' && userId && (
        <BillingView userId={userId} role="buyer" />
      )}
    </AppShell>
  )
}

// ─── InstantTruckCard ─────────────────────────────────────────────────────────

function InstantTruckCard({
  truck, userId, onBooked,
}: {
  truck: AvailTruck
  userId: string
  onBooked: () => void
}) {
  const supabase = createClient()
  const [qty, setQty]         = useState(truck.capacity_mt)
  const [open, setOpen]       = useState(false)
  const [booking, setBooking] = useState(false)
  const [error, setError]     = useState('')

  async function handleBook() {
    setBooking(true)
    setError('')
    try {
      const { error: err } = await supabase.from('buyer_responses').insert({
        buyer_id:    userId,
        truck_id:    truck.id,
        response:    'yes',
        quantity_mt: qty,
      })
      if (err) throw err

      // Notify trader — best-effort, ignore errors
      try {
        await supabase.from('notifications').insert({
          user_id: null,   // trader_id resolved server-side or via trigger
          title:   'Buyer booked an instant truck',
          body:    `A buyer has booked truck ${truck.truck_number} for ${qty} MT.`,
          type:    'instant_truck_booked',
          ref_id:  truck.id,
        })
      } catch {/* non-fatal */}

      onBooked()
      setOpen(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Booking failed')
    }
    setBooking(false)
  }

  return (
    <div className="bg-sx-card border border-sx-border rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-sx-hi">River Sand</p>
          <p className="text-xs text-sx-lo mt-0.5">
            {truck.capacity_mt} MT available · Truck {truck.truck_number}
          </p>
        </div>
        <div className="text-right shrink-0">
          {truck.instant_rate_per_mt != null && (
            <p className="text-sx-accent font-bold">₹{truck.instant_rate_per_mt.toLocaleString('en-IN')}/MT</p>
          )}
          <p className="text-xs text-sx-lo">ETA ~2 hours</p>
        </div>
      </div>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full bg-sx-accent text-white rounded-xl py-3 font-semibold text-sm hover:opacity-90 transition"
        >
          Order Now
        </button>
      ) : (
        <div className="space-y-3 border-t border-sx-border pt-4">
          <div>
            <label className="text-xs font-semibold text-sx-lo uppercase tracking-wide block mb-2">
              Quantity (MT) — max {truck.capacity_mt} MT
            </label>
            <input
              type="range"
              min={1}
              max={truck.capacity_mt}
              step={0.5}
              value={qty}
              onChange={e => setQty(parseFloat(e.target.value))}
              className="w-full accent-sx-accent"
            />
            <div className="flex justify-between text-xs text-sx-lo mt-1">
              <span>1 MT</span>
              <span className="text-sx-hi font-semibold">{qty} MT selected</span>
              <span>{truck.capacity_mt} MT</span>
            </div>
          </div>

          {truck.instant_rate_per_mt != null && (
            <p className="text-xs text-sx-lo">
              Total estimate:{' '}
              <span className="text-sx-accent font-bold">
                ₹{(qty * truck.instant_rate_per_mt).toLocaleString('en-IN')}
              </span>
            </p>
          )}

          {error && <p className="text-xs text-sx-red">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleBook}
              disabled={booking}
              className="flex-1 bg-sx-accent text-white rounded-xl py-3 font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition"
            >
              {booking ? 'Confirming…' : `Confirm ${qty} MT`}
            </button>
            <button
              onClick={() => { setOpen(false); setError('') }}
              className="px-4 py-3 text-sm text-sx-lo hover:text-sx-hi border border-sx-border rounded-xl transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TraderPingCard ───────────────────────────────────────────────────────────

function TraderPingCard({
  ping, userId, onResponded,
}: {
  ping: TraderPing
  userId: string
  onResponded: () => void
}) {
  const supabase = createClient()
  const [qty, setQty]           = useState(5)
  const [showQty, setShowQty]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  async function handleYes() {
    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase
        .from('buyer_responses')
        .update({ response: 'yes', quantity_mt: qty })
        .eq('id', ping.id)
      if (err) throw err
      onResponded()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to respond')
    }
    setSaving(false)
  }

  async function handleNo() {
    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase
        .from('buyer_responses')
        .update({ response: 'no' })
        .eq('id', ping.id)
      if (err) throw err
      onResponded()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to respond')
    }
    setSaving(false)
  }

  return (
    <div className="bg-sx-card border border-sx-border rounded-2xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-sx-accent/20 flex items-center justify-center shrink-0">
          <span className="text-lg">📦</span>
        </div>
        <div>
          <p className="font-semibold text-sx-hi text-sm">Trader is offering sand</p>
          <p className="text-xs text-sx-lo mt-0.5">
            {ping.notes ?? 'A sand load is available for you — want some?'}
          </p>
        </div>
      </div>

      {!showQty ? (
        <div className="flex gap-2">
          <button
            onClick={() => setShowQty(true)}
            disabled={saving}
            className="flex-1 bg-sx-accent text-white rounded-xl py-3 font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition"
          >
            Yes, I want sand
          </button>
          <button
            onClick={handleNo}
            disabled={saving}
            className="flex-1 border border-sx-border text-sx-lo rounded-xl py-3 text-sm hover:bg-sx-raised disabled:opacity-50 transition"
          >
            No thanks
          </button>
        </div>
      ) : (
        <div className="space-y-3 border-t border-sx-border pt-3">
          <label className="text-xs font-semibold text-sx-lo uppercase tracking-wide block">
            How much do you want?
          </label>
          <input
            type="range" min={1} max={50} step={0.5}
            value={qty}
            onChange={e => setQty(parseFloat(e.target.value))}
            className="w-full accent-sx-accent"
          />
          <div className="flex justify-between text-xs text-sx-lo">
            <span>1 MT</span>
            <span className="text-sx-hi font-semibold">{qty} MT selected</span>
            <span>50 MT</span>
          </div>
          {error && <p className="text-xs text-sx-red">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleYes}
              disabled={saving}
              className="flex-1 bg-sx-accent text-white rounded-xl py-3 font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition"
            >
              {saving ? 'Sending…' : `Confirm ${qty} MT`}
            </button>
            <button
              onClick={() => { setShowQty(false); setError('') }}
              className="px-4 py-3 text-sm text-sx-lo hover:text-sx-hi border border-sx-border rounded-xl transition"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TripStatusBadge ──────────────────────────────────────────────────────────

function TripStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    loading:    'bg-amber-900/40 text-sx-amber',
    loaded:     'bg-blue-900/40 text-sx-blue',
    in_transit: 'bg-orange-900/40 text-sx-accent',
    delivered:  'bg-green-900/40 text-sx-green',
  }
  const labels: Record<string, string> = {
    loading:    'Loading',
    loaded:     'Loaded',
    in_transit: 'In Transit',
    delivered:  'Delivered',
  }
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${styles[status] ?? 'bg-sx-raised text-sx-lo'}`}>
      {labels[status] ?? status}
    </span>
  )
}

// ─── OrderCard ────────────────────────────────────────────────────────────────

function OrderCard({
  order, userId, onRefresh,
}: {
  order: Order
  userId: string
  onRefresh: () => void
}) {
  const supabase = createClient()
  const step      = getStep(order)
  const cancelled = order.status === 'cancelled'
  const trip      = order.trips?.[0] ?? null
  const challan   = order.challans?.[0] ?? null

  const wb1Slip = trip?.weight_slips?.find(w => w.wb_type === 'wb1') ?? null
  const wb2Slip = trip?.weight_slips?.find(w => w.wb_type === 'wb2') ?? null

  const [uploadingWB2, setUploadingWB2]         = useState(false)
  const [wb2Error, setWb2Error]                 = useState('')
  const [generatingChallan, setGeneratingChallan] = useState(false)
  const [challanError, setChallanError]           = useState('')
  const wb2Ref = useRef<HTMLInputElement>(null)

  async function handleWB2Upload(file: File) {
    if (!trip) return
    setUploadingWB2(true)
    setWb2Error('')
    try {
      const ext      = file.name.split('.').pop()
      const filename = `wb2-${trip.id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(filename, file, { upsert: true })
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filename)

      const base64 = await fileToBase64(file)
      const extractRes = await fetch('/api/extract-document', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ imageBase64: base64, mimeType: file.type, documentType: 'weight_slip' }),
      })
      const { extracted } = await extractRes.json()

      const grossKg = Number(extracted?.grossWeight ?? 0)
      const tareKg  = Number(extracted?.tareWeight  ?? 0)
      const netKg   = Number(extracted?.netWeight   ?? (grossKg - tareKg))

      await supabase.from('weight_slips').insert({
        trip_id:          trip.id,
        driver_id:        userId,
        image_url:        publicUrl,
        wb_type:          'wb2',
        uploaded_by_role: 'buyer',
        wb1_weight:       tareKg  > 0 ? parseFloat((tareKg  / 1000).toFixed(3)) : null,
        wb2_weight:       grossKg > 0 ? parseFloat((grossKg / 1000).toFixed(3)) : null,
        net_weight:       netKg   > 0 ? parseFloat((netKg   / 1000).toFixed(3)) : null,
        extracted,
      })

      onRefresh()
    } catch (e: unknown) {
      setWb2Error(e instanceof Error ? e.message : 'Upload failed')
    }
    setUploadingWB2(false)
  }

  async function handleConfirmAndGenerate() {
    if (!trip || !wb2Slip) return
    setGeneratingChallan(true)
    setChallanError('')
    try {
      const wb1Net = wb1Slip?.net_weight ?? wb1Slip?.wb2_weight ?? 0
      const wb2Net = wb2Slip.net_weight ?? wb2Slip.wb2_weight ?? 0

      const royalty          = trip.royalty_passes?.[0]
      const royaltyNo        = (royalty?.extracted as { royaltyNumber?: string } | null)?.royaltyNumber ?? null
      const royaltyExtracted = royalty?.extracted ?? null
      const wb1SlipForMismatch = trip.weight_slips?.find((w: { wb_type: string }) => w.wb_type === 'wb1') ?? null
      const wb1Extracted     = (wb1SlipForMismatch as { extracted?: Record<string, unknown> | null } | null)?.extracted ?? null

      const res = await fetch('/api/generate-challan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tripId:          trip.id,
          orderId:         order.id,
          materialType:    order.material_type,
          deliveryAddress: order.delivery_address,
          buyerId:         userId,
          buyerName:       null,
          traderId:        order.trader_id,
          supplierName:    null,
          supplierAddress: null,
          driverName:      (trip.driver as { full_name?: string | null } | null)?.full_name ?? null,
          truckNumber:     trip.truck_number ?? null,
          royaltyNo,
          orderedQty:      order.quantity_mt,
          wb1Weight:       wb1Net,
          wb2Weight:       wb2Net,
          royaltyExtracted,
          wb1Extracted,
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      onRefresh()
    } catch (e: unknown) {
      setChallanError(e instanceof Error ? e.message : 'Failed to generate challan')
    }
    setGeneratingChallan(false)
  }

  return (
    <div className="bg-sx-card border border-sx-border rounded-2xl p-5 space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-semibold text-sx-hi">{order.material_type}</span>
          <span className="text-sx-lo text-sm ml-2">· {order.quantity_mt} MT</span>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize whitespace-nowrap ${STATUS_STYLES[order.status] ?? 'bg-sx-raised text-sx-lo'}`}>
          {order.status.replace('_', ' ')}
        </span>
      </div>

      <p className="text-sm text-sx-lo">{order.delivery_address}</p>
      <p className="text-xs text-sx-lo">
        Scheduled:{' '}
        {new Date(order.scheduled_date + 'T00:00:00').toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
        })}
      </p>

      {/* Source (privacy wall — no supplier name/address) */}
      {trip && (
        <p className="text-xs text-sx-lo">
          Sand Source: <span className="text-sx-hi font-medium">Surat Stockyard</span>
        </p>
      )}

      {/* Timeline */}
      {!cancelled && (
        <div className="pt-1">
          <div className="flex items-center">
            {TIMELINE.map((label, i) => (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    i <= step
                      ? 'bg-sx-accent text-white'
                      : 'bg-sx-raised text-sx-lo'
                  }`}>
                    {i < step ? '✓' : i + 1}
                  </div>
                  <span className={`text-[10px] mt-1 text-center leading-tight w-12 ${
                    i <= step ? 'text-sx-accent font-medium' : 'text-sx-lo'
                  }`}>
                    {label}
                  </span>
                </div>
                {i < TIMELINE.length - 1 && (
                  <div className={`flex-1 h-0.5 mb-4 mx-0.5 ${i < step ? 'bg-sx-accent' : 'bg-sx-border'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delivery confirmation section — shown when in_transit and no challan yet */}
      {trip?.status === 'in_transit' && !challan && (
        <div className="border border-sx-border bg-sx-raised rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-sx-lo uppercase tracking-wide">Confirm Delivery</p>

          {/* WB1 summary (driver's slip) */}
          {wb1Slip ? (
            <div className="bg-sx-card rounded-xl p-3 text-xs text-sx-lo space-y-1 border border-sx-border">
              <p className="font-semibold text-sx-hi mb-1">Source Weighbridge (WB1 — Driver)</p>
              {wb1Slip.wb1_weight != null && <p>Tare: <span className="font-medium text-sx-hi">{wb1Slip.wb1_weight} MT</span></p>}
              {wb1Slip.wb2_weight != null && <p>Gross: <span className="font-medium text-sx-hi">{wb1Slip.wb2_weight} MT</span></p>}
              {wb1Slip.net_weight  != null && <p>Net: <span className="font-medium text-sx-hi">{wb1Slip.net_weight} MT</span></p>}
              <a href={wb1Slip.image_url} target="_blank" rel="noreferrer"
                className="text-sx-blue underline mt-1 inline-block">View slip</a>
            </div>
          ) : (
            <p className="text-xs text-sx-lo">Driver&apos;s weighbridge slip not yet uploaded.</p>
          )}

          {/* WB2 upload */}
          <div>
            <p className="text-xs font-semibold text-sx-hi mb-2">Your Weighbridge Slip (WB2)</p>
            {wb2Slip ? (
              <div className="bg-sx-card rounded-xl p-3 text-xs text-sx-lo space-y-1 border border-sx-border">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sx-green font-semibold">Uploaded</span>
                  <a href={wb2Slip.image_url} target="_blank" rel="noreferrer"
                    className="text-sx-blue underline">View slip</a>
                </div>
                {wb2Slip.wb1_weight != null && <p>Tare: <span className="font-medium text-sx-hi">{wb2Slip.wb1_weight} MT</span></p>}
                {wb2Slip.wb2_weight != null && <p>Gross: <span className="font-medium text-sx-hi">{wb2Slip.wb2_weight} MT</span></p>}
                {wb2Slip.net_weight  != null && <p>Net: <span className="font-medium text-sx-hi">{wb2Slip.net_weight} MT</span></p>}
              </div>
            ) : (
              <div>
                <input
                  ref={wb2Ref}
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleWB2Upload(e.target.files[0])}
                />
                <button
                  onClick={() => wb2Ref.current?.click()}
                  disabled={uploadingWB2}
                  className="w-full border-2 border-dashed border-sx-border hover:border-sx-accent rounded-xl py-4 text-sm text-sx-lo hover:text-sx-accent disabled:opacity-50 transition flex flex-col items-center gap-1"
                >
                  <span className="text-xl">📷</span>
                  {uploadingWB2 ? 'Uploading & extracting…' : 'Upload Your Weighbridge Slip (WB2)'}
                </button>
                {wb2Error && <p className="text-xs text-sx-red mt-1">{wb2Error}</p>}
              </div>
            )}
          </div>

          {/* Confirm & generate challan */}
          {wb2Slip && (
            <div className="space-y-1">
              <button
                onClick={handleConfirmAndGenerate}
                disabled={generatingChallan}
                className="w-full bg-sx-green text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
              >
                {generatingChallan ? 'Generating Challan…' : 'Confirm Receipt & Generate Challan'}
              </button>
              {challanError && <p className="text-xs text-sx-red">{challanError}</p>}
            </div>
          )}
        </div>
      )}

      {/* Challan section */}
      {challan && (
        <div className="border border-green-900/60 bg-green-900/20 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-sx-lo uppercase tracking-wide">Delivery Challan</p>
          <div className="flex items-center gap-3 flex-wrap">
            {challan.pdf_url && (
              <a href={challan.pdf_url} target="_blank" rel="noreferrer"
                className="text-sm text-sx-blue underline">View / Download PDF</a>
            )}
            {challan.net_weight != null && (
              <span className="text-xs text-sx-lo">
                Net: <span className="font-semibold text-sx-hi">{challan.net_weight} MT</span>
              </span>
            )}
          </div>
          <div className="flex gap-2 text-[10px] flex-wrap">
            <span className={`px-2 py-0.5 rounded-full font-medium ${challan.buyer_confirmed ? 'bg-green-900/40 text-sx-green' : 'bg-sx-raised text-sx-lo'}`}>
              {challan.buyer_confirmed ? 'You confirmed receipt' : 'Pending your confirmation'}
            </span>
            <span className={`px-2 py-0.5 rounded-full font-medium ${challan.trader_approved ? 'bg-blue-900/40 text-sx-blue' : 'bg-sx-raised text-sx-lo'}`}>
              {challan.trader_approved ? 'Trader approved' : 'Pending trader approval'}
            </span>
          </div>
        </div>
      )}

      {order.special_instructions && (
        <p className="text-xs text-sx-lo italic">&ldquo;{order.special_instructions}&rdquo;</p>
      )}
    </div>
  )
}
