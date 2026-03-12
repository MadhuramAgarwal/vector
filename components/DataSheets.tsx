'use client'

import { useState, useEffect, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'

type SheetId = 'trips' | 'pnl' | 'statements' | 'docs'

type TripRow = {
  id: string
  created_at: string
  status: string
  quantity_mt: number
  sale_amount: number | null
  supplier_amount: number | null
  transport_amount: number | null
  gross_margin: number | null
  drive_folder_url: string | null
  vehicle_number: string | null
  order: { material_type: string; delivery_address: string } | null
  driver:   { full_name: string | null } | null
  supplier: { full_name: string | null } | null
  buyer_user: { full_name: string | null } | null
  challans: { id: string; buyer_confirmed: boolean; trader_approved: boolean }[]
  royalty_passes: { id: string }[]
  weight_slips: { id: string; wb_type: string }[]
}

// Keep track of last refreshed
export default function DataSheets({ userId, supabase }: { userId: string; supabase: SupabaseClient }) {
  const [activeSheet, setActiveSheet] = useState<SheetId>('trips')
  const [trips, setTrips]             = useState<TripRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const now = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()
  const monthStart = new Date(year, month - 1, 1).toISOString()

  const fetchTrips = useCallback(async () => {
    const { data } = await supabase
      .from('trips')
      .select(`
        id, created_at, status, quantity_mt,
        sale_amount, supplier_amount, transport_amount, gross_margin,
        drive_folder_url, vehicle_number,
        order:orders(material_type, delivery_address),
        driver:users!trips_driver_id_fkey(full_name),
        supplier:users!trips_supplier_id_fkey(full_name),
        challans(id, buyer_confirmed, trader_approved),
        royalty_passes(id),
        weight_slips(id, wb_type)
      `)
      .eq('trader_id', userId)
      .gte('created_at', monthStart)
      .order('created_at', { ascending: false })
    setTrips((data as TripRow[]) ?? [])
    setLastRefresh(new Date())
    setLoading(false)
  }, [userId, monthStart])

  useEffect(() => {
    fetchTrips()
    const interval = setInterval(fetchTrips, 30000) // 30s auto-refresh
    return () => clearInterval(interval)
  }, [fetchTrips])

  // Realtime subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel('data-sheets-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetchTrips)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchTrips])

  async function exportExcel(type: string) {
    const res = await fetch('/api/export-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, traderId: userId, month, year }),
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `sandx-${type}-${year}-${String(month).padStart(2,'0')}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const sheets: { id: SheetId; label: string }[] = [
    { id: 'trips',      label: 'Live Trips' },
    { id: 'pnl',        label: 'P&L' },
    { id: 'statements', label: 'Party Statements' },
    { id: 'docs',       label: 'Doc Tracker' },
  ]

  const fmt = (n: number | null) => n != null ? `₹${n.toLocaleString('en-IN')}` : '—'

  // P&L data
  const pnlRows = trips.filter(t => t.gross_margin != null)
  const totalMargin = pnlRows.reduce((s, t) => s + (t.gross_margin ?? 0), 0)
  const totalRevenue = pnlRows.reduce((s, t) => s + (t.sale_amount ?? 0), 0)

  // Party statements: group by buyer, supplier, driver
  const buyerMap: Record<string, { name: string; trips: number; total: number }> = {}
  const supplierMap: Record<string, { name: string; trips: number; total: number }> = {}
  for (const t of trips) {
    const bn = t.buyer_user?.full_name ?? 'Unknown'
    if (!buyerMap[bn]) buyerMap[bn] = { name: bn, trips: 0, total: 0 }
    buyerMap[bn].trips++
    buyerMap[bn].total += t.sale_amount ?? 0

    const sn = t.supplier?.full_name ?? 'Unknown'
    if (!supplierMap[sn]) supplierMap[sn] = { name: sn, trips: 0, total: 0 }
    supplierMap[sn].trips++
    supplierMap[sn].total += t.supplier_amount ?? 0
  }

  return (
    <div className="space-y-4">
      {/* Sheet selector + meta */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-sx-raised rounded-xl p-1">
          {sheets.map(s => (
            <button key={s.id} onClick={() => setActiveSheet(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeSheet === s.id ? 'bg-sx-accent text-white' : 'text-sx-lo hover:text-sx-hi'
              }`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-sx-lo">
            {loading ? 'Loading…' : `Updated ${lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
          </span>
          <button onClick={() => exportExcel('trips')}
            className="text-xs border border-sx-border text-sx-lo hover:text-sx-green hover:border-sx-green rounded-lg px-3 py-1.5 transition-colors">
            Export Excel
          </button>
        </div>
      </div>

      {/* Sheet content */}
      <div className="bg-sx-card border border-sx-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto" style={{ maxHeight: '60vh' }}>

          {/* SHEET A: Live Trips */}
          {activeSheet === 'trips' && (
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Truck</th>
                  <th>Material</th>
                  <th>Weight</th>
                  <th>Status</th>
                  <th>Challan</th>
                  <th>Drive</th>
                </tr>
              </thead>
              <tbody>
                {trips.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign:'center', padding:'2rem', color:'#8B8D96' }}>No trips this month</td></tr>
                )}
                {trips.map(t => {
                  const challan = t.challans?.[0]
                  const dateStr = new Date(t.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short' })
                  return (
                    <tr key={t.id}>
                      <td>{dateStr}</td>
                      <td style={{ fontFamily:'monospace' }}>{t.vehicle_number ?? '—'}</td>
                      <td>{t.order?.material_type ?? '—'}</td>
                      <td>{t.quantity_mt ? `${t.quantity_mt} MT` : '—'}</td>
                      <td>
                        <span style={{
                          fontSize:'0.65rem', fontWeight:600, padding:'2px 8px', borderRadius:'999px',
                          background: t.status === 'delivered' ? 'rgba(34,197,94,0.2)' : t.status === 'in_transit' ? 'rgba(249,115,22,0.2)' : 'rgba(139,141,150,0.2)',
                          color: t.status === 'delivered' ? '#22C55E' : t.status === 'in_transit' ? '#F97316' : '#8B8D96',
                        }}>{t.status.replace('_',' ')}</span>
                      </td>
                      <td>
                        {challan ? (
                          challan.trader_approved ? <span className="cell-ok">Approved</span>
                          : challan.buyer_confirmed ? <span style={{color:'#F59E0B'}}>Awaiting</span>
                          : <span className="cell-missing">Pending</span>
                        ) : <span className="cell-missing">—</span>}
                      </td>
                      <td>
                        {t.drive_folder_url
                          ? <a href={t.drive_folder_url} target="_blank" rel="noreferrer" style={{color:'#3B82F6', textDecoration:'underline'}}>📁 Open</a>
                          : <span style={{color:'#2A2D33'}}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* SHEET B: P&L */}
          {activeSheet === 'pnl' && (
            <>
              <div className="p-4 border-b border-sx-border flex gap-4">
                <div className="text-center">
                  <p className="text-xs text-sx-lo">Month Revenue</p>
                  <p className="text-sx-hi font-bold tabular-nums">{fmt(totalRevenue)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-sx-lo">Net Margin</p>
                  <p className={`font-bold tabular-nums ${totalMargin >= 0 ? 'text-sx-green' : 'text-sx-red'}`}>{fmt(totalMargin)}</p>
                </div>
              </div>
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Truck</th>
                    <th>Sale Rate</th>
                    <th>Supplier</th>
                    <th>Transport</th>
                    <th>Margin/MT</th>
                    <th>Total Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {pnlRows.map(t => {
                    const marginPerMt = t.quantity_mt > 0 && t.gross_margin != null ? (t.gross_margin / t.quantity_mt) : null
                    const isLoss = (t.gross_margin ?? 0) < 0
                    return (
                      <tr key={t.id} className={isLoss ? 'sheet-red' : ''}>
                        <td>{new Date(t.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}</td>
                        <td style={{ fontFamily:'monospace' }}>{t.vehicle_number ?? '—'}</td>
                        <td>{t.sale_amount != null && t.quantity_mt ? `₹${(t.sale_amount/t.quantity_mt).toFixed(0)}/MT` : '—'}</td>
                        <td>{t.supplier_amount != null && t.quantity_mt ? `₹${(t.supplier_amount/t.quantity_mt).toFixed(0)}/MT` : '—'}</td>
                        <td>{t.transport_amount != null && t.quantity_mt ? `₹${(t.transport_amount/t.quantity_mt).toFixed(0)}/MT` : '—'}</td>
                        <td>{marginPerMt != null ? `₹${marginPerMt.toFixed(0)}/MT` : '—'}</td>
                        <td>{fmt(t.gross_margin)}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ background:'#23262B', fontWeight:600 }}>
                    <td colSpan={6} style={{ textAlign:'right', paddingRight:'0.75rem' }}>Total</td>
                    <td style={{ color: totalMargin >= 0 ? '#22C55E' : '#EF4444' }}>{fmt(totalMargin)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* SHEET C: Party Statements */}
          {activeSheet === 'statements' && (
            <div className="p-4 space-y-6">
              <div>
                <p className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">Buyers</p>
                <table className="sheet-table">
                  <thead><tr><th>Party</th><th>Trips</th><th>Total Billed</th></tr></thead>
                  <tbody>
                    {Object.values(buyerMap).map(b => (
                      <tr key={b.name}>
                        <td>{b.name}</td>
                        <td>{b.trips}</td>
                        <td>{fmt(b.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-xs font-semibold text-sx-lo uppercase tracking-widest mb-3">Suppliers</p>
                <table className="sheet-table">
                  <thead><tr><th>Party</th><th>Trips</th><th>Total Payable</th></tr></thead>
                  <tbody>
                    {Object.values(supplierMap).map(s => (
                      <tr key={s.name}>
                        <td>{s.name}</td>
                        <td>{s.trips}</td>
                        <td>{fmt(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SHEET D: Doc Tracker */}
          {activeSheet === 'docs' && (
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Truck</th>
                  <th>Royalty</th>
                  <th>WB1</th>
                  <th>WB2</th>
                  <th>Challan</th>
                  <th>Drive Folder</th>
                </tr>
              </thead>
              <tbody>
                {trips.map(t => {
                  const hasRoyalty = (t.royalty_passes?.length ?? 0) > 0
                  const hasWb1 = t.weight_slips?.some(w => w.wb_type === 'wb1')
                  const hasWb2 = t.weight_slips?.some(w => w.wb_type === 'wb2')
                  const hasChallan = (t.challans?.length ?? 0) > 0
                  const tick = (v: boolean | undefined) => v ? <span className="cell-ok">✓</span> : <span className="cell-missing">✗</span>
                  return (
                    <tr key={t.id}>
                      <td>{new Date(t.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}</td>
                      <td style={{ fontFamily:'monospace' }}>{t.vehicle_number ?? '—'}</td>
                      <td>{tick(hasRoyalty)}</td>
                      <td>{tick(hasWb1)}</td>
                      <td>{tick(hasWb2)}</td>
                      <td>{tick(hasChallan)}</td>
                      <td>
                        {t.drive_folder_url
                          ? <a href={t.drive_folder_url} target="_blank" rel="noreferrer" style={{color:'#3B82F6'}}>📁</a>
                          : <span style={{color:'#2A2D33'}}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

        </div>
      </div>
    </div>
  )
}
