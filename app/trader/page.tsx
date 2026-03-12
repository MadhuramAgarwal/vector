'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import FleetTab from '@/components/FleetTab'
import LiveTab from '@/components/LiveTab'
import DataSheets from '@/components/DataSheets'

// ─── Design tokens (dark theme status styles) ─────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending:     'bg-yellow-900/40 text-sx-amber border border-yellow-700/40',
  confirmed:   'bg-blue-900/40 text-sx-blue border border-blue-700/40',
  in_progress: 'bg-orange-900/40 text-sx-accent border border-orange-700/40',
  completed:   'bg-green-900/40 text-sx-green border border-green-700/40',
  cancelled:   'bg-red-900/40 text-sx-red border border-red-700/40',
}

const TRIP_STATUS_STYLES: Record<string, string> = {
  confirmed:  'bg-blue-900/40 text-sx-blue',
  loading:    'bg-purple-900/40 text-purple-400',
  loaded:     'bg-indigo-900/40 text-indigo-400',
  in_transit: 'bg-orange-900/40 text-sx-accent',
  delivered:  'bg-green-900/40 text-sx-green',
  declined:   'bg-red-900/40 text-sx-red',
  cancelled:  'bg-red-900/40 text-sx-red',
}

const TRUCK_STATUS_LABEL: Record<string, string> = {
  heading_to_stockyard: 'Heading',
  at_stockyard:         'At Yard',
  loading:              'Loading',
  loaded:               'Loaded',
  in_transit:           'In Transit',
  delivered:            'Delivered',
}

const TRUCK_STATUS_COLOR: Record<string, string> = {
  heading_to_stockyard: 'bg-orange-900/40 text-sx-accent',
  at_stockyard:         'bg-blue-900/40 text-sx-blue',
  loading:              'bg-purple-900/40 text-purple-400',
  loaded:               'bg-indigo-900/40 text-indigo-400',
  in_transit:           'bg-yellow-900/40 text-sx-amber',
  delivered:            'bg-green-900/40 text-sx-green',
}

const TRIP_STEPS = ['Assigned', 'Loading', 'Loaded', 'In Transit', 'Delivered']

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'today',   label: 'Today',   icon: '⚡' },
  { id: 'orders',  label: 'Orders',  icon: '📋' },
  { id: 'fleet',   label: 'Fleet',   icon: '🚛' },
  { id: 'finance', label: 'Finance', icon: '₹' },
  { id: 'team',    label: 'Team',    icon: '👥' },
]

type Invitation = {
  id: string
  target_role: string
  full_name: string
  email: string
  status: string
  created_at: string
}

// ─── Types ────────────────────────────────────────────────────────────────────

type User = { id: string; full_name: string | null; email: string; address?: string | null }

type Challan = {
  id: string
  pdf_url: string | null
  net_weight: number | null
  material_type: string | null
  buyer_confirmed: boolean
  trader_approved: boolean
  created_at: string
}

type Trip = {
  id: string
  status: string
  supplier_accepted: boolean | null
  driver_accepted:   boolean | null
  supplier: { full_name: string | null; email: string } | null
  driver:   { full_name: string | null; email: string } | null
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
  delivery_lat: number | null
  delivery_lng: number | null
  buyer: User | null
  challans: Challan[]
  trips: Trip[]
}

type SmartMatch = {
  supplier_id: string
  supplier_name: string
  supplier_address: string
  driver_id: string
  driver_name: string
  driver_truck: string | null
  driver_capacity_mt: number | null
  driver_to_supplier_km: number
  supplier_to_delivery_km: number
  total_distance_km: number
  total_duration_minutes: number
  estimated_fuel_cost: number
  reasoning: string | null
  rank?: number
}

type DispatchTruck = {
  id: string
  truck_number: string | null
  capacity_mt: number | null
  status: string
  buyer_id: string | null
  assigned_at: string | null
  created_at: string
  buyer: { full_name: string | null; email: string } | null
}

type Deal = {
  id: string
  party_id: string
  party_role: 'supplier' | 'driver' | 'buyer'
  default_rate_per_mt: number
  payment_terms: string
  credit_days: number
  is_active: boolean
  party?: { full_name: string | null; email: string } | null
}

type MonthlyBill = {
  id: string
  party_id: string
  party_role: string
  month: number
  year: number
  total_trips: number
  total_weight_mt: number
  total_amount: number
  amount_paid: number
  due_date: string
  status: string
  pdf_url: string | null
  party: { full_name: string | null; email: string } | null
}

