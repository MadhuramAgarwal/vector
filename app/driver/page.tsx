'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import BillingView from '@/components/BillingView'
import AvailabilityTab from '@/components/AvailabilityTab'

const TABS = [
  { id: 'fleet',        label: 'My Fleet',    icon: '🚛' },
  { id: 'availability', label: 'Availability', icon: '📅' },
  { id: 'earnings',     label: 'Earnings',    icon: '₹' },
]

const STATUS_STYLES: Record<string, string> = {
  pending:    'bg-yellow-900/40 text-sx-amber',
  confirmed:  'bg-blue-900/40 text-sx-blue',
  loading:    'bg-purple-900/40 text-purple-300',
  loaded:     'bg-purple-900/40 text-purple-300',
  in_transit: 'bg-orange-900/40 text-sx-accent',
  delivered:  'bg-green-900/40 text-sx-green',
  cancelled:  'bg-red-900/40 text-sx-red',
  declined:   'bg-red-900/40 text-sx-red',
}

type RoyaltyPass = {
  id: string
  image_url: string
  extracted: Record<string, unknown> | null
}

type WeightSlip = {
  id: string
  image_url: string
  wb_type: string
  wb1_weight: number | null
  wb2_weight: number | null
  net_weight: number | null
  extracted: Record<string, unknown> | null
}

type Trip = {
  id: string
  status: string
  quantity_mt: number
  order_id: string
  created_at: string
  supplier_accepted: boolean | null
  driver_accepted:   boolean | null
  transport_rate_per_mt: number | null
  transport_amount: number | null
  order: {
    id: string
    material_type: string
    delivery_address: string
    scheduled_date: string
    buyer_id: string
    trader_id: string | null
  } | null
  supplier: { full_name: string | null; email: string } | null
  royalty_passes: RoyaltyPass[]
  weight_slips:   WeightSlip[]
}

