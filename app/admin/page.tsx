'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'

const STATUS_STYLES: Record<string, string> = {
  pending:     'bg-amber-900/40 text-sx-amber',
  confirmed:   'bg-blue-900/40 text-sx-blue',
  loading:     'bg-purple-900/40 text-purple-300',
  loaded:      'bg-indigo-900/40 text-indigo-300',
  in_progress: 'bg-orange-900/40 text-sx-accent',
  in_transit:  'bg-orange-900/40 text-sx-accent',
  completed:   'bg-green-900/40 text-sx-green',
  delivered:   'bg-green-900/40 text-sx-green',
  cancelled:   'bg-red-900/40 text-sx-red',
  declined:    'bg-red-900/40 text-sx-red',
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type Order = {
  id: string
  material_type: string
  quantity_mt: number
  delivery_address: string
  scheduled_date: string
  status: string
  created_at: string
  buyer:  { full_name: string | null; email: string } | null
  trader: { full_name: string | null; email: string } | null
}

type AdminBill = {
  id: string
  party_role: string
  month: number
  year: number
  total_trips: number
  total_amount: number
  amount_paid: number
  status: string
  due_date: string
  party:  { full_name: string | null; email: string } | null
  trader: { full_name: string | null; email: string } | null
}

type AdminTrip = {
  id: string
  status: string
  quantity_mt: number
  created_at: string
  supplier_accepted: boolean | null
  driver_accepted: boolean | null
  supplier_rate_per_mt: number | null
  transport_rate_per_mt: number | null
  order: {
    material_type: string
    delivery_address: string
    scheduled_date: string
  } | null
  supplier: { full_name: string | null; email: string } | null
  driver:   { full_name: string | null; email: string } | null
}

type AiConversation = {
  id: string
  user_id: string
  user_role: string | null
  type: string | null
  prompt: string | null
  response: string | null
  created_at: string
  user: { full_name: string | null; email: string } | null
}

const ADMIN_TABS = [
  { id: 'overview',  label: 'Overview', icon: '📊' },
  { id: 'trips',     label: 'Trips',    icon: '🚛' },
  { id: 'finance',   label: 'Finance',  icon: '₹'  },
  { id: 'users',     label: 'Users',    icon: '👥' },
  { id: 'logs',      label: 'Logs',     icon: '🤖' },
]

type Invitation = {
  id: string
  target_role: string
  full_name: string
  email: string
  phone: string | null
  company_name: string | null
  address: string | null
  status: string
  requires_approval: boolean
  created_at: string
  invited_by_user: { full_name: string | null; email: string } | null
}

const TRIP_STATUSES = ['confirmed','loading','loaded','in_transit','delivered','cancelled']

const TRIP_STATUS_BTN: Record<string, string> = {
  confirmed:   'border-sx-blue text-sx-blue',
  loading:     'border-purple-500 text-purple-300',
  loaded:      'border-indigo-400 text-indigo-300',
  in_transit:  'border-sx-accent text-sx-accent',
  delivered:   'border-sx-green text-sx-green',
  cancelled:   'border-sx-red text-sx-red',
}

export default function AdminDashboard() {
  const router   = useRouter()
  const supabase = createClient()

  const now = new Date()
  const [userId, setUserId]       = useState<string | null>(null)
  const [orders, setOrders]       = useState<Order[]>([])
  const [trips, setTrips]         = useState<AdminTrip[]>([])
  const [conversations, setConversations] = useState<AiConversation[]>([])
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [bills, setBills]         = useState<AdminBill[]>([])
  const [billMonth, setBillMonth] = useState(now.getMonth() + 1)
  const [billYear, setBillYear]   = useState(now.getFullYear())

  const [updatingTrip, setUpdatingTrip] = useState<string | null>(null)
  const [expandedConv, setExpandedConv] = useState<string | null>(null)
  const [invitations, setInvitations]   = useState<Invitation[]>([])
  const [approvingId, setApprovingId]   = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)
      const { data } = await supabase
        .from('orders')
        .select('*, buyer:users!orders_buyer_id_fkey(full_name, email), trader:users!orders_trader_id_fkey(full_name, email)')
        .order('created_at', { ascending: false })
      setOrders((data as Order[]) ?? [])
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (activeTab === 'finance') fetchBills()
    if (activeTab === 'trips') fetchTrips()
    if (activeTab === 'logs') fetchConversations()
    if (activeTab === 'users') fetchInvitations()
  }, [activeTab, billMonth, billYear])

  async function fetchInvitations() {
    const { data } = await supabase
      .from('user_invitations')
      .select('id, target_role, full_name, email, phone, company_name, address, status, requires_approval, created_at, invited_by_user:users!user_invitations_invited_by_fkey(full_name, email)')
      .order('created_at', { ascending: false })
    setInvitations((data as unknown as Invitation[]) ?? [])
  }

  async function approveInvitation(id: string) {
    setApprovingId(id)
    await supabase.from('user_invitations')
      .update({ status: 'approved', approved_by: userId })
      .eq('id', id)
    await fetchInvitations()
    setApprovingId(null)
  }

  async function rejectInvitation(id: string) {
    setApprovingId(id)
    await supabase.from('user_invitations')
      .update({ status: 'rejected', approved_by: userId })
      .eq('id', id)
    await fetchInvitations()
    setApprovingId(null)
  }

  async function fetchBills() {
    const { data } = await supabase
      .from('monthly_bills')
      .select('*, party:users!monthly_bills_party_id_fkey(full_name, email), trader:users!monthly_bills_trader_id_fkey(full_name, email)')
      .eq('month', billMonth)
      .eq('year', billYear)
      .order('party_role')
    setBills((data as AdminBill[]) ?? [])
  }

  const fetchTrips = useCallback(async () => {
    const { data } = await supabase
      .from('trips')
      .select(`
        *,
        order:orders(material_type, delivery_address, scheduled_date),
        supplier:users!trips_supplier_id_fkey(full_name, email),
        driver:users!trips_driver_id_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(200)
    setTrips((data as AdminTrip[]) ?? [])
  }, [])

  async function fetchConversations() {
    const { data } = await supabase
      .from('ai_conversations')
      .select('*, user:users!ai_conversations_user_id_fkey(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(100)
    setConversations((data as AiConversation[]) ?? [])
  }

  async function updateTripStatus(tripId: string, status: string) {
    setUpdatingTrip(tripId)
    await supabase.from('trips').update({ status }).eq('id', tripId)
    await fetchTrips()
    setUpdatingTrip(null)
  }

  if (loading) return (
    <div className="min-h-screen bg-sx-base flex items-center justify-center text-sx-lo">Loading…</div>
  )

  const toReceive = bills.filter(b => b.party_role === 'buyer').reduce((s, b) => s + b.total_amount - b.amount_paid, 0)
  const toPay     = bills.filter(b => b.party_role !== 'buyer').reduce((s, b) => s + b.total_amount - b.amount_paid, 0)
  const netMargin = toReceive - toPay

  // Overview stats from orders
  const totalOrders     = orders.length
  const activeOrders    = orders.filter(o => !['completed','delivered','cancelled','declined'].includes(o.status)).length
  const completedOrders = orders.filter(o => ['completed','delivered'].includes(o.status)).length
  const cancelledOrders = orders.filter(o => ['cancelled','declined'].includes(o.status)).length

  return (
    <AppShell
      role="admin"
      tabs={ADMIN_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      userId={userId}
      supabase={supabase}
    >
      {/* ── Overview ── */}
      {activeTab === 'overview' && (
        <div className="space-y-5 pt-16 pb-24 sm:pb-6">
          <h2 className="font-semibold text-sx-hi">Overview</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-sx-card border border-sx-border rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-sx-hi">{totalOrders}</p>
              <p className="text-xs text-sx-lo mt-1">Total Orders</p>
            </div>
            <div className="bg-sx-card border border-sx-border rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-sx-accent">{activeOrders}</p>
              <p className="text-xs text-sx-lo mt-1">Active Orders</p>
            </div>
            <div className="bg-sx-card border border-sx-border rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-sx-green">{completedOrders}</p>
              <p className="text-xs text-sx-lo mt-1">Completed</p>
            </div>
            <div className="bg-sx-card border border-sx-border rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-sx-red">{cancelledOrders}</p>
              <p className="text-xs text-sx-lo mt-1">Cancelled</p>
            </div>
          </div>

          <h3 className="text-xs font-semibold text-sx-lo uppercase tracking-widest pt-2">Recent Orders</h3>
          <div className="sm:hidden space-y-3">
            {orders.slice(0, 10).map(order => (
              <div key={order.id} className="bg-sx-card border border-sx-border rounded-2xl p-5 space-y-2">
                <div className="flex items-start justify-between">
                  <span className="font-medium text-sx-hi text-sm">{order.material_type} · {order.quantity_mt} MT</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[order.status] ?? 'bg-sx-raised text-sx-lo'}`}>
                    {order.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-sx-lo">{order.delivery_address}</p>
                <div className="text-xs text-sx-lo space-y-0.5">
                  <p>Buyer: <span className="text-sx-hi">{order.buyer?.full_name ?? order.buyer?.email ?? '—'}</span></p>
                  <p>Trader: <span className="text-sx-hi">{order.trader?.full_name ?? order.trader?.email ?? '—'}</span></p>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block bg-sx-card border border-sx-border rounded-2xl overflow-hidden">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Buyer</th>
                  <th>Trader</th>
                  <th>Material</th>
                  <th>Qty (MT)</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-sx-lo py-10">No orders yet.</td></tr>
                ) : orders.slice(0, 20).map(order => (
                  <tr key={order.id}>
                    <td className="font-mono text-sx-lo">{order.id.slice(0, 8)}…</td>
                    <td className="text-sx-hi">{order.buyer?.full_name ?? order.buyer?.email ?? '—'}</td>
                    <td className="text-sx-hi">{order.trader?.full_name ?? order.trader?.email ?? '—'}</td>
                    <td className="text-sx-hi">{order.material_type}</td>
                    <td className="text-sx-hi">{order.quantity_mt}</td>
                    <td>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[order.status] ?? 'bg-sx-raised text-sx-lo'}`}>
                        {order.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="text-sx-lo">{new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── All Trips ── */}
      {activeTab === 'trips' && (
        <div className="space-y-4 pt-16 pb-24 sm:pb-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sx-hi">All Trips</h2>
            <span className="text-sm text-sx-lo">{trips.length} trips</span>
          </div>

          {trips.length === 0 ? (
            <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-12 text-center text-sx-lo text-sm">No trips yet.</div>
          ) : (
            <div className="space-y-3">
              {trips.map(trip => (
                <div key={trip.id} className="bg-sx-card border border-sx-border rounded-2xl px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-medium text-sx-hi">{trip.order?.material_type ?? '—'}</span>
                      <span className="text-sx-lo text-sm ml-2">· {trip.quantity_mt} MT</span>
                      <p className="text-xs text-sx-lo font-mono mt-0.5">{trip.id.slice(0, 12)}…</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize whitespace-nowrap ${STATUS_STYLES[trip.status] ?? 'bg-sx-raised text-sx-lo'}`}>
                      {trip.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-sx-lo">
                    <p>Supplier: <span className="text-sx-hi">{trip.supplier?.full_name ?? trip.supplier?.email ?? '—'}</span></p>
                    <p>Driver: <span className="text-sx-hi">{trip.driver?.full_name ?? trip.driver?.email ?? '—'}</span></p>
                    {trip.order?.delivery_address && (
                      <p className="col-span-2">To: <span className="text-sx-hi">{trip.order.delivery_address}</span></p>
                    )}
                    <p>Sup. accepted: <span className={trip.supplier_accepted === true ? 'text-sx-green' : trip.supplier_accepted === false ? 'text-sx-red' : 'text-sx-lo'}>
                      {trip.supplier_accepted === true ? 'Yes' : trip.supplier_accepted === false ? 'No' : 'Pending'}
                    </span></p>
                    <p>Driver accepted: <span className={trip.driver_accepted === true ? 'text-sx-green' : trip.driver_accepted === false ? 'text-sx-red' : 'text-sx-lo'}>
                      {trip.driver_accepted === true ? 'Yes' : trip.driver_accepted === false ? 'No' : 'Pending'}
                    </span></p>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-sx-border flex-wrap">
                    <span className="text-xs text-sx-lo mr-1">Override:</span>
                    {TRIP_STATUSES.filter(s => s !== trip.status).map(s => (
                      <button key={s} onClick={() => updateTripStatus(trip.id, s)} disabled={updatingTrip === trip.id}
                        className={`text-xs px-2 py-1 rounded-lg border capitalize disabled:opacity-50 transition ${TRIP_STATUS_BTN[s] ?? 'border-sx-border text-sx-lo'}`}>
                        {updatingTrip === trip.id ? '…' : s.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Finance ── */}
      {activeTab === 'finance' && (
        <div className="space-y-6 pt-16 pb-24 sm:pb-6">
          <div className="flex items-center gap-2">
            <select value={billMonth} onChange={e => setBillMonth(Number(e.target.value))}
              className="bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={billYear} onChange={e => setBillYear(Number(e.target.value))}
              className="bg-sx-raised border border-sx-border text-sx-hi rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-sx-card border border-sx-border rounded-2xl p-5 text-center">
              <p className="text-xs text-sx-green uppercase font-semibold mb-1">Receivable</p>
              <p className="text-xl font-bold text-sx-green">₹{toReceive.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-sx-card border border-sx-border rounded-2xl p-5 text-center">
              <p className="text-xs text-sx-red uppercase font-semibold mb-1">Payable</p>
              <p className="text-xl font-bold text-sx-red">₹{toPay.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-sx-card border border-sx-border rounded-2xl p-5 text-center">
              <p className={`text-xs uppercase font-semibold mb-1 ${netMargin >= 0 ? 'text-sx-blue' : 'text-sx-amber'}`}>Net Position</p>
              <p className={`text-xl font-bold ${netMargin >= 0 ? 'text-sx-blue' : 'text-sx-amber'}`}>
                {netMargin >= 0 ? '+' : ''}₹{Math.abs(netMargin).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          {bills.length === 0 ? (
            <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-12 text-center text-sx-lo text-sm">
              No bills for {MONTHS[billMonth - 1]} {billYear}.
            </div>
          ) : (
            <div className="bg-sx-card border border-sx-border rounded-2xl overflow-hidden">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>Party</th>
                    <th>Role</th>
                    <th>Trader</th>
                    <th className="text-right">Trips</th>
                    <th className="text-right">Total (₹)</th>
                    <th className="text-right">Paid (₹)</th>
                    <th className="text-right">Balance (₹)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map(bill => {
                    const bal = bill.total_amount - bill.amount_paid
                    return (
                      <tr key={bill.id}>
                        <td className="text-sx-hi font-medium">{bill.party?.full_name ?? bill.party?.email ?? '—'}</td>
                        <td>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                            bill.party_role === 'buyer'    ? 'bg-orange-900/40 text-sx-accent' :
                            bill.party_role === 'supplier' ? 'bg-green-900/40 text-sx-green' :
                            'bg-amber-900/40 text-sx-amber'
                          }`}>{bill.party_role}</span>
                        </td>
                        <td className="text-sx-lo text-xs">{bill.trader?.full_name ?? bill.trader?.email ?? '—'}</td>
                        <td className="text-right text-sx-hi">{bill.total_trips}</td>
                        <td className="text-right text-sx-hi font-medium">{bill.total_amount.toLocaleString('en-IN')}</td>
                        <td className="text-right text-sx-green">{bill.amount_paid.toLocaleString('en-IN')}</td>
                        <td className={`text-right font-semibold ${bal > 0 ? 'text-sx-red' : 'text-sx-green'}`}>
                          {bal.toLocaleString('en-IN')}
                        </td>
                        <td>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            bill.status === 'paid'    ? 'bg-green-900/40 text-sx-green' :
                            bill.status === 'partial' ? 'bg-amber-900/40 text-sx-amber' :
                            'bg-red-900/40 text-sx-red'
                          }`}>{bill.status}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Users / Invitations ── */}
      {activeTab === 'users' && (
        <div className="space-y-4 pt-16 pb-24 sm:pb-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sx-hi">Invitations</h2>
            <span className="text-sm text-sx-lo">{invitations.length} total</span>
          </div>

          {invitations.length === 0 ? (
            <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-12 text-center text-sx-lo text-sm">
              No invitations yet. Traders send invitations from their Team tab.
            </div>
          ) : (
            <div className="space-y-3">
              {invitations.map(inv => (
                <div key={inv.id} className="bg-sx-card border border-sx-border rounded-2xl px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-sx-hi text-sm">{inv.full_name}</p>
                      {inv.company_name && <p className="text-xs text-sx-accent font-medium">{inv.company_name}</p>}
                      <p className="text-xs text-sx-lo truncate">{inv.email}</p>
                      {inv.phone   && <p className="text-xs text-sx-lo">{inv.phone}</p>}
                      {inv.address && <p className="text-xs text-sx-lo truncate">{inv.address}</p>}
                      <p className="text-xs text-sx-lo mt-1">
                        Role: <span className="text-sx-hi capitalize">{inv.target_role.replace('_', ' ')}</span>
                        {inv.invited_by_user
                          ? <> · Invited by: <span className="text-sx-hi">{inv.invited_by_user.full_name ?? inv.invited_by_user.email}</span></>
                          : <span className="text-sx-amber"> · Direct request</span>
                        }
                      </p>
                      <p className="text-xs text-sx-lo">{new Date(inv.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 ${
                      inv.status === 'approved' ? 'bg-green-900/40 text-sx-green' :
                      inv.status === 'rejected' ? 'bg-red-900/40 text-sx-red' :
                      inv.status === 'used'     ? 'bg-blue-900/40 text-sx-blue' :
                      'bg-amber-900/40 text-sx-amber'
                    }`}>
                      {inv.status === 'used' ? 'Signed Up' : inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                    </span>
                  </div>

                  {inv.status === 'pending' && (
                    <div className="flex gap-2 pt-1 border-t border-sx-border">
                      <button onClick={() => approveInvitation(inv.id)} disabled={approvingId === inv.id}
                        className="flex-1 bg-green-900/30 border border-sx-green text-sx-green rounded-lg py-1.5 text-sm font-semibold hover:bg-green-900/50 disabled:opacity-40 transition">
                        {approvingId === inv.id ? '…' : 'Approve'}
                      </button>
                      <button onClick={() => rejectInvitation(inv.id)} disabled={approvingId === inv.id}
                        className="flex-1 bg-red-900/30 border border-sx-red text-sx-red rounded-lg py-1.5 text-sm font-semibold hover:bg-red-900/50 disabled:opacity-40 transition">
                        {approvingId === inv.id ? '…' : 'Reject'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── AI Logs ── */}
      {activeTab === 'logs' && (
        <div className="space-y-4 pt-16 pb-24 sm:pb-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sx-hi">AI Conversations</h2>
            <span className="text-sm text-sx-lo">{conversations.length} entries</span>
          </div>

          {conversations.length === 0 ? (
            <div className="bg-sx-card border border-sx-border rounded-2xl px-5 py-12 text-center text-sx-lo text-sm">
              No AI conversations logged yet. They appear here after users interact with Gemini features.
            </div>
          ) : (
            <div className="space-y-3">
              {conversations.map(conv => (
                <div key={conv.id} className="bg-sx-card border border-sx-border rounded-2xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-medium text-sx-hi text-sm">{conv.user?.full_name ?? conv.user?.email ?? '—'}</span>
                      <span className={`ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        conv.user_role === 'trader' ? 'bg-blue-900/40 text-sx-blue' :
                        conv.user_role === 'buyer'  ? 'bg-orange-900/40 text-sx-accent' :
                        'bg-sx-raised text-sx-lo'
                      }`}>{conv.user_role ?? '?'}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs bg-purple-900/40 text-purple-300 font-semibold px-2 py-0.5 rounded-full">
                        {conv.type?.replace(/_/g, ' ') ?? 'AI'}
                      </span>
                      <span className="text-xs text-sx-lo">
                        {new Date(conv.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <button onClick={() => setExpandedConv(expandedConv === conv.id ? null : conv.id)}
                    className="text-xs text-sx-blue hover:text-sx-hi transition-colors">
                    {expandedConv === conv.id ? 'Hide details' : 'Show details'}
                  </button>

                  {expandedConv === conv.id && (
                    <div className="space-y-2 pt-1 border-t border-sx-border">
                      {conv.prompt && (
                        <div>
                          <p className="text-xs font-semibold text-sx-lo uppercase mb-1">Prompt</p>
                          <pre className="bg-sx-base border border-sx-border rounded-xl p-3 text-xs font-mono text-sx-lo overflow-x-auto whitespace-pre-wrap">{conv.prompt}</pre>
                        </div>
                      )}
                      {conv.response && (
                        <div>
                          <p className="text-xs font-semibold text-sx-lo uppercase mb-1">Response</p>
                          <pre className="bg-sx-base border border-sx-border rounded-xl p-3 text-xs font-mono text-sx-lo overflow-x-auto whitespace-pre-wrap">{conv.response}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  )
}
