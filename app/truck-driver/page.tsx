'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Driver = {
  id: string
  full_name: string | null
  email: string
  vehicle_number: string | null
}

type TruckOffer = {
  id: string
  truck_number: string | null
  truck_capacity_mt: number
  available_date: string
  available_to: string | null
  location: string | null
  status: string
  driver: { full_name: string | null; email: string } | null
}

type DriverInvitation = {
  id: string
  full_name: string
  email: string
  status: string
  created_at: string
}

const STATUS_STYLES: Record<string, string> = {
  available:  'bg-green-900/40 text-sx-green',
  assigned:   'bg-blue-900/40 text-sx-blue',
  dispatched: 'bg-purple-900/40 text-purple-300',
  completed:  'bg-sx-raised text-sx-lo',
  cancelled:  'bg-red-900/40 text-sx-red',
}

const TABS = [
  { id: 'offers',  label: 'Offer Trucks', icon: '🚛' },
  { id: 'drivers', label: 'Drivers',      icon: '👤' },
]

const INPUT = 'w-full bg-sx-raised border border-sx-border rounded-xl px-3 py-2.5 text-sm text-sx-hi placeholder-sx-lo focus:outline-none focus:ring-2 focus:ring-sx-accent'
const LABEL = 'text-xs font-medium text-sx-lo block mb-1.5 uppercase tracking-wide'

function tomorrow() { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().split('T')[0] }