export default function DriverDashboard() {
  const router   = useRouter()
  const supabase = createClient()

  const [userId, setUserId]               = useState<string | null>(null)
  const [trips, setTrips]                 = useState<Trip[]>([])
  const [loading, setLoading]             = useState(true)
  const [updating, setUpdating]           = useState<string | null>(null)
  const [isAvailable, setIsAvailable]     = useState(true)
  const [availToggling, setAvailToggling] = useState(false)
  const [activeTab, setActiveTab]         = useState<'fleet' | 'availability' | 'earnings'>('fleet')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)
      const { data: profile } = await supabase.from('users').select('is_available').eq('id', user.id).single()
      if (profile) setIsAvailable(profile.is_available ?? true)
      await fetchTrips(user.id)
      setLoading(false)
    }
    init()
  }, [])

  async function fetchTrips(uid: string) {
    const { data } = await supabase
      .from('trips')
      .select(`
        *,
        order:orders(id, material_type, delivery_address, scheduled_date, buyer_id, trader_id),
        supplier:users!trips_supplier_id_fkey(full_name, email),
        royalty_passes(*),
        weight_slips(*)
      `)
      .eq('driver_id', uid)
      .order('created_at', { ascending: false })
    setTrips((data as Trip[]) ?? [])
  }

  async function updateStatus(tripId: string, newStatus: string) {
    if (!userId) return
    setUpdating(tripId)
    await supabase.from('trips').update({ status: newStatus }).eq('id', tripId)
    await supabase.from('trip_status_log').insert({ trip_id: tripId, status: newStatus, updated_by: userId })
    await fetchTrips(userId)
    setUpdating(null)
  }

  async function handleAccept(tripId: string, accepted: boolean, traderId: string | null) {
    if (!userId) return
    setUpdating(tripId)
    const update: Record<string, unknown> = { driver_accepted: accepted }
    if (!accepted) update.status = 'declined'

    await supabase.from('trips').update(update).eq('id', tripId)

    if (traderId) {
      await supabase.from('notifications').insert({
        user_id: traderId,
        title:   accepted ? 'Driver Accepted Trip' : 'Driver Declined Trip',
        body:    accepted
          ? 'The driver has accepted the trip assignment.'
          : 'The driver declined the trip. Please reassign.',
        type:    accepted ? 'trip_accepted' : 'trip_declined',
        ref_id:  tripId,
      })
    }

    await fetchTrips(userId)
    setUpdating(null)
  }

  async function toggleAvailability() {
    if (!userId) return
    setAvailToggling(true)
    const next = !isAvailable
    await supabase.from('users').update({ is_available: next }).eq('id', userId)
    setIsAvailable(next)
    setAvailToggling(false)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-sx-base">
      <div className="text-sx-lo text-sm">Loading…</div>
    </div>
  )

  const pending = trips.filter(t => t.status === 'confirmed' && t.driver_accepted === null)
  const active  = trips.filter(t => !['delivered', 'cancelled', 'declined'].includes(t.status) && t.driver_accepted !== null)
  const done    = trips.filter(t => ['delivered', 'cancelled', 'declined'].includes(t.status))

  return (
    <AppShell
      role="driver"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={id => setActiveTab(id as typeof activeTab)}
      userId={userId}
      supabase={supabase}
    >
      {activeTab === 'earnings' ? (
        userId && <BillingView userId={userId} role="driver" />
      ) : activeTab === 'availability' ? (
        userId && <AvailabilityTab userId={userId} supabase={supabase} profile={null} />
      ) : (
        <div className="space-y-6">

          {/* Availability Toggle */}
          <div className={`rounded-2xl border-2 px-5 py-4 flex items-center justify-between transition-colors ${isAvailable ? 'border-sx-green bg-green-900/20' : 'border-sx-border bg-sx-raised'}`}>
            <div>
              <p className="font-semibold text-sx-hi">Availability</p>
              <p className={`text-sm mt-0.5 ${isAvailable ? 'text-sx-green' : 'text-sx-lo'}`}>
                {isAvailable ? 'You are available for new trips' : 'You will not receive new assignments'}
              </p>
            </div>
            <button
              onClick={toggleAvailability}
              disabled={availToggling}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${isAvailable ? 'bg-sx-green' : 'bg-sx-raised border border-sx-border'}`}
            >
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform ${isAvailable ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* New assignments awaiting response */}
          {pending.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-wide mb-3">
                New Assignments <span className="text-sx-accent">({pending.length})</span>
              </h3>
              <div className="space-y-3">
                {pending.map(t => (
                  <TripCard key={t.id} trip={t} updating={updating}
                    onAccept={handleAccept} onUpdate={updateStatus}
                    onRefresh={() => userId && fetchTrips(userId)} userId={userId!} />
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-wide mb-3">
              My Fleet <span className="text-sx-accent">({active.length})</span>
            </h3>
            {active.length === 0 ? (
              <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-10 text-center text-sx-lo text-sm">
                No active trips.
              </div>
            ) : (
              <div className="space-y-3">
                {active.map(t => (
                  <TripCard key={t.id} trip={t} updating={updating}
                    onAccept={handleAccept} onUpdate={updateStatus}
                    onRefresh={() => userId && fetchTrips(userId)} userId={userId!} />
                ))}
              </div>
            )}
          </div>

          {done.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-wide mb-3">Completed / Declined</h3>
              <div className="space-y-3">
                {done.map(t => (
                  <TripCard key={t.id} trip={t} updating={updating}
                    onAccept={handleAccept} onUpdate={updateStatus}
                    onRefresh={() => userId && fetchTrips(userId)} userId={userId!} />
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </AppShell>
  )
}

// ─── TripCard ────────────────────────────────────────────────────────────────

function TripCard({
  trip, updating, onAccept, onUpdate, onRefresh, userId,
}: {
  trip: Trip
  updating: string | null
  onAccept: (id: string, accepted: boolean, traderId: string | null) => void
  onUpdate: (id: string, s: string) => void
  onRefresh: () => void
  userId: string
}) {
  const supabase = createClient()
  const busy     = updating === trip.id

  const awaitingResponse = trip.status === 'confirmed' && trip.driver_accepted === null

  const royaltyPass = trip.royalty_passes?.[0] ?? null
  // Driver's WB1 slip only
  const wb1Slip = trip.weight_slips?.find(w => w.wb_type === 'wb1') ?? null

  // ── Royalty pass upload ──────────────────────────────────────────────────
  const [uploadingRP, setUploadingRP] = useState(false)
  const [rpError,     setRpError]     = useState('')
  const rpRef = useRef<HTMLInputElement>(null)

  async function handleRoyaltyPassUpload(file: File) {
    setUploadingRP(true)
    setRpError('')
    try {
      const ext      = file.name.split('.').pop()
      const filename = `rp-${trip.id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(filename, file, { upsert: true })
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filename)

      const base64 = await fileToBase64(file)
      const extractRes = await fetch('/api/extract-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type, documentType: 'royalty_pass' }),
      })
      const { extracted } = await extractRes.json()

      await supabase.from('royalty_passes').insert({
        trip_id:   trip.id,
        driver_id: userId,
        image_url: publicUrl,
        extracted,
      })

      onRefresh()
    } catch (e: unknown) {
      setRpError(e instanceof Error ? e.message : 'Upload failed')
    }
    setUploadingRP(false)
  }

  // ── WB1 weight slip upload (driver, at source) ───────────────────────────
  const [uploadingWB1, setUploadingWB1] = useState(false)
  const [wb1Error,     setWb1Error]     = useState('')
  const wb1Ref = useRef<HTMLInputElement>(null)

  async function handleWB1Upload(file: File) {
    setUploadingWB1(true)
    setWb1Error('')
    try {
      const ext      = file.name.split('.').pop()
      const filename = `wb1-${trip.id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(filename, file, { upsert: true })
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filename)

      const base64 = await fileToBase64(file)
      const extractRes = await fetch('/api/extract-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type, documentType: 'weight_slip' }),
      })
      const { extracted } = await extractRes.json()

      const grossKg = Number(extracted?.grossWeight ?? 0)
      const tareKg  = Number(extracted?.tareWeight  ?? 0)
      const netKg   = Number(extracted?.netWeight   ?? (grossKg - tareKg))

      await supabase.from('weight_slips').insert({
        trip_id:          trip.id,
        driver_id:        userId,
        image_url:        publicUrl,
        wb_type:          'wb1',
        uploaded_by_role: 'driver',
        wb1_weight:       tareKg  > 0 ? parseFloat((tareKg  / 1000).toFixed(3)) : null,
        wb2_weight:       grossKg > 0 ? parseFloat((grossKg / 1000).toFixed(3)) : null,
        net_weight:       netKg   > 0 ? parseFloat((netKg   / 1000).toFixed(3)) : null,
        extracted,
      })

      onRefresh()
    } catch (e: unknown) {
      setWb1Error(e instanceof Error ? e.message : 'Upload failed')
    }
    setUploadingWB1(false)
  }

  const canStartJourney = trip.status === 'loaded' && !!royaltyPass && !!wb1Slip

  return (
    <div className="bg-sx-card border border-sx-border rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-medium text-sx-hi">{trip.order?.material_type ?? '—'}</span>
          <span className="text-sx-lo text-sm ml-2">· {trip.quantity_mt} MT</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize whitespace-nowrap ${STATUS_STYLES[trip.status] ?? 'bg-sx-raised text-sx-lo'}`}>
          {trip.status.replace('_', ' ')}
        </span>
      </div>

      <div className="text-sm space-y-0.5">
        <p><span className="text-sx-lo">Pickup:</span> <span className="font-medium text-sx-hi">Surat Stockyard</span></p>
        <p><span className="text-sx-lo">Deliver to:</span> <span className="text-sx-hi">{trip.order?.delivery_address ?? '—'}</span></p>
        {trip.order?.scheduled_date && (
          <p><span className="text-sx-lo">Date:</span> <span className="text-sx-hi">
            {new Date(trip.order.scheduled_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span></p>
        )}
      </div>

      {/* Rate (read-only — set by trader) */}
      {trip.transport_rate_per_mt != null && (
        <div className="border border-sx-border rounded-xl p-3 bg-sx-raised flex items-center justify-between">
          <div>
            <span className="text-xs text-sx-lo">Your rate: </span>
            <span className="font-semibold text-sx-amber">₹{trip.transport_rate_per_mt}/MT</span>
            {trip.transport_amount != null && (
              <span className="text-xs text-sx-lo ml-1">· Total: ₹{trip.transport_amount.toLocaleString('en-IN')}</span>
            )}
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-900/40 text-sx-green">Confirmed</span>
        </div>
      )}

      {/* ── Accept / Decline ── */}
      {awaitingResponse && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-sx-lo">You have been assigned this trip. Do you accept?</p>
          <div className="flex gap-2">
            <button
              onClick={() => onAccept(trip.id, true, trip.order?.trader_id ?? null)}
              disabled={busy}
              className="flex-1 bg-sx-green text-sx-base rounded-lg py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
            >
              {busy ? '…' : 'Accept'}
            </button>
            <button
              onClick={() => onAccept(trip.id, false, trip.order?.trader_id ?? null)}
              disabled={busy}
              className="flex-1 bg-sx-red text-white rounded-lg py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
            >
              {busy ? '…' : 'Decline'}
            </button>
          </div>
        </div>
      )}

      {trip.driver_accepted === false && (
        <p className="text-xs text-sx-red bg-red-900/20 rounded-lg px-3 py-2">You declined this trip.</p>
      )}

      {/* ── Step 1: Royalty Pass ── */}
      {['loaded', 'in_transit', 'delivered'].includes(trip.status) && (
        <DocUploadRow
          label="Step 1 — Royalty Pass"
          uploaded={!!royaltyPass}
          imageUrl={royaltyPass?.image_url}
          extracted={royaltyPass?.extracted}
          uploading={uploadingRP}
          error={rpError}
          inputRef={rpRef}
          disabled={trip.status !== 'loaded'}
          onPickFile={() => rpRef.current?.click()}
          onFileChange={f => handleRoyaltyPassUpload(f)}
        />
      )}

      {/* ── Step 2: Source Weighbridge Slip (WB1) ── */}
      {['loaded', 'in_transit', 'delivered'].includes(trip.status) && (
        <div className="border border-sx-border rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-sx-lo uppercase tracking-wide">Step 2 — Source Weighbridge Slip (WB1)</p>
          {wb1Slip ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sx-green text-sm">Uploaded</span>
                <a href={wb1Slip.image_url} target="_blank" rel="noreferrer" className="text-xs text-sx-blue underline">View</a>
              </div>
              <div className="bg-sx-raised rounded p-2 text-xs text-sx-lo space-y-0.5">
                {wb1Slip.wb1_weight != null && <p><span className="font-medium text-sx-hi">Tare:</span> {wb1Slip.wb1_weight} MT</p>}
                {wb1Slip.wb2_weight != null && <p><span className="font-medium text-sx-hi">Gross:</span> {wb1Slip.wb2_weight} MT</p>}
                {wb1Slip.net_weight  != null && <p><span className="font-medium text-sx-hi">Net:</span> {wb1Slip.net_weight} MT</p>}
              </div>
            </div>
          ) : trip.status === 'loaded' ? (
            <div>
              <input ref={wb1Ref} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
                onChange={e => e.target.files?.[0] && handleWB1Upload(e.target.files[0])} />
              <button
                onClick={() => wb1Ref.current?.click()}
                disabled={uploadingWB1}
                className="w-full border-2 border-dashed border-sx-border rounded-xl py-2 text-sm text-sx-lo hover:border-sx-accent hover:text-sx-accent disabled:opacity-50 transition"
              >
                {uploadingWB1 ? 'Uploading & extracting…' : 'Upload WB1 Slip'}
              </button>
              {wb1Error && <p className="text-xs text-sx-red mt-1">{wb1Error}</p>}
            </div>
          ) : (
            <p className="text-xs text-sx-lo">Not uploaded</p>
          )}
        </div>
      )}

      {/* ── Actions ── */}
      {trip.status === 'loaded' && (
        canStartJourney ? (
          <button
            onClick={() => onUpdate(trip.id, 'in_transit')}
            disabled={busy}
            className="w-full bg-sx-accent text-white rounded-lg py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
          >
            {busy ? 'Updating…' : 'Start Journey'}
          </button>
        ) : (
          <p className="text-xs text-sx-amber bg-yellow-900/20 rounded-lg px-3 py-2">
            Upload {!royaltyPass ? 'royalty pass' : 'WB1 weighbridge slip'} before starting.
          </p>
        )
      )}

      {trip.status === 'in_transit' && (
        <div className="bg-blue-900/20 rounded-lg px-3 py-2 text-xs text-sx-blue text-center">
          Journey in progress — buyer will upload their weighbridge slip and confirm receipt.
        </div>
      )}

      {trip.status === 'delivered' && (
        <div className="bg-green-900/20 rounded-lg px-3 py-2 text-xs text-sx-green text-center font-medium">
          Delivery complete. Challan has been generated.
        </div>
      )}
    </div>
  )
}