type PTC = {
  id: string
  bill_id: string
  party_id: string
  due_date: string
  credit_days: number
  terms_note: string | null
  status: 'pending' | 'confirmed' | 'disputed'
  confirmed_at: string | null
  dispute_note: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function fmtLakh(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`
  return fmtINR(n)
}

function tripStep(status: string): number {
  switch (status) {
    case 'confirmed':  return 0
    case 'loading':    return 1
    case 'loaded':     return 2
    case 'in_transit': return 3
    case 'delivered':  return 4
    default:           return -1
  }
}

function AcceptanceDot({ value }: { value: boolean | null }) {
  if (value === true)  return <span className="text-[10px] text-sx-green font-medium">Accepted</span>
  if (value === false) return <span className="text-[10px] text-sx-red font-medium">Declined</span>
  return <span className="text-[10px] text-sx-lo">Pending</span>
}

function StatusBadge({ status }: { status: string }) {
  const cls = TRUCK_STATUS_COLOR[status] ?? 'bg-sx-raised text-sx-lo'
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {TRUCK_STATUS_LABEL[status] ?? status.replace('_', ' ')}
    </span>
  )
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TraderDashboard() {
  const router   = useRouter()
  const supabase = createClient()

  const [userId, setUserId]       = useState<string | null>(null)
  const [orders, setOrders]       = useState<Order[]>([])
  const [suppliers, setSuppliers] = useState<User[]>([])
  const [drivers, setDrivers]     = useState<User[]>([])
  const [buyers, setBuyers]       = useState<User[]>([])
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState('today')

  // Team tab state
  const [invitations, setInvitations]           = useState<Invitation[]>([])
  const [inviteRole, setInviteRole]             = useState<'buyer' | 'supplier' | 'truck_driver'>('buyer')
  const [inviteName, setInviteName]             = useState('')
  const [inviteEmail, setInviteEmail]           = useState('')
  const [inviteSaving, setInviteSaving]         = useState(false)
  const [inviteError, setInviteError]           = useState('')
  const [inviteSuccess, setInviteSuccess]       = useState('')

  // Today tab state
  const [liveTrucks, setLiveTrucks]         = useState<DispatchTruck[]>([])
  const [assignModalTruckId, setAssignModal] = useState<string | null>(null)
  const [assignBuyerId, setAssignBuyerId]   = useState('')
  const [assignSaving, setAssignSaving]     = useState(false)

  // Deals state
  const [deals, setDeals]             = useState<Deal[]>([])
  const [dealSubtab, setDealSubtab]   = useState<'supplier' | 'driver' | 'buyer'>('supplier')
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)
  const [editRate, setEditRate]       = useState('')
  const [editTerms, setEditTerms]     = useState('')
  const [editCredit, setEditCredit]   = useState('')
  const [editSaving, setEditSaving]   = useState(false)

  // New order modal
  const [showNewOrder, setShowNewOrder]         = useState(false)
  const [newOrderBuyerId, setNewOrderBuyerId]   = useState('')
  const [newOrderMaterial, setNewOrderMaterial] = useState('Ordinary Sand')
  const [newOrderQty, setNewOrderQty]           = useState('')
  const [newOrderAddress, setNewOrderAddress]   = useState('')
  const [newOrderDate, setNewOrderDate]         = useState('')
  const [newOrderNote, setNewOrderNote]         = useState('')
  const [newOrderSaving, setNewOrderSaving]     = useState(false)
  const [newOrderError, setNewOrderError]       = useState('')

  // Smart match / confirm order modal
  const [activeOrder, setActiveOrder]           = useState<Order | null>(null)
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [selectedDriver, setSelectedDriver]     = useState('')
  const [confirming, setConfirming]             = useState(false)
  const [confirmError, setConfirmError]         = useState('')
  const [supplierRate, setSupplierRate]         = useState('')
  const [driverRate, setDriverRate]             = useState('')
  const [buyerRate, setBuyerRate]               = useState('')
  const [geminiAnalysis, setGeminiAnalysis]     = useState<string | null>(null)
  const [geminiLoading, setGeminiLoading]       = useState(false)
  const [matchLoading, setMatchLoading]         = useState(false)
  const [matchResult, setMatchResult]           = useState<{ best: SmartMatch; all: SmartMatch[]; aiUnavailable: boolean } | null>(null)
  const [matchMode, setMatchMode]               = useState<'suggestion' | 'manual'>('suggestion')

  // ─── Data fetchers ──────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        buyer:users!orders_buyer_id_fkey(id, full_name, email),
        challans(*),
        trips(id, status, supplier_accepted, driver_accepted,
          supplier:users!trips_supplier_id_fkey(full_name, email),
          driver:users!trips_driver_id_fkey(full_name, email))
      `)
      .order('created_at', { ascending: false })
    setOrders((data as Order[]) ?? [])
  }, [])

  const fetchBuyers = useCallback(async () => {
    const { data } = await supabase.from('users').select('id, full_name, email, address').eq('role', 'buyer')
    setBuyers(data ?? [])
  }, [])

  const fetchInvitations = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('user_invitations')
      .select('id, target_role, full_name, email, status, created_at')
      .eq('invited_by', uid)
      .order('created_at', { ascending: false })
    setInvitations((data as Invitation[]) ?? [])
  }, [])

  const fetchDeals = useCallback(async () => {
    const { data } = await supabase
      .from('deals')
      .select('*, party:users!deals_party_id_fkey(full_name, email)')
      .eq('is_active', true)
      .order('party_role')
    setDeals((data as Deal[]) ?? [])
  }, [])

  const fetchLiveTrucks = useCallback(async () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('dispatch_trucks')
      .select('id, truck_number, capacity_mt, status, buyer_id, assigned_at, created_at, buyer:users!dispatch_trucks_buyer_id_fkey(full_name, email)')
      .gte('created_at', todayStart.toISOString())
      .order('status')
    setLiveTrucks((data as unknown as DispatchTruck[]) ?? [])
  }, [])

  async function fetchRoleUsers() {
    const [{ data: sup }, { data: drv }] = await Promise.all([
      supabase.from('users').select('id, full_name, email').eq('role', 'supplier'),
      supabase.from('users').select('id, full_name, email').eq('role', 'driver'),
    ])
    setSuppliers(sup ?? [])
    setDrivers(drv ?? [])
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)
      await Promise.all([fetchOrders(), fetchRoleUsers(), fetchDeals(), fetchBuyers(), fetchLiveTrucks()])
      setLoading(false)

      const channel = supabase.channel('trader-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'challans' }, fetchOrders)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetchOrders)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_trucks' }, fetchLiveTrucks)
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    }
    init()
  }, [])

  useEffect(() => {
    if (activeTab === 'team' && userId) fetchInvitations(userId)
  }, [activeTab, userId])

  // Auto-fill delivery address from buyer's registered address
  useEffect(() => {
    if (!newOrderBuyerId) { setNewOrderAddress(''); return }
    const buyer = buyers.find(b => b.id === newOrderBuyerId)
    if (buyer?.address) setNewOrderAddress(buyer.address)
  }, [newOrderBuyerId, buyers])

  // Auto-fill rates when supplier/driver selection changes (manual mode)
  useEffect(() => {
    if (selectedSupplier) {
      const deal = deals.find(d => d.party_id === selectedSupplier && d.party_role === 'supplier')
      if (deal) setSupplierRate(String(deal.default_rate_per_mt))
    }
  }, [selectedSupplier, deals])

  useEffect(() => {
    if (selectedDriver) {
      const deal = deals.find(d => d.party_id === selectedDriver && d.party_role === 'driver')
      if (deal) setDriverRate(String(deal.default_rate_per_mt))
    }
  }, [selectedDriver, deals])

  useEffect(() => {
    if (matchResult) {
      const supDeal = deals.find(d => d.party_id === matchResult.best.supplier_id && d.party_role === 'supplier')
      const drvDeal = deals.find(d => d.party_id === matchResult.best.driver_id && d.party_role === 'driver')
      if (supDeal) setSupplierRate(String(supDeal.default_rate_per_mt))
      if (drvDeal) setDriverRate(String(drvDeal.default_rate_per_mt))
    }
  }, [matchResult, deals])

  // ─── Handlers ───────────────────────────────────────────────────────────────

  async function sendInvitation() {
    if (!userId || !inviteName.trim() || !inviteEmail.trim()) return
    setInviteSaving(true)
    setInviteError('')
    setInviteSuccess('')
    const { error } = await supabase.from('user_invitations').insert({
      invited_by: userId,
      target_role: inviteRole,
      full_name: inviteName.trim(),
      email: inviteEmail.toLowerCase().trim(),
      status: 'pending',
      requires_approval: true,
    })
    if (error) {
      setInviteError(error.message)
    } else {
      setInviteSuccess(`Invitation sent for ${inviteName}. Waiting for admin approval.`)
      setInviteName('')
      setInviteEmail('')
      if (userId) fetchInvitations(userId)
    }
    setInviteSaving(false)
  }

  function openModal(order: Order) {
    setActiveOrder(order)
    setSelectedSupplier('')
    setSelectedDriver('')
    setConfirmError('')
    setMatchResult(null)
    setMatchMode('suggestion')
    setGeminiAnalysis(null)
    setSupplierRate('')
    setDriverRate('')
    const buyerDeal = deals.find(d => d.party_id === order.buyer?.id && d.party_role === 'buyer')
    setBuyerRate(buyerDeal ? String(buyerDeal.default_rate_per_mt) : '')
    if (order.delivery_lat && order.delivery_lng) {
      runSmartMatch(order)
    } else {
      setMatchMode('manual')
    }
  }

  async function runSmartMatch(order: Order) {
    setMatchLoading(true)
    try {
      const res = await fetch('/api/smart-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId:     order.id,
          deliveryLat: order.delivery_lat,
          deliveryLng: order.delivery_lng,
          quantityMt:  order.quantity_mt,
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setMatchResult({
        best:          json.best_combination,
        all:           json.all_combinations,
        aiUnavailable: json.ai_unavailable,
      })
    } catch {
      setMatchMode('manual')
    }
    setMatchLoading(false)
  }

  async function runGeminiMargin() {
    if (!supplierRate || !driverRate || !buyerRate || !activeOrder) return
    setGeminiLoading(true)
    setGeminiAnalysis(null)
    try {
      const res = await fetch('/api/analyze-margin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierRate: Number(supplierRate),
          driverRate:   Number(driverRate),
          buyerRate:    Number(buyerRate),
          quantityMt:   activeOrder.quantity_mt,
          material:     activeOrder.material_type,
        }),
      })
      const json = await res.json()
      setGeminiAnalysis(json.analysis ?? json.error ?? 'No analysis returned.')
    } catch {
      setGeminiAnalysis('Unable to analyze margin at this time.')
    }
    setGeminiLoading(false)
  }

  async function handleConfirm() {
    const supplierId = matchMode === 'suggestion' && matchResult ? matchResult.best.supplier_id : selectedSupplier
    const driverId   = matchMode === 'suggestion' && matchResult ? matchResult.best.driver_id   : selectedDriver
    if (!activeOrder || !supplierId || !driverId || !userId) {
      setConfirmError('Please select both a supplier and a driver.')
      return
    }
    setConfirming(true)
    setConfirmError('')
    const sRate = Number(supplierRate) || 0
    const dRate = Number(driverRate) || 0
    const bRate = Number(buyerRate) || 0
    const qty   = activeOrder.quantity_mt

    if (activeOrder.status === 'pending') {
      const { error: orderErr } = await supabase
        .from('orders')
        .update({ status: 'confirmed', trader_id: userId })
        .eq('id', activeOrder.id)
      if (orderErr) { setConfirmError(orderErr.message); setConfirming(false); return }
    }

    const { data: tripData, error: tripErr } = await supabase.from('trips').insert({
      order_id:              activeOrder.id,
      supplier_id:           supplierId,
      driver_id:             driverId,
      quantity_mt:           qty,
      status:                'confirmed',
      supplier_rate_per_mt:  sRate,
      transport_rate_per_mt: dRate,
      sale_rate_per_mt:      bRate,
      supplier_amount:       sRate * qty,
      transport_amount:      dRate * qty,
      sale_amount:           bRate * qty,
      gross_margin:          (bRate - sRate - dRate) * qty,
      margin_percentage:     bRate > 0 ? ((bRate - sRate - dRate) / bRate) * 100 : 0,
    }).select('id').single()

    if (tripErr) { setConfirmError(tripErr.message); setConfirming(false); return }

    if (tripData?.id) {
      const tripRates: object[] = [
        {
          trip_id: tripData.id, party_id: supplierId, party_role: 'supplier',
          default_rate_per_mt: sRate, agreed_rate_per_mt: sRate,
          weight_mt: qty, total_amount: sRate * qty, rate_status: 'accepted',
        },
        {
          trip_id: tripData.id, party_id: driverId, party_role: 'driver',
          default_rate_per_mt: dRate, agreed_rate_per_mt: dRate,
          weight_mt: qty, total_amount: dRate * qty, rate_status: 'accepted',
        },
      ]
      if (activeOrder.buyer?.id && bRate > 0) {
        tripRates.push({
          trip_id: tripData.id, party_id: activeOrder.buyer.id, party_role: 'buyer',
          default_rate_per_mt: bRate, agreed_rate_per_mt: bRate,
          weight_mt: qty, total_amount: bRate * qty, rate_status: 'accepted',
        })
      }
      await supabase.from('trip_rates').insert(tripRates)
    }

    setConfirming(false)
    setActiveOrder(null)
    setMatchResult(null)
    await fetchOrders()
  }

  async function handleApproveChallan(challanId: string) {
    await supabase.from('challans').update({
      trader_approved: true,
      trader_approved_at: new Date().toISOString(),
    }).eq('id', challanId)
    await fetchOrders()
  }

  async function handleCreateOrderForBuyer() {
    if (!newOrderBuyerId || !newOrderQty || !newOrderAddress || !newOrderDate || !userId) {
      setNewOrderError('Please fill all required fields.')
      return
    }
    setNewOrderSaving(true)
    setNewOrderError('')
    const { error } = await supabase.from('orders').insert({
      buyer_id:             newOrderBuyerId,
      trader_id:            userId,
      material_type:        newOrderMaterial,
      quantity_mt:          parseFloat(newOrderQty),
      delivery_address:     newOrderAddress,
      scheduled_date:       newOrderDate,
      special_instructions: newOrderNote || null,
      status:               'pending',
    })
    if (error) { setNewOrderError(error.message); setNewOrderSaving(false); return }
    await supabase.from('notifications').insert({
      user_id: newOrderBuyerId,
      title:   'New Order Created',
      body:    `Your trader has created a new order for ${newOrderMaterial} (${newOrderQty} MT) scheduled on ${new Date(newOrderDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.`,
      type:    'order_created',
    })
    setShowNewOrder(false)
    setNewOrderBuyerId(''); setNewOrderQty(''); setNewOrderAddress(''); setNewOrderDate(''); setNewOrderNote('')
    setNewOrderSaving(false)
    await fetchOrders()
  }

  async function handleSaveDeal() {
    if (!editingDeal) return
    setEditSaving(true)
    await supabase.from('deals').update({
      default_rate_per_mt: Number(editRate),
      payment_terms: editTerms,
      credit_days: Number(editCredit),
    }).eq('id', editingDeal.id)
    await fetchDeals()
    setEditingDeal(null)
    setEditSaving(false)
  }

  async function handleAssignBuyer() {
    if (!assignModalTruckId || !assignBuyerId) return
    setAssignSaving(true)
    await supabase.from('dispatch_trucks')
      .update({ buyer_id: assignBuyerId, assigned_at: new Date().toISOString() })
      .eq('id', assignModalTruckId)
    setAssignModal(null)
    setAssignBuyerId('')
    setAssignSaving(false)
    await fetchLiveTrucks()
  }

  // ─── Loading ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-sx-base">
      <div className="text-sx-lo text-sm">Loading…</div>
    </div>
  )

  // ─── Derived state ───────────────────────────────────────────────────────────

  const pending   = orders.filter(o => o.status === 'pending')
  const confirmed = orders.filter(o => o.status !== 'pending')

  const needsReassignment = confirmed.filter(o =>
    o.trips?.some(t => t.status === 'declined') &&
    !o.trips?.some(t => !['declined', 'cancelled'].includes(t.status))
  )

  const pendingChallans = confirmed.filter(o =>
    o.challans?.some(c => c.buyer_confirmed && !c.trader_approved)
  )

  const margin = (Number(buyerRate) || 0) - (Number(supplierRate) || 0) - (Number(driverRate) || 0)
  const marginPct = (Number(buyerRate) || 0) > 0 ? (margin / Number(buyerRate)) * 100 : 0

  // Today stats
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const trucksOut    = liveTrucks.length
  const delivered    = liveTrucks.filter(t => t.status === 'delivered').length
  const unassigned   = liveTrucks.filter(t => !t.buyer_id && ['loaded', 'in_transit'].includes(t.status)).length

  // Exception alerts
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000)
  const twentyFourHAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const unassignedAlerts = liveTrucks.filter(t =>
    !t.buyer_id &&
    ['loaded', 'in_transit'].includes(t.status) &&
    t.assigned_at && new Date(t.assigned_at) < thirtyMinAgo
  )

  const staleChallanOrders = confirmed.filter(o =>
    o.challans?.some(c => !c.trader_approved && new Date(c.created_at) < twentyFourHAgo)
  )

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <AppShell
      role="trader"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      userId={userId}
      supabase={supabase}
    >

      {/* ══════════════════════════════════════════════════
          TAB 1: TODAY — Command Center
      ══════════════════════════════════════════════════ */}
      {activeTab === 'today' && (
        <div className="pt-16 pb-24 space-y-6">

          {/* A. KPI Bar */}
          <div>
            <p className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">Today's Overview</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Trucks Out */}
              <div className="bg-sx-card border border-sx-border rounded-2xl p-4">
                <p className="text-2xl font-bold text-sx-hi">🚛 {trucksOut}</p>
                <p className="text-xs text-sx-lo mt-1">Trucks Out</p>
              </div>
              {/* Delivered */}
              <div className="bg-sx-card border border-sx-border rounded-2xl p-4">
                <p className="text-2xl font-bold text-sx-green">✓ {delivered}</p>
                <p className="text-xs text-sx-lo mt-1">Delivered</p>
              </div>
              {/* Unassigned */}
              <div className={`rounded-2xl p-4 border ${unassigned > 0 ? 'bg-red-900/40 border-sx-red' : 'bg-sx-card border-sx-border'}`}>
                <p className={`text-2xl font-bold ${unassigned > 0 ? 'text-sx-red' : 'text-sx-hi'}`}>⚠ {unassigned}</p>
                <p className={`text-xs mt-1 ${unassigned > 0 ? 'text-sx-red' : 'text-sx-lo'}`}>Unassigned</p>
              </div>
              {/* Revenue */}
              <div className="bg-sx-card border border-sx-border rounded-2xl p-4">
                <p className="text-2xl font-bold text-sx-accent">₹ —</p>
                <p className="text-xs text-sx-lo mt-1">Today Rev</p>
              </div>
            </div>
          </div>

          {/* B. Exception Queue */}
          {(unassignedAlerts.length > 0 || staleChallanOrders.length > 0 || pendingChallans.length > 0) && (
            <div>
              <p className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">Exceptions</p>
              <div className="space-y-3">
                {unassignedAlerts.map(truck => {
                  const minsAgo = truck.assigned_at
                    ? Math.round((Date.now() - new Date(truck.assigned_at).getTime()) / 60000)
                    : null
                  return (
                    <div key={truck.id} className="bg-red-900/20 border border-sx-red rounded-2xl p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sx-red text-sm font-semibold">
                          Truck {truck.truck_number ?? truck.id.slice(0, 6)} — no buyer{minsAgo ? ` ${minsAgo}m` : ''}
                        </p>
                        <p className="text-sx-lo text-xs capitalize">{truck.status.replace('_', ' ')}, sitting idle</p>
                      </div>
                      <button
                        onClick={() => { setAssignModal(truck.id); setAssignBuyerId('') }}
                        className="bg-sx-accent text-white rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap"
                      >
                        Assign Buyer
                      </button>
                    </div>
                  )
                })}

                {staleChallanOrders.map(order => {
                  const staleChallan = order.challans.find(c => !c.trader_approved && new Date(c.created_at) < twentyFourHAgo)
                  if (!staleChallan) return null
                  const hoursAgo = Math.round((Date.now() - new Date(staleChallan.created_at).getTime()) / 3600000)
                  return (
                    <div key={order.id} className="bg-yellow-900/20 border border-sx-amber rounded-2xl p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sx-amber text-sm font-semibold">
                          Challan pending {hoursAgo}h — {order.material_type}
                        </p>
                        <p className="text-sx-lo text-xs">{order.delivery_address}</p>
                      </div>
                      <button
                        onClick={() => handleApproveChallan(staleChallan.id)}
                        className="bg-sx-amber text-black rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap"
                      >
                        Approve
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* C. Live Truck Board */}
          <div>
            <p className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">Live Truck Board</p>
            {liveTrucks.length === 0 ? (
              <div className="bg-sx-card border border-sx-border rounded-xl px-5 py-10 text-center text-sx-lo text-sm">
                No trucks dispatched today.
              </div>
            ) : (
              <div className="space-y-2">
                {liveTrucks.map(truck => (
                  <div key={truck.id} className="bg-sx-card border border-sx-border rounded-xl p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sx-hi font-semibold text-sm">{truck.truck_number ?? '—'}</p>
                      <p className="text-sx-lo text-xs">{truck.capacity_mt ? `${truck.capacity_mt} MT` : 'Unknown cap.'}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {truck.buyer_id ? (
                        <span className="text-sx-green text-xs">{truck.buyer?.full_name ?? truck.buyer?.email ?? '—'}</span>
                      ) : (
                        <span className="bg-red-900/40 text-sx-red text-xs px-2 py-0.5 rounded-full font-semibold">NO BUYER</span>
                      )}
                      <StatusBadge status={truck.status} />
                      {!truck.buyer_id && (
                        <button
                          onClick={() => { setAssignModal(truck.id); setAssignBuyerId('') }}
                          className="text-xs bg-sx-accent text-white px-3 py-1 rounded-lg font-semibold"
                        >
                          Assign
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* D. Pending Actions */}
          {(pending.length > 0 || needsReassignment.length > 0) && (
            <div>
              <p className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">Pending Actions</p>
              <div className="space-y-2">
                {pending.map(order => (
                  <div key={order.id} className="bg-sx-card border border-sx-border rounded-xl p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sx-hi text-sm font-semibold">{order.material_type} · {order.quantity_mt} MT</p>
                      <p className="text-sx-lo text-xs truncate">{order.buyer?.full_name ?? order.buyer?.email ?? '—'}</p>
                    </div>
                    <button
                      onClick={() => openModal(order)}
                      className="text-xs bg-sx-accent text-white px-4 py-2 rounded-xl font-semibold whitespace-nowrap"
                    >
                      Confirm Order
                    </button>
                  </div>
                ))}
                {needsReassignment.map(order => (
                  <div key={order.id} className="bg-red-900/20 border border-sx-red rounded-xl p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sx-red text-sm font-semibold">{order.material_type} — Trip Declined</p>
                      <p className="text-sx-lo text-xs truncate">{order.delivery_address}</p>
                    </div>
                    <button
                      onClick={() => openModal(order)}
                      className="text-xs bg-sx-accent text-white px-4 py-2 rounded-xl font-semibold whitespace-nowrap"
                    >
                      Reassign
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB 2: ORDERS
      ══════════════════════════════════════════════════ */}
      {activeTab === 'orders' && (
        <div className="pt-16 pb-24 space-y-8">

          {/* Header + New Order */}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest">
              Pending Orders <span className="text-sx-accent">({pending.length})</span>
            </h3>
            <button
              onClick={() => setShowNewOrder(true)}
              className="text-xs bg-sx-accent text-white px-3 py-1.5 rounded-lg font-semibold"
            >
              + New Order for Buyer
            </button>
          </div>

          {/* Pending Orders */}
          <div>
            {pending.length === 0 ? (
              <div className="bg-sx-card border border-sx-border rounded-xl px-5 py-10 text-center text-sx-lo text-sm">
                No pending orders.
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map(order => (
                  <OrderCard key={order.id} order={order} onConfirm={() => openModal(order)} />
                ))}
              </div>
            )}
          </div>

          {/* Needs Reassignment */}
          {needsReassignment.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">
                Needs Reassignment <span className="text-sx-red">({needsReassignment.length})</span>
              </h3>
              <div className="space-y-3">
                {needsReassignment.map(order => {
                  const declinedTrip = order.trips.find(t => t.status === 'declined')!
                  const declinedBy = declinedTrip.supplier_accepted === false
                    ? `Supplier (${declinedTrip.supplier?.full_name ?? declinedTrip.supplier?.email ?? '—'})`
                    : `Driver (${declinedTrip.driver?.full_name ?? declinedTrip.driver?.email ?? '—'})`
                  return (
                    <div key={order.id} className="bg-sx-card border border-sx-red/50 rounded-xl px-5 py-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-medium text-sx-hi">{order.material_type}</span>
                          <span className="text-sx-lo text-sm ml-2">· {order.quantity_mt} MT</span>
                        </div>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-900/40 text-sx-red">Declined</span>
                      </div>
                      <p className="text-sm text-sx-lo">{order.delivery_address}</p>
                      <p className="text-xs text-sx-red">Declined by: <span className="font-medium">{declinedBy}</span></p>
                      <button
                        onClick={() => openModal(order)}
                        className="w-full bg-sx-accent text-white rounded-lg py-2 text-sm font-semibold"
                      >
                        Reassign Trip
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Challans to Approve */}
          {pendingChallans.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">
                Challans to Approve <span className="text-sx-amber">({pendingChallans.length})</span>
              </h3>
              <div className="space-y-3">
                {pendingChallans.map(order => {
                  const challan = order.challans.find(c => c.buyer_confirmed && !c.trader_approved)!
                  return (
                    <div key={order.id} className="bg-sx-card border border-sx-border rounded-xl px-5 py-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-medium text-sx-hi">{order.material_type}</span>
                          <span className="text-sx-lo text-sm ml-2">· {order.quantity_mt} MT</span>
                        </div>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-900/40 text-sx-amber">Awaiting Approval</span>
                      </div>
                      <p className="text-sm text-sx-lo">{order.delivery_address}</p>
                      <p className="text-xs text-sx-lo">Buyer: <span className="text-sx-hi font-medium">{order.buyer?.full_name ?? order.buyer?.email ?? '—'}</span></p>
                      {challan.net_weight && (
                        <p className="text-xs text-sx-lo">Net weight: <span className="font-medium text-sx-hi">{challan.net_weight} MT</span></p>
                      )}
                      <div className="flex gap-2">
                        {challan.pdf_url && (
                          <a href={challan.pdf_url} target="_blank" rel="noreferrer"
                            className="flex-1 text-center border border-sx-border rounded-lg py-1.5 text-sm text-sx-blue hover:bg-sx-raised">
                            View PDF
                          </a>
                        )}
                        <button onClick={() => handleApproveChallan(challan.id)}
                          className="flex-1 bg-sx-green/20 border border-sx-green text-sx-green rounded-lg py-1.5 text-sm font-semibold hover:bg-sx-green/30 transition">
                          Approve Challan
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* All Confirmed Orders */}
          {confirmed.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">All Orders</h3>
              <div className="space-y-3">
                {confirmed.map(order => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            </div>
          )}

          {/* Deals & Rates sub-section */}
          <div>
            <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">Deals & Rates</h3>
            <DealsSection
              deals={deals}
              subtab={dealSubtab}
              setSubtab={setDealSubtab}
              editingDeal={editingDeal}
              editRate={editRate}
              editTerms={editTerms}
              editCredit={editCredit}
              editSaving={editSaving}
              onEdit={(deal) => {
                setEditingDeal(deal)
                setEditRate(String(deal.default_rate_per_mt))
                setEditTerms(deal.payment_terms)
                setEditCredit(String(deal.credit_days))
              }}
              onCancelEdit={() => setEditingDeal(null)}
              onSave={handleSaveDeal}
              setEditRate={setEditRate}
              setEditTerms={setEditTerms}
              setEditCredit={setEditCredit}
            />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB 3: FLEET
      ══════════════════════════════════════════════════ */}
      {activeTab === 'fleet' && userId && (
        <div className="pt-16 pb-24 space-y-6">
          {/* Available Fleet + Active Dispatches */}
          <div>
            <p className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">Available Fleet · Active Dispatches</p>
            <FleetTab userId={userId} supabase={supabase} buyers={buyers} suppliers={suppliers} />
          </div>

          {/* Live Status */}
          <div>
            <p className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">Live Status</p>
            <LiveTab userId={userId} supabase={supabase} buyers={buyers} />
          </div>

          {/* Map placeholder */}
          <div>
            <p className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">Map</p>
            <div className="bg-sx-card border border-sx-border rounded-2xl flex items-center justify-center h-48 text-sx-lo text-sm">
              Map view — coming soon
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB 4: FINANCE
      ══════════════════════════════════════════════════ */}
      {activeTab === 'finance' && userId && (
        <div className="pt-16 pb-24 space-y-6">
          <FinanceSection traderId={userId} />
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════ */}

      {/* Assign Buyer Modal */}
      {assignModalTruckId && (
        <div className="fixed inset-0 bg-black/70 z-50 flex sm:items-center items-end justify-center p-4">
          <div className="bg-sx-card border border-sx-border rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sx-hi">Assign Buyer to Truck</h3>
              <button onClick={() => setAssignModal(null)} className="text-sx-lo hover:text-sx-hi text-xl leading-none">×</button>
            </div>
            <div>
              <label className="text-xs font-semibold text-sx-lo block mb-1">Select Buyer</label>
              <select
                value={assignBuyerId}
                onChange={e => setAssignBuyerId(e.target.value)}
                className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent"
              >
                <option value="">Select buyer…</option>
                {buyers.map(b => <option key={b.id} value={b.id}>{b.full_name ?? b.email}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAssignBuyer} disabled={assignSaving || !assignBuyerId}
                className="flex-1 bg-sx-accent text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-50">
                {assignSaving ? 'Assigning…' : 'Confirm'}
              </button>
              <button onClick={() => setAssignModal(null)}
                className="px-5 py-2.5 border border-sx-border rounded-xl text-sm text-sx-lo hover:text-sx-hi">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Order for Buyer Modal */}
      {showNewOrder && (
        <div className="fixed inset-0 z-50 flex sm:items-center items-end justify-center bg-black/70 p-4">
          <div className="bg-sx-card border border-sx-border rounded-2xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sx-hi">Create Order for Buyer</h3>
              <button onClick={() => { setShowNewOrder(false); setNewOrderError('') }} className="text-sx-lo hover:text-sx-hi text-xl leading-none">×</button>
            </div>
            {newOrderError && <p className="text-sm text-sx-red bg-red-900/20 rounded-lg px-3 py-2">{newOrderError}</p>}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-sx-lo block mb-1">Buyer *</label>
                <select value={newOrderBuyerId} onChange={e => setNewOrderBuyerId(e.target.value)}
                  className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
                  <option value="">Select buyer…</option>
                  {buyers.map(b => <option key={b.id} value={b.id}>{b.full_name ?? b.email}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-sx-lo block mb-1">Material *</label>
                <select value={newOrderMaterial} onChange={e => setNewOrderMaterial(e.target.value)}
                  className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
                  {['Ordinary Sand', 'River Sand', 'M-Sand'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-sx-lo block mb-1">Quantity (MT) *</label>
                <input type="number" placeholder="e.g. 20" value={newOrderQty} onChange={e => setNewOrderQty(e.target.value)}
                  className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-sx-lo">Delivery Address *</label>
                  {newOrderBuyerId && buyers.find(b => b.id === newOrderBuyerId)?.address && (
                    <span className="text-[10px] text-sx-green font-medium">Auto-filled from buyer profile</span>
                  )}
                </div>
                <input type="text" placeholder="Full delivery address" value={newOrderAddress} onChange={e => setNewOrderAddress(e.target.value)}
                  className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent" />
              </div>
              <div>
                <label className="text-xs font-semibold text-sx-lo block mb-1">Scheduled Date *</label>
                <input type="date" value={newOrderDate} onChange={e => setNewOrderDate(e.target.value)}
                  className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent" />
              </div>
              <div>
                <label className="text-xs font-semibold text-sx-lo block mb-1">Special Instructions</label>
                <textarea rows={2} placeholder="Optional note…" value={newOrderNote} onChange={e => setNewOrderNote(e.target.value)}
                  className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent resize-none" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleCreateOrderForBuyer} disabled={newOrderSaving}
                className="flex-1 bg-sx-accent text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-50">
                {newOrderSaving ? 'Creating…' : 'Create Order'}
              </button>
              <button onClick={() => { setShowNewOrder(false); setNewOrderError('') }}
                className="px-5 py-2.5 border border-sx-border rounded-xl text-sm text-sx-lo hover:text-sx-hi">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Match / Confirm Order Modal */}
      {activeOrder && (
        <div className="fixed inset-0 bg-black/70 flex sm:items-center items-end justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-sx-card border border-sx-border rounded-2xl w-full max-w-lg my-4 overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-sx-border">
              <h3 className="font-semibold text-sx-hi text-lg">
                {activeOrder.status === 'pending' ? 'Confirm Order' : 'Reassign Trip'}
              </h3>
              <div className="bg-sx-raised rounded-xl px-4 py-3 text-sm space-y-1 mt-3">
                <p><span className="text-sx-lo">Material:</span> <span className="font-semibold text-sx-hi">{activeOrder.material_type}</span></p>
                <p><span className="text-sx-lo">Qty:</span> <span className="font-semibold text-sx-hi">{activeOrder.quantity_mt} MT</span></p>
                <p><span className="text-sx-lo">Buyer:</span> <span className="font-semibold text-sx-hi">{activeOrder.buyer?.full_name ?? activeOrder.buyer?.email ?? '—'}</span></p>
                <p><span className="text-sx-lo">Address:</span> <span className="font-semibold text-sx-hi">{activeOrder.delivery_address || '—'}</span></p>
                {!activeOrder.delivery_lat && (
                  <p className="text-[11px] text-sx-amber mt-1">No coordinates on this order — smart match unavailable. Assign manually.</p>
                )}
              </div>
            </div>

            <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">

              {/* Smart Match loading */}
              {matchLoading && (
                <div className="flex items-center gap-3 bg-blue-900/20 border border-sx-blue rounded-xl px-4 py-3">
                  <svg className="animate-spin w-5 h-5 text-sx-blue" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <p className="text-sm text-sx-blue font-medium">Finding best supplier-driver combination…</p>
                </div>
              )}

              {/* AI unavailable notice */}
              {matchResult?.aiUnavailable && (
                <p className="text-xs text-sx-amber bg-yellow-900/20 rounded-lg px-3 py-2">
                  AI suggestion unavailable — showing combinations sorted by distance.
                </p>
              )}

              {/* Smart Match result */}
              {matchResult && !matchLoading && matchMode === 'suggestion' && (
                <div className="space-y-3">
                  <div className="border-2 border-sx-accent rounded-xl p-4 space-y-2 bg-orange-900/10">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold bg-sx-accent text-white px-2 py-0.5 rounded-full">Best Match</span>
                      {!matchResult.aiUnavailable && <span className="text-xs text-sx-lo">Gemini AI</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-sx-raised rounded-lg p-3 space-y-0.5">
                        <p className="text-[10px] text-sx-lo uppercase font-semibold">Supplier</p>
                        <p className="text-sm font-semibold text-sx-hi">{matchResult.best.supplier_name}</p>
                        <p className="text-xs text-sx-lo">{matchResult.best.supplier_address}</p>
                        <p className="text-xs text-sx-accent font-medium">{matchResult.best.supplier_to_delivery_km} km to delivery</p>
                      </div>
                      <div className="bg-sx-raised rounded-lg p-3 space-y-0.5">
                        <p className="text-[10px] text-sx-lo uppercase font-semibold">Driver</p>
                        <p className="text-sm font-semibold text-sx-hi">{matchResult.best.driver_name}</p>
                        {matchResult.best.driver_truck && <p className="text-xs text-sx-lo">{matchResult.best.driver_truck}</p>}
                        <p className="text-xs text-sx-accent font-medium">{matchResult.best.driver_to_supplier_km} km to supplier</p>
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs text-sx-lo pt-1">
                      <span>Total: <strong className="text-sx-hi">{matchResult.best.total_distance_km} km</strong></span>
                      <span>~{Math.round(matchResult.best.total_duration_minutes)} min</span>
                      <span>Fuel est: <strong className="text-sx-hi">₹{matchResult.best.estimated_fuel_cost}</strong></span>
                    </div>
                    {matchResult.best.reasoning && (
                      <p className="text-xs text-sx-lo italic border-t border-sx-border pt-2">{matchResult.best.reasoning}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleConfirm} disabled={confirming}
                      className="flex-1 bg-sx-green/20 border border-sx-green text-sx-green rounded-lg py-2 text-sm font-semibold disabled:opacity-50 transition">
                      {confirming ? 'Confirming…' : 'Accept Suggestion'}
                    </button>
                    <button onClick={() => setMatchMode('manual')}
                      className="px-4 py-2 text-sm text-sx-lo hover:text-sx-hi border border-sx-border rounded-lg">
                      Choose Manually
                    </button>
                  </div>
                  {matchResult.all.length > 1 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-sx-lo uppercase">Other Options</p>
                      {matchResult.all.slice(1, 5).map((c, i) => (
                        <div key={i} className="border border-sx-border rounded-lg p-3 space-y-1 bg-sx-raised">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] bg-sx-base text-sx-lo px-1.5 py-0.5 rounded font-medium">#{(c.rank ?? i + 2)}</span>
                            <span className="text-xs text-sx-lo">{c.total_distance_km} km · ₹{c.estimated_fuel_cost}</span>
                          </div>
                          <p className="text-xs text-sx-hi"><span className="font-medium">{c.supplier_name}</span> + <span className="font-medium">{c.driver_name}</span></p>
                          <button onClick={() => {
                            setMatchResult(prev => prev ? { ...prev, best: c } : prev)
                            setMatchMode('suggestion')
                          }} className="text-xs text-sx-accent hover:text-orange-400 font-medium">
                            Select this combination
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Manual selection */}
              {(matchMode === 'manual' || !activeOrder.delivery_lat) && (
                <div className="space-y-3">
                  {matchResult && (
                    <button onClick={() => setMatchMode('suggestion')} className="text-xs text-sx-blue hover:text-blue-300">
                      ← Back to AI suggestion
                    </button>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-sx-lo mb-1">Assign Supplier</label>
                    <select value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}
                      className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
                      <option value="">Select supplier…</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.full_name ?? s.email}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-sx-lo mb-1">Assign Driver</label>
                    <select value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}
                      className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
                      <option value="">Select driver…</option>
                      {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name ?? d.email}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Rate section */}
              {((matchMode === 'suggestion' && matchResult) || (matchMode === 'manual' && (selectedSupplier || selectedDriver))) && (
                <div className="border border-sx-border rounded-xl p-4 space-y-3 bg-sx-raised">
                  <p className="text-xs font-semibold text-sx-lo uppercase tracking-wide">Trip Rates (₹/MT)</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Supplier rate', value: supplierRate, set: setSupplierRate },
                      { label: 'Transport rate', value: driverRate,   set: setDriverRate },
                      { label: 'Sale rate',      value: buyerRate,    set: setBuyerRate },
                    ].map(({ label, value, set }) => (
                      <div key={label} className="flex items-center gap-3">
                        <span className="text-sm text-sx-lo w-28 shrink-0">{label}</span>
                        <div className="flex-1 flex items-center gap-1">
                          <span className="text-sx-lo text-sm">₹</span>
                          <input type="number" value={value} onChange={e => set(e.target.value)}
                            placeholder="0"
                            className="w-full bg-sx-base border border-sx-border text-sx-hi rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent" />
                          <span className="text-xs text-sx-lo">/MT</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Margin display */}
                  {supplierRate && driverRate && buyerRate && (
                    <div className={`rounded-lg px-3 py-2 text-sm font-medium ${margin >= 0 ? 'bg-green-900/20 text-sx-green' : 'bg-red-900/20 text-sx-red'}`}>
                      Margin: ₹{margin.toFixed(0)}/MT ({marginPct.toFixed(1)}%)
                      &nbsp;·&nbsp; Total: {fmtINR(margin * activeOrder.quantity_mt)}
                    </div>
                  )}

                  {/* Gemini analysis */}
                  {supplierRate && driverRate && buyerRate && (
                    <div className="space-y-2">
                      <button onClick={runGeminiMargin} disabled={geminiLoading}
                        className="text-xs font-semibold text-purple-400 hover:text-purple-300 border border-purple-800 rounded-lg px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50">
                        {geminiLoading
                          ? <><svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Analyzing…</>
                          : '✦ Analyze margin with Gemini'
                        }
                      </button>
                      {geminiAnalysis && (
                        <div className="bg-purple-900/20 border border-purple-800 rounded-lg px-3 py-2 text-xs text-purple-300 leading-relaxed">
                          {geminiAnalysis}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {confirmError && <p className="text-sm text-sx-red">{confirmError}</p>}

              {/* Confirm / Cancel buttons (manual mode) */}
              {(matchMode === 'manual' || !activeOrder.delivery_lat) && (
                <div className="flex gap-3 pt-1">
                  <button onClick={handleConfirm} disabled={confirming}
                    className="flex-1 bg-sx-accent text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                    {confirming ? 'Saving…' : activeOrder.status === 'pending' ? 'Confirm Order' : 'Reassign Trip'}
                  </button>
                  <button onClick={() => { setActiveOrder(null); setMatchResult(null) }}
                    className="px-4 py-2 text-sm text-sx-lo hover:text-sx-hi border border-sx-border rounded-lg">
                    Cancel
                  </button>
                </div>
              )}

              {matchMode === 'suggestion' && matchResult && (
                <button onClick={() => { setActiveOrder(null); setMatchResult(null) }}
                  className="w-full py-2 text-sm text-sx-lo hover:text-sx-hi">
                  Cancel
                </button>
              )}

              {matchLoading && (
                <button onClick={() => { setActiveOrder(null); setMatchLoading(false) }}
                  className="w-full py-2 text-sm text-sx-lo hover:text-sx-hi">
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB 5: TEAM — Invite Members
      ══════════════════════════════════════════════════ */}
      {activeTab === 'team' && (
        <div className="pt-16 pb-24 space-y-6">
          <h2 className="font-semibold text-sx-hi">Invite Team Members</h2>
          <p className="text-xs text-sx-lo">Invitations require admin approval before the person can sign up.</p>

          {/* Invite form */}
          <div className="bg-sx-card border border-sx-border rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-sx-hi">New Invitation</h3>
            <div>
              <label className="text-xs font-medium text-sx-lo block mb-1 uppercase tracking-wide">Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value as typeof inviteRole)}
                className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
                <option value="buyer">Buyer (RMC Plant Owner)</option>
                <option value="supplier">Supplier (Stockyard Owner)</option>
                <option value="truck_driver">Fleet Owner (Truck Fleet)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-sx-lo block mb-1 uppercase tracking-wide">Full Name</label>
              <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Contact name"
                className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent" />
            </div>
            <div>
              <label className="text-xs font-medium text-sx-lo block mb-1 uppercase tracking-wide">Email</label>
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="they@example.com"
                className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent" />
            </div>
            {inviteError   && <p className="text-xs text-sx-red">{inviteError}</p>}
            {inviteSuccess && <p className="text-xs text-sx-green">{inviteSuccess}</p>}
            <button onClick={sendInvitation} disabled={inviteSaving || !inviteName.trim() || !inviteEmail.trim()}
              className="w-full bg-sx-accent text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition">
              {inviteSaving ? 'Sending…' : 'Send Invitation →'}
            </button>
          </div>

          {/* Invitations list */}
          <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest">Sent Invitations</h3>
          {invitations.length === 0 ? (
            <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-10 text-center text-sx-lo text-sm">
              No invitations sent yet.
            </div>
          ) : (
            <div className="space-y-3">
              {invitations.map(inv => (
                <div key={inv.id} className="bg-sx-card border border-sx-border rounded-2xl px-5 py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sx-hi text-sm truncate">{inv.full_name}</p>
                    <p className="text-xs text-sx-lo truncate">{inv.email}</p>
                    <p className="text-xs text-sx-lo mt-0.5 capitalize">{inv.target_role.replace('_', ' ')}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                    inv.status === 'approved' ? 'bg-green-900/40 text-sx-green' :
                    inv.status === 'rejected' ? 'bg-red-900/40 text-sx-red' :
                    inv.status === 'used'     ? 'bg-blue-900/40 text-sx-blue' :
                    'bg-amber-900/40 text-sx-amber'
                  }`}>
                    {inv.status === 'used' ? 'Signed Up' : inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  )
}

// ─── OrderCard ────────────────────────────────────────────────────────────────

function OrderCard({ order, onConfirm }: { order: Order; onConfirm?: () => void }) {
  const activeTrip = order.trips?.find(t => t.status !== 'declined') ?? order.trips?.[0] ?? null
  const step = activeTrip ? tripStep(activeTrip.status) : -1

  return (
    <div className="bg-sx-card border border-sx-border rounded-xl px-5 py-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-medium text-sx-hi">{order.material_type}</span>
          <span className="text-sx-lo text-sm ml-2">· {order.quantity_mt} MT</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize whitespace-nowrap ${STATUS_STYLES[order.status] ?? 'bg-sx-raised text-sx-lo'}`}>
          {order.status.replace('_', ' ')}
        </span>
      </div>

      <p className="text-sm text-sx-lo">{order.delivery_address}</p>
      <p className="text-xs text-sx-lo">
        Buyer: <span className="text-sx-hi font-medium">{order.buyer?.full_name ?? order.buyer?.email ?? '—'}</span>
        &nbsp;·&nbsp;
        {new Date(order.scheduled_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>

      {activeTrip && (
        <div className="border border-sx-border rounded-lg p-3 space-y-2 bg-sx-raised">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${TRIP_STATUS_STYLES[activeTrip.status] ?? 'bg-sx-base text-sx-lo'}`}>
              Trip: {activeTrip.status.replace('_', ' ')}
            </span>
            <div className="flex gap-3 text-xs text-sx-lo">
              <span>Supplier: <AcceptanceDot value={activeTrip.supplier_accepted} /></span>
              <span>Driver: <AcceptanceDot value={activeTrip.driver_accepted} /></span>
            </div>
          </div>
          <div className="text-xs text-sx-lo space-y-0.5">
            <p>Supplier: <span className="text-sx-hi font-medium">{activeTrip.supplier?.full_name ?? activeTrip.supplier?.email ?? '—'}</span></p>
            <p>Driver: <span className="text-sx-hi font-medium">{activeTrip.driver?.full_name ?? activeTrip.driver?.email ?? '—'}</span></p>
          </div>
          {step >= 0 && activeTrip.status !== 'declined' && (
            <div className="pt-1">
              <div className="flex items-center">
                {TRIP_STEPS.map((label, i) => (
                  <div key={label} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors ${
                        i <= step ? 'bg-sx-accent text-white' : 'bg-sx-raised text-sx-lo'
                      }`}>
                        {i < step ? '✓' : i + 1}
                      </div>
                      <span className={`text-[9px] mt-0.5 text-center leading-tight w-10 ${i <= step ? 'text-sx-accent font-medium' : 'text-sx-lo'}`}>
                        {label}
                      </span>
                    </div>
                    {i < TRIP_STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 mb-3.5 mx-0.5 ${i < step ? 'bg-sx-accent' : 'bg-sx-border'}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {order.challans?.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${order.challans[0].buyer_confirmed ? 'bg-green-900/40 text-sx-green' : 'bg-sx-raised text-sx-lo'}`}>
            {order.challans[0].buyer_confirmed ? 'Buyer confirmed' : 'Buyer not confirmed'}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${order.challans[0].trader_approved ? 'bg-blue-900/40 text-sx-blue' : 'bg-sx-raised text-sx-lo'}`}>
            {order.challans[0].trader_approved ? 'Challan approved' : 'Challan not approved'}
          </span>
        </div>
      )}

      {onConfirm && (
        <button onClick={onConfirm}
          className="w-full bg-sx-accent text-white rounded-lg py-1.5 text-sm font-semibold hover:bg-orange-600 transition">
          Confirm Order
        </button>
      )}
    </div>
  )
}

// ─── Deals Section ────────────────────────────────────────────────────────────

type DealsSectionProps = {
  deals: Deal[]
  subtab: 'supplier' | 'driver' | 'buyer'
  setSubtab: (v: 'supplier' | 'driver' | 'buyer') => void
  editingDeal: Deal | null
  editRate: string
  editTerms: string
  editCredit: string
  editSaving: boolean
  onEdit: (deal: Deal) => void
  onCancelEdit: () => void
  onSave: () => void
  setEditRate: (v: string) => void
  setEditTerms: (v: string) => void
  setEditCredit: (v: string) => void
}

function DealsSection({ deals, subtab, setSubtab, editingDeal, editRate, editTerms, editCredit, editSaving, onEdit, onCancelEdit, onSave, setEditRate, setEditTerms, setEditCredit }: DealsSectionProps) {
  const filtered = deals.filter(d => d.party_role === subtab)
  const ROLE_LABEL: Record<string, string> = { supplier: 'Suppliers', driver: 'Transporters', buyer: 'Buyers' }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-sx-raised rounded-xl p-1">
        {(['supplier', 'driver', 'buyer'] as const).map(role => (
          <button key={role} onClick={() => setSubtab(role)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${subtab === role ? 'bg-sx-card text-sx-accent shadow-sm' : 'text-sx-lo hover:text-sx-hi'}`}>
            {ROLE_LABEL[role]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-sx-card border border-sx-border rounded-xl px-5 py-10 text-center text-sx-lo text-sm">
          No deals set up for {ROLE_LABEL[subtab].toLowerCase()}.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(deal => (
            <div key={deal.id} className="bg-sx-card border border-sx-border rounded-xl px-5 py-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sx-hi">{deal.party?.full_name ?? deal.party?.email ?? '—'}</p>
                  <p className="text-xs text-sx-lo">{deal.party?.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-sx-accent">₹{deal.default_rate_per_mt}<span className="text-xs text-sx-lo font-normal">/MT</span></p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${deal.is_active ? 'bg-green-900/40 text-sx-green' : 'bg-sx-raised text-sx-lo'}`}>
                    {deal.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex gap-4 text-xs text-sx-lo">
                <span>Terms: <span className="text-sx-hi font-medium capitalize">{deal.payment_terms.replace('_', ' ')}</span></span>
                <span>Credit: <span className="text-sx-hi font-medium">{deal.credit_days} days</span></span>
              </div>
              {editingDeal?.id === deal.id ? (
                <div className="mt-3 space-y-2 border-t border-sx-border pt-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-sx-lo uppercase font-semibold">Rate (₹/MT)</label>
                      <input type="number" value={editRate} onChange={e => setEditRate(e.target.value)}
                        className="w-full mt-0.5 bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-sx-lo uppercase font-semibold">Credit days</label>
                      <input type="number" value={editCredit} onChange={e => setEditCredit(e.target.value)}
                        className="w-full mt-0.5 bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-sx-lo uppercase font-semibold">Payment terms</label>
                    <select value={editTerms} onChange={e => setEditTerms(e.target.value)}
                      className="w-full mt-0.5 bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
                      <option value="prepaid">Prepaid</option>
                      <option value="on_delivery">On delivery</option>
                      <option value="monthly">Monthly</option>
                      <option value="credit">Credit</option>
                    </select>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={onSave} disabled={editSaving}
                      className="flex-1 bg-sx-accent text-white rounded-lg py-1.5 text-sm font-semibold disabled:opacity-50">
                      {editSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={onCancelEdit}
                      className="px-4 py-1.5 text-sm text-sx-lo border border-sx-border rounded-lg hover:text-sx-hi">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => onEdit(deal)}
                  className="mt-3 w-full border border-sx-border rounded-lg py-1.5 text-sm text-sx-lo hover:text-sx-hi hover:bg-sx-raised transition">
                  Edit Rate
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Finance Section ──────────────────────────────────────────────────────────

function FinanceSection({ traderId }: { traderId: string }) {
  const supabase = createClient()
  const now = new Date()
  const [financeTab, setFinanceTab] = useState<'billing' | 'payments'>('billing')
  const [month, setMonth]         = useState(now.getMonth() + 1)
  const [year, setYear]           = useState(now.getFullYear())
  const [billingSubtab, setBillingSubtab] = useState<'supplier' | 'driver' | 'buyer'>('supplier')
  const [bills, setBills]         = useState<MonthlyBill[]>([])
  const [parties, setParties]     = useState<User[]>([])
  const [generating, setGenerating] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [confirmations, setConfirmations] = useState<Record<string, PTC>>({})
  const [editDue, setEditDue]     = useState<Record<string, string>>({})
  const [editNote, setEditNote]   = useState<Record<string, string>>({})
  const [sending, setSending]     = useState<string | null>(null)

  // Payments
  const [paySubtab, setPaySubtab] = useState<'receive' | 'pay'>('receive')
  const [payBills, setPayBills]   = useState<MonthlyBill[]>([])
  const [logBill, setLogBill]     = useState<MonthlyBill | null>(null)
  const [logAmount, setLogAmount] = useState('')
  const [logNote, setLogNote]     = useState('')
  const [logSaving, setLogSaving] = useState(false)

  useEffect(() => {
    fetchBills()
    fetchParties()
  }, [month, year, billingSubtab])

  useEffect(() => {
    fetchPayBills()
  }, [month, year])

  async function fetchBills() {
    const { data } = await supabase
      .from('monthly_bills')
      .select('*, party:users!monthly_bills_party_id_fkey(full_name, email)')
      .eq('trader_id', traderId)
      .eq('month', month)
      .eq('year', year)
      .eq('party_role', billingSubtab)
    const list = (data as MonthlyBill[]) ?? []
    setBills(list)
    if (list.length > 0) {
      const ids = list.map(b => b.id)
      const { data: ptcs } = await supabase
        .from('payment_term_confirmations')
        .select('*')
        .in('bill_id', ids)
      const map: Record<string, PTC> = {}
      ;(ptcs ?? []).forEach((p: PTC) => { map[p.bill_id] = p })
      setConfirmations(map)
    }
  }

  async function fetchParties() {
    const { data } = await supabase.from('users').select('id, full_name, email').eq('role', billingSubtab === 'driver' ? 'driver' : billingSubtab)
    setParties(data ?? [])
  }

  async function fetchPayBills() {
    const { data } = await supabase
      .from('monthly_bills')
      .select('*, party:users!monthly_bills_party_id_fkey(full_name, email)')
      .eq('trader_id', traderId)
      .eq('month', month)
      .eq('year', year)
      .neq('status', 'paid')
    setPayBills((data as MonthlyBill[]) ?? [])
  }

  async function sendPaymentTerms(bill: MonthlyBill) {
    setSending(bill.id)
    const dueDate   = editDue[bill.id]  || bill.due_date
    const termsNote = editNote[bill.id] ?? confirmations[bill.id]?.terms_note ?? ''
    const creditDays = Math.round((new Date(dueDate).getTime() - new Date().getTime()) / 86400000)
    const { error } = await supabase
      .from('payment_term_confirmations')
      .upsert({
        bill_id:     bill.id,
        party_id:    bill.party_id,
        trader_id:   traderId,
        due_date:    dueDate,
        credit_days: Math.max(0, creditDays),
        terms_note:  termsNote || null,
        status:      'pending',
        sent_at:     new Date().toISOString(),
      }, { onConflict: 'bill_id,party_id' })
    if (!error) {
      const monthName = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long' })
      await supabase.from('notifications').insert({
        user_id: bill.party_id,
        title:   'Payment Terms — Action Required',
        body:    `Trader has shared payment terms for your ${monthName} ${year} bill of ₹${bill.total_amount.toLocaleString('en-IN')}. Due date: ${new Date(dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}. Please confirm.`,
        type:    'payment_terms',
        ref_id:  bill.id,
      })
      await fetchBills()
    }
    setSending(null)
  }

  async function generateBill(partyId: string) {
    setGenerating(partyId)
    try {
      const res = await fetch('/api/generate-monthly-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traderId, partyId, partyRole: billingSubtab, month, year }),
      })
      const json = await res.json()
      if (json.error) alert(json.error)
      else await fetchBills()
    } catch {
      alert('Failed to generate bill.')
    }
    setGenerating(null)
  }

  async function downloadExcel(bill: MonthlyBill) {
    setDownloading(bill.id)
    const res = await fetch('/api/export-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'bill', billId: bill.id }),
    })
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    const monthName = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long' })
    a.download = `SandX_Bill_${bill.party?.full_name?.replace(/\s+/g, '_') ?? 'party'}_${monthName}_${year}.xlsx`
    a.click(); URL.revokeObjectURL(url)
    setDownloading(null)
  }

  async function downloadAllExcel() {
    const res = await fetch('/api/export-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'trips', traderId, month, year }),
    })
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    const monthName = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long' })
    a.download = `SandX_Trips_${monthName}_${year}.xlsx`
    a.click(); URL.revokeObjectURL(url)
  }

  async function logPayment() {
    if (!logBill || !logAmount) return
    setLogSaving(true)
    const paid = logBill.amount_paid + Number(logAmount)
    const newStatus = paid >= logBill.total_amount ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
    await supabase.from('monthly_bills').update({ amount_paid: paid, status: newStatus }).eq('id', logBill.id)
    await supabase.from('payment_logs').insert({
      bill_id: logBill.id,
      trader_id: traderId,
      party_id: logBill.party_id,
      amount: Number(logAmount),
      payment_date: new Date().toISOString().split('T')[0],
      notes: logNote || null,
      recorded_by: 'trader',
    })
    await supabase.from('notifications').insert({
      user_id: logBill.party_id,
      title: 'Payment Recorded',
      body: `₹${Number(logAmount).toLocaleString('en-IN')} payment has been recorded for your ${new Date(year, month - 1).toLocaleString('en-IN', { month: 'long' })} ${year} bill.`,
      type: 'payment_received',
    })
    setLogBill(null); setLogAmount(''); setLogNote(''); setLogSaving(false)
    await fetchPayBills()
  }

  const ROLE_LABEL: Record<string, string> = { supplier: 'Suppliers', driver: 'Transporters', buyer: 'Buyers' }
  const billMap = Object.fromEntries(bills.map(b => [b.party_id, b]))
  const toReceive = payBills.filter(b => b.party_role === 'buyer')
  const toPay     = payBills.filter(b => b.party_role === 'supplier' || b.party_role === 'driver')
  const totalReceive = toReceive.reduce((s, b) => s + b.total_amount - b.amount_paid, 0)
  const totalPay     = toPay.reduce((s, b) => s + b.total_amount - b.amount_paid, 0)
  const netPosition  = totalReceive - totalPay
  const shownPayBills = paySubtab === 'receive' ? toReceive : toPay

  return (
    <div className="space-y-5">
      {/* Month/Year picker */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={downloadAllExcel}
          className="ml-auto text-sm border border-sx-border text-sx-lo rounded-xl px-4 py-2 hover:text-sx-hi flex items-center gap-1.5">
          Export All Trips
        </button>
      </div>

      {/* Finance tabs */}
      <div className="flex gap-1 bg-sx-raised rounded-xl p-1">
        <button onClick={() => setFinanceTab('billing')}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${financeTab === 'billing' ? 'bg-sx-card text-sx-accent shadow-sm' : 'text-sx-lo hover:text-sx-hi'}`}>
          Billing
        </button>
        <button onClick={() => setFinanceTab('payments')}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${financeTab === 'payments' ? 'bg-sx-card text-sx-accent shadow-sm' : 'text-sx-lo hover:text-sx-hi'}`}>
          Payments
        </button>
      </div>

      {/* ── BILLING ── */}
      {financeTab === 'billing' && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-sx-raised rounded-xl p-1">
            {(['supplier', 'driver', 'buyer'] as const).map(role => (
              <button key={role} onClick={() => setBillingSubtab(role)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${billingSubtab === role ? 'bg-sx-card text-sx-accent shadow-sm' : 'text-sx-lo hover:text-sx-hi'}`}>
                {ROLE_LABEL[role]}
              </button>
            ))}
          </div>

          {parties.length === 0 ? (
            <div className="bg-sx-card border border-sx-border rounded-xl px-5 py-10 text-center text-sx-lo text-sm">
              No {ROLE_LABEL[billingSubtab].toLowerCase()} found.
            </div>
          ) : (
            <div className="space-y-3">
              {parties.map(p => {
                const bill = billMap[p.id]
                const isGen = generating === p.id
                const isDl  = downloading === bill?.id
                const balance = bill ? bill.total_amount - bill.amount_paid : 0
                return (
                  <div key={p.id} className="bg-sx-card border border-sx-border rounded-xl px-5 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sx-hi">{p.full_name ?? p.email}</p>
                        <p className="text-xs text-sx-lo">{p.email}</p>
                      </div>
                      {bill && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                          bill.status === 'paid' ? 'bg-green-900/40 text-sx-green' :
                          bill.status === 'partial' ? 'bg-yellow-900/40 text-sx-amber' :
                          'bg-red-900/40 text-sx-red'
                        }`}>{bill.status}</span>
                      )}
                    </div>

                    {bill ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-sx-raised rounded-lg py-2">
                            <p className="text-[10px] text-sx-lo">Trips</p>
                            <p className="font-bold text-sx-hi">{bill.total_trips}</p>
                          </div>
                          <div className="bg-sx-raised rounded-lg py-2">
                            <p className="text-[10px] text-sx-lo">Total (₹)</p>
                            <p className="font-bold text-sx-hi">{bill.total_amount.toLocaleString('en-IN')}</p>
                          </div>
                          <div className={`rounded-lg py-2 ${balance > 0 ? 'bg-red-900/20' : 'bg-green-900/20'}`}>
                            <p className="text-[10px] text-sx-lo">Balance</p>
                            <p className={`font-bold ${balance > 0 ? 'text-sx-red' : 'text-sx-green'}`}>
                              ₹{balance.toLocaleString('en-IN')}
                            </p>
                          </div>
                        </div>

                        {/* Payment Terms */}
                        <div className="border border-sx-border rounded-lg p-3 space-y-2 bg-sx-raised">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-sx-lo">Payment Terms</p>
                            {confirmations[bill.id] && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                confirmations[bill.id].status === 'confirmed' ? 'bg-green-900/40 text-sx-green' :
                                confirmations[bill.id].status === 'disputed'  ? 'bg-red-900/40 text-sx-red' :
                                'bg-yellow-900/40 text-sx-amber'
                              }`}>{confirmations[bill.id].status}</span>
                            )}
                          </div>
                          {confirmations[bill.id]?.status === 'disputed' && (
                            <p className="text-xs text-sx-red bg-red-900/20 rounded px-2 py-1">
                              Dispute: {confirmations[bill.id].dispute_note ?? 'No note provided'}
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-sx-lo block mb-0.5">Due Date</label>
                              <input type="date"
                                value={editDue[bill.id] ?? bill.due_date?.split('T')[0] ?? ''}
                                onChange={e => setEditDue(prev => ({ ...prev, [bill.id]: e.target.value }))}
                                className="w-full bg-sx-base border border-sx-border text-sx-hi rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sx-accent" />
                            </div>
                            <div>
                              <label className="text-[10px] text-sx-lo block mb-0.5">Terms Note</label>
                              <input type="text" placeholder="e.g. Net 30, advance 20%"
                                value={editNote[bill.id] ?? confirmations[bill.id]?.terms_note ?? ''}
                                onChange={e => setEditNote(prev => ({ ...prev, [bill.id]: e.target.value }))}
                                className="w-full bg-sx-base border border-sx-border text-sx-hi rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sx-accent" />
                            </div>
                          </div>
                          <button onClick={() => sendPaymentTerms(bill)} disabled={sending === bill.id}
                            className="w-full bg-sx-accent text-white rounded-lg py-1.5 text-xs font-semibold disabled:opacity-50">
                            {sending === bill.id ? 'Sending…' : confirmations[bill.id] ? 'Resend Payment Terms' : 'Send for Confirmation'}
                          </button>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => generateBill(p.id)} disabled={isGen}
                            className="flex-1 border border-sx-accent/40 text-sx-accent rounded-lg py-1.5 text-sm hover:bg-sx-accent/10 disabled:opacity-50">
                            {isGen ? 'Regenerating…' : 'Regenerate Bill'}
                          </button>
                          {bill.pdf_url && (
                            <a href={bill.pdf_url} target="_blank" rel="noreferrer"
                              className="flex-1 text-center border border-sx-blue/40 text-sx-blue rounded-lg py-1.5 text-sm hover:bg-sx-blue/10">
                              View PDF
                            </a>
                          )}
                          <button onClick={() => downloadExcel(bill)} disabled={isDl}
                            className="flex-1 border border-sx-green/40 text-sx-green rounded-lg py-1.5 text-sm hover:bg-sx-green/10 disabled:opacity-50">
                            {isDl ? 'Downloading…' : 'Excel'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => generateBill(p.id)} disabled={isGen}
                        className="w-full bg-sx-accent text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                        {isGen ? 'Generating…' : 'Generate Bill'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PAYMENTS ── */}
      {financeTab === 'payments' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-900/20 border border-sx-green/30 rounded-xl px-4 py-3 text-center">
              <p className="text-[10px] text-sx-green uppercase font-semibold mb-0.5">To Receive</p>
              <p className="text-lg font-bold text-sx-green">{fmtLakh(totalReceive)}</p>
              <p className="text-[10px] text-sx-green/70">{toReceive.length} buyer{toReceive.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-red-900/20 border border-sx-red/30 rounded-xl px-4 py-3 text-center">
              <p className="text-[10px] text-sx-red uppercase font-semibold mb-0.5">To Pay</p>
              <p className="text-lg font-bold text-sx-red">{fmtLakh(totalPay)}</p>
              <p className="text-[10px] text-sx-red/70">{toPay.length} part{toPay.length !== 1 ? 'ies' : 'y'}</p>
            </div>
            <div className={`border rounded-xl px-4 py-3 text-center ${netPosition >= 0 ? 'bg-blue-900/20 border-sx-blue/30' : 'bg-yellow-900/20 border-sx-amber/30'}`}>
              <p className={`text-[10px] uppercase font-semibold mb-0.5 ${netPosition >= 0 ? 'text-sx-blue' : 'text-sx-amber'}`}>Net</p>
              <p className={`text-lg font-bold ${netPosition >= 0 ? 'text-sx-blue' : 'text-sx-amber'}`}>
                {netPosition >= 0 ? '+' : ''}{fmtLakh(Math.abs(netPosition))}
              </p>
              <p className={`text-[10px] ${netPosition >= 0 ? 'text-sx-blue/70' : 'text-sx-amber/70'}`}>{netPosition >= 0 ? 'surplus' : 'deficit'}</p>
            </div>
          </div>

          <div className="flex gap-1 bg-sx-raised rounded-xl p-1">
            <button onClick={() => setPaySubtab('receive')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${paySubtab === 'receive' ? 'bg-sx-card text-sx-green shadow-sm' : 'text-sx-lo hover:text-sx-hi'}`}>
              To Receive ({toReceive.length})
            </button>
            <button onClick={() => setPaySubtab('pay')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${paySubtab === 'pay' ? 'bg-sx-card text-sx-red shadow-sm' : 'text-sx-lo hover:text-sx-hi'}`}>
              To Pay ({toPay.length})
            </button>
          </div>

          {shownPayBills.length === 0 ? (
            <div className="bg-sx-card border border-sx-border rounded-xl px-5 py-10 text-center text-sx-lo text-sm">
              No outstanding {paySubtab === 'receive' ? 'receivables' : 'payables'} for this month.
            </div>
          ) : (
            <div className="space-y-3">
              {shownPayBills.map(bill => {
                const balance = bill.total_amount - bill.amount_paid
                return (
                  <div key={bill.id} className="bg-sx-card border border-sx-border rounded-xl px-5 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sx-hi">{bill.party?.full_name ?? bill.party?.email ?? '—'}</p>
                        <p className="text-xs text-sx-lo capitalize">{bill.party_role} · {bill.total_trips} trips · {bill.total_weight_mt?.toFixed(1) ?? 0} MT</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        bill.status === 'partial' ? 'bg-yellow-900/40 text-sx-amber' : 'bg-red-900/40 text-sx-red'
                      }`}>{bill.status}</span>
                    </div>
                    <div className="flex gap-4 text-sm flex-wrap">
                      <span className="text-sx-lo">Total: <span className="font-semibold text-sx-hi">₹{bill.total_amount.toLocaleString('en-IN')}</span></span>
                      {bill.amount_paid > 0 && (
                        <span className="text-sx-green">Paid: <span className="font-semibold">₹{bill.amount_paid.toLocaleString('en-IN')}</span></span>
                      )}
                      <span className={paySubtab === 'receive' ? 'text-sx-accent' : 'text-sx-red'}>
                        Balance: <span className="font-bold">₹{balance.toLocaleString('en-IN')}</span>
                      </span>
                    </div>
                    {bill.due_date && (
                      <p className="text-xs text-sx-lo">Due: {new Date(bill.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    )}
                    <button onClick={() => { setLogBill(bill); setLogAmount(''); setLogNote('') }}
                      className={`w-full rounded-lg py-1.5 text-sm font-semibold transition ${
                        paySubtab === 'receive'
                          ? 'bg-green-900/30 border border-sx-green text-sx-green hover:bg-green-900/50'
                          : 'bg-red-900/30 border border-sx-red text-sx-red hover:bg-red-900/50'
                      }`}>
                      {paySubtab === 'receive' ? 'Log Payment Received' : 'Log Payment Made'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Log Payment Modal */}
      {logBill && (
        <div className="fixed inset-0 bg-black/70 flex sm:items-center items-end justify-center z-50 p-4">
          <div className="bg-sx-card border border-sx-border rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-sx-hi">Log Payment</h3>
            <p className="text-sm text-sx-lo">
              {logBill.party?.full_name ?? logBill.party?.email} · Balance: ₹{(logBill.total_amount - logBill.amount_paid).toLocaleString('en-IN')}
            </p>
            <div>
              <label className="text-xs font-medium text-sx-lo block mb-1">Amount (₹)</label>
              <input type="number" value={logAmount} onChange={e => setLogAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent" />
            </div>
            <div>
              <label className="text-xs font-medium text-sx-lo block mb-1">Note (optional)</label>
              <input type="text" value={logNote} onChange={e => setLogNote(e.target.value)}
                placeholder="NEFT, Cash, etc."
                className="w-full bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent" />
            </div>
            <div className="flex gap-2">
              <button onClick={logPayment} disabled={logSaving || !logAmount}
                className="flex-1 bg-sx-accent text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                {logSaving ? 'Saving…' : 'Save Payment'}
              </button>
              <button onClick={() => setLogBill(null)}
                className="px-4 py-2 text-sm text-sx-lo border border-sx-border rounded-lg hover:text-sx-hi">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DataSheets */}
      <DataSheets userId={traderId} supabase={supabase} />
    </div>
  )
}