export default function FleetOwnerPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [userId, setUserId]     = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState('offers')

  // ── Offers tab ──────────────────────────────────────────────────────────────
  const [drivers, setDrivers]   = useState<Driver[]>([])
  const [offers, setOffers]     = useState<TruckOffer[]>([])

  const [selectedDriver, setSelectedDriver] = useState('')
  const [truckNumber, setTruckNumber]       = useState('')
  const [capacityMt, setCapacityMt]         = useState('24')
  const [availFrom, setAvailFrom]           = useState(tomorrow())
  const [availTo, setAvailTo]               = useState(tomorrow())
  const [location, setLocation]             = useState('Hazira Industrial Area, Surat, Gujarat')
  const [offerSaving, setOfferSaving]       = useState(false)
  const [offerError, setOfferError]         = useState('')
  const [offerSuccess, setOfferSuccess]     = useState('')

  // ── Drivers tab ─────────────────────────────────────────────────────────────
  const [driverInvites, setDriverInvites] = useState<DriverInvitation[]>([])
  const [driverName, setDriverName]       = useState('')
  const [driverEmail, setDriverEmail]     = useState('')
  const [driverSaving, setDriverSaving]   = useState(false)
  const [driverError, setDriverError]     = useState('')
  const [driverSuccess, setDriverSuccess] = useState('')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)
      await Promise.all([fetchDrivers(), fetchOffers(user.id)])
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (activeTab === 'drivers' && userId) fetchDriverInvites(userId)
  }, [activeTab, userId])

  // Auto-fill truck number from selected driver's vehicle_number
  useEffect(() => {
    if (!selectedDriver) { setTruckNumber(''); return }
    const plate = drivers.find(d => d.id === selectedDriver)?.vehicle_number
    if (plate) setTruckNumber(plate)
  }, [selectedDriver, drivers])

  const fetchDrivers = useCallback(async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email, vehicle_number')
      .eq('role', 'driver')
    setDrivers((data as Driver[]) ?? [])
  }, [])

  const fetchOffers = useCallback(async (uid: string) => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 1)
    const { data } = await supabase
      .from('fleet_availability')
      .select('id, truck_number, truck_capacity_mt, available_date, available_to, location, status, driver:users!fleet_availability_driver_id_fkey(full_name, email)')
      .eq('fleet_owner_id', uid)
      .gte('available_date', cutoff.toISOString().split('T')[0])
      .order('available_date', { ascending: true })
    setOffers((data as unknown as TruckOffer[]) ?? [])
  }, [])

  const fetchDriverInvites = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('user_invitations')
      .select('id, full_name, email, status, created_at')
      .eq('invited_by', uid)
      .eq('target_role', 'driver')
      .order('created_at', { ascending: false })
    setDriverInvites((data as DriverInvitation[]) ?? [])
  }, [])

  async function submitOffer() {
    if (!userId || !selectedDriver || !truckNumber.trim() || !capacityMt || !availFrom) return
    setOfferSaving(true)
    setOfferError('')
    setOfferSuccess('')

    const toDate = availTo >= availFrom ? availTo : availFrom

    const { error } = await supabase.from('fleet_availability').insert({
      driver_id:        selectedDriver,
      fleet_owner_id:   userId,
      truck_number:     truckNumber.trim().toUpperCase(),
      truck_capacity_mt: Number(capacityMt),
      available_date:   availFrom,
      available_to:     toDate,
      location:         location.trim() || 'Hazira Industrial Area, Surat, Gujarat',
      status:           'available',
    })

    if (error) {
      setOfferError(error.message)
    } else {
      const drv = drivers.find(d => d.id === selectedDriver)
      setOfferSuccess(`Truck ${truckNumber.toUpperCase()} offered (${new Date(availFrom).toLocaleDateString('en-IN', { day:'numeric', month:'short' })} → ${new Date(toDate).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}) — traders can now see it.`)
      setSelectedDriver('')
      setTruckNumber('')
      setCapacityMt('24')
      setAvailFrom(tomorrow())
      setAvailTo(tomorrow())
      if (userId) fetchOffers(userId)
    }
    setOfferSaving(false)
  }

  async function cancelOffer(id: string) {
    await supabase.from('fleet_availability').update({ status: 'cancelled' }).eq('id', id)
    if (userId) fetchOffers(userId)
  }

  async function inviteDriver() {
    if (!userId || !driverName.trim() || !driverEmail.trim()) return
    setDriverSaving(true)
    setDriverError('')
    setDriverSuccess('')
    const { error } = await supabase.from('user_invitations').insert({
      invited_by:   userId,
      target_role:  'driver',
      full_name:    driverName.trim(),
      email:        driverEmail.toLowerCase().trim(),
      status:       'approved',
      requires_approval: false,
    })
    if (error) {
      setDriverError(error.message)
    } else {
      setDriverSuccess(`${driverName} can now sign up at /login → "Set up your account".`)
      setDriverName('')
      setDriverEmail('')
      if (userId) fetchDriverInvites(userId)
    }
    setDriverSaving(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-sx-base">
      <div className="text-sx-lo text-sm">Loading…</div>
    </div>
  )

  const activeOffers   = offers.filter(o => o.status === 'available')
  const assignedOffers = offers.filter(o => !['available','cancelled'].includes(o.status))

  return (
    <div className="min-h-screen bg-sx-base flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* Header */}
      <header className="h-14 bg-sx-card border-b border-sx-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sx-hi">SandX</span>
          <span className="text-xs text-sx-accent font-semibold px-2 py-0.5 bg-sx-raised rounded-full">Fleet Owner</span>
        </div>
        <button onClick={handleLogout} className="text-xs text-sx-lo hover:text-sx-hi transition">Logout</button>
      </header>

      {/* Tab bar */}
      <div className="flex border-b border-sx-border bg-sx-card shrink-0">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 text-xs font-semibold flex flex-col items-center gap-0.5 transition ${
              activeTab === tab.id ? 'text-sx-accent border-b-2 border-sx-accent' : 'text-sx-lo'
            }`}>
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 max-w-lg mx-auto w-full">

        {/* ═══ OFFER TRUCKS TAB ═══ */}
        {activeTab === 'offers' && (
          <>
            <div>
              <h2 className="font-semibold text-sx-hi">Offer Trucks</h2>
              <p className="text-xs text-sx-lo mt-0.5">Make a truck available to traders for a date range.</p>
            </div>

            {/* Form */}
            <div className="bg-sx-card border border-sx-border rounded-2xl p-5 space-y-4">
              <div>
                <label className={LABEL}>Driver *</label>
                <select value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)} className={INPUT}>
                  <option value="">Select driver…</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.full_name ?? d.email}{d.vehicle_number ? ` — ${d.vehicle_number}` : ''}
                    </option>
                  ))}
                </select>
                {drivers.length === 0 && (
                  <p className="text-xs text-sx-amber mt-1">No drivers yet. Add them in the Drivers tab first.</p>
                )}
              </div>

              <div>
                <label className={LABEL}>License Plate (Truck No.) *</label>
                <input type="text" placeholder="e.g. GJ-05-T-1001" value={truckNumber}
                  onChange={e => setTruckNumber(e.target.value.toUpperCase())} className={INPUT} />
              </div>

              <div>
                <label className={LABEL}>Capacity (MT) *</label>
                <input type="number" min="1" max="60" placeholder="e.g. 24"
                  value={capacityMt} onChange={e => setCapacityMt(e.target.value)} className={INPUT} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Available From *</label>
                  <input type="date" value={availFrom} onChange={e => setAvailFrom(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Available To *</label>
                  <input type="date" value={availTo} min={availFrom} onChange={e => setAvailTo(e.target.value)} className={INPUT} />
                </div>
              </div>

              <div>
                <label className={LABEL}>Starting Location</label>
                <input type="text" placeholder="e.g. Hazira Industrial Area, Surat"
                  value={location} onChange={e => setLocation(e.target.value)} className={INPUT} />
              </div>

              {offerError   && <p className="text-xs text-sx-red">{offerError}</p>}
              {offerSuccess && <p className="text-xs text-sx-green">{offerSuccess}</p>}

              <button onClick={submitOffer}
                disabled={offerSaving || !selectedDriver || !truckNumber.trim() || !capacityMt}
                className="w-full bg-sx-accent text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition">
                {offerSaving ? 'Offering…' : 'Make Truck Available →'}
              </button>
            </div>

            {/* Active offers */}
            {activeOffers.length > 0 && (
              <>
                <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest">Available Now ({activeOffers.length})</h3>
                <div className="space-y-3">
                  {activeOffers.map(offer => (
                    <div key={offer.id} className="bg-sx-card border border-sx-border rounded-2xl px-5 py-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-sx-hi">{offer.truck_number ?? '—'}</p>
                          <p className="text-xs text-sx-lo">{offer.driver?.full_name ?? offer.driver?.email ?? '—'}</p>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-900/40 text-sx-green">Available</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-sx-lo">
                        <p>Capacity: <span className="text-sx-hi font-medium">{offer.truck_capacity_mt} MT</span></p>
                        <p>From: <span className="text-sx-hi">{new Date(offer.available_date).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}</span></p>
                        {offer.available_to && offer.available_to !== offer.available_date && (
                          <p>To: <span className="text-sx-hi">{new Date(offer.available_to).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}</span></p>
                        )}
                        {offer.location && <p className="col-span-2 truncate">At: <span className="text-sx-hi">{offer.location}</span></p>}
                      </div>
                      <button onClick={() => cancelOffer(offer.id)}
                        className="text-xs text-sx-red hover:opacity-80 transition">
                        Cancel offer
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Assigned / in-use */}
            {assignedOffers.length > 0 && (
              <>
                <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest mt-2">Assigned / Active ({assignedOffers.length})</h3>
                <div className="space-y-2">
                  {assignedOffers.map(offer => (
                    <div key={offer.id} className="bg-sx-card border border-sx-border rounded-2xl px-5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sx-hi text-sm">{offer.truck_number ?? '—'}</p>
                        <p className="text-xs text-sx-lo">{offer.driver?.full_name ?? '—'} · {offer.truck_capacity_mt} MT</p>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_STYLES[offer.status] ?? 'bg-sx-raised text-sx-lo'}`}>
                        {offer.status}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeOffers.length === 0 && assignedOffers.length === 0 && (
              <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-10 text-center text-sx-lo text-sm">
                No active offers. Use the form above to make a truck available.
              </div>
            )}
          </>
        )}

        {/* ═══ DRIVERS TAB ═══ */}
        {activeTab === 'drivers' && (
          <>
            <div>
              <h2 className="font-semibold text-sx-hi">My Drivers</h2>
              <p className="text-xs text-sx-lo mt-0.5">Drivers you add can sign up immediately.</p>
            </div>

            <div className="bg-sx-card border border-sx-border rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-sx-hi">Add Driver</h3>
              <div>
                <label className={LABEL}>Driver Name *</label>
                <input type="text" value={driverName} onChange={e => setDriverName(e.target.value)}
                  placeholder="Full name" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Email *</label>
                <input type="email" value={driverEmail} onChange={e => setDriverEmail(e.target.value)}
                  placeholder="driver@example.com" className={INPUT} />
              </div>
              {driverError   && <p className="text-xs text-sx-red">{driverError}</p>}
              {driverSuccess && <p className="text-xs text-sx-green">{driverSuccess}</p>}
              <button onClick={inviteDriver} disabled={driverSaving || !driverName.trim() || !driverEmail.trim()}
                className="w-full bg-sx-accent text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition">
                {driverSaving ? 'Adding…' : 'Add Driver →'}
              </button>
            </div>

            {/* Known drivers */}
            {drivers.length > 0 && (
              <>
                <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest">All Drivers</h3>
                <div className="space-y-2">
                  {drivers.map(d => (
                    <div key={d.id} className="bg-sx-card border border-sx-border rounded-2xl px-5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sx-hi text-sm">{d.full_name ?? d.email}</p>
                        {d.vehicle_number && <p className="text-xs text-sx-accent font-medium">{d.vehicle_number}</p>}
                        <p className="text-xs text-sx-lo truncate">{d.email}</p>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-900/40 text-sx-blue whitespace-nowrap">Active</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {driverInvites.filter(i => i.status !== 'used').length > 0 && (
              <>
                <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest mt-2">Pending Sign-up</h3>
                <div className="space-y-2">
                  {driverInvites.filter(i => i.status !== 'used').map(d => (
                    <div key={d.id} className="bg-sx-card border border-sx-border rounded-2xl px-5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sx-hi text-sm">{d.full_name}</p>
                        <p className="text-xs text-sx-lo truncate">{d.email}</p>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-900/40 text-sx-amber whitespace-nowrap">Pending</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {drivers.length === 0 && driverInvites.length === 0 && (
              <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-10 text-center text-sx-lo text-sm">
                No drivers yet. Add them above.
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