// ─── Reusable doc upload row ─────────────────────────────────────────────────

function DocUploadRow({
  label, uploaded, imageUrl, extracted,
  uploading, error, inputRef, disabled,
  onPickFile, onFileChange,
}: {
  label: string
  uploaded: boolean
  imageUrl?: string
  extracted?: Record<string, unknown> | null
  uploading: boolean
  error: string
  inputRef: React.RefObject<HTMLInputElement | null>
  disabled: boolean
  onPickFile: () => void
  onFileChange: (f: File) => void
}) {
  return (
    <div className="border border-sx-border rounded-xl p-3 space-y-2">
      <p className="text-xs font-semibold text-sx-lo uppercase tracking-wide">{label}</p>
      {uploaded ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sx-green text-sm">Uploaded</span>
            {imageUrl && (
              <a href={imageUrl} target="_blank" rel="noreferrer" className="text-xs text-sx-blue underline">View</a>
            )}
          </div>
          {extracted && (
            <div className="bg-sx-raised rounded p-2 text-xs text-sx-lo space-y-0.5">
              {Object.entries(extracted)
                .filter(([, v]) => v !== null && v !== '')
                .slice(0, 6)
                .map(([k, v]) => (
                  <p key={k}><span className="font-medium text-sx-hi capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span> {String(v)}</p>
                ))}
            </div>
          )}
        </div>
      ) : !disabled ? (
        <div>
          <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
            onChange={e => e.target.files?.[0] && onFileChange(e.target.files[0])} />
          <button
            onClick={onPickFile}
            disabled={uploading}
            className="w-full border-2 border-dashed border-sx-border rounded-xl py-2 text-sm text-sx-lo hover:border-sx-accent hover:text-sx-accent disabled:opacity-50 transition"
          >
            {uploading ? 'Uploading & extracting…' : `Upload ${label.split('—')[1]?.trim() ?? 'Document'}`}
          </button>
          {error && <p className="text-xs text-sx-red mt-1">{error}</p>}
        </div>
      ) : (
        <p className="text-xs text-sx-lo">Not uploaded</p>
      )}
    </div>
  )
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
