'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Bill = {
  id: string
  trader_id: string
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
  trader: { full_name: string | null; email: string } | null
}

type PaymentLog = {
  id: string
  bill_id: string
  amount: number
  payment_date: string
  notes: string | null
  recorded_by: string
}

type PTC = {
  id: string
  bill_id: string
  trader_id: string
  due_date: string
  credit_days: number
  terms_note: string | null
  status: 'pending' | 'confirmed' | 'disputed'
  confirmed_at: string | null
  dispute_note: string | null
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function BillingView({ userId, role }: { userId: string; role: string }) {
  const supabase = createClient()
  const now = new Date()
  const [month, setMonth]   = useState(now.getMonth() + 1)
  const [year, setYear]     = useState(now.getFullYear())
  const [bills, setBills]   = useState<Bill[]>([])
  const [logs, setLogs]     = useState<PaymentLog[]>([])
  const [ptcs, setPtcs]     = useState<Record<string, PTC>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  // dispute modal
  const [disputeBillId, setDisputeBillId] = useState<string | null>(null)
  const [disputeNote, setDisputeNote]     = useState('')
  const [ptcSaving, setPtcSaving]         = useState<string | null>(null)
  // notify trader modal
  const [notifyBill, setNotifyBill]   = useState<Bill | null>(null)
  const [notifyMsg, setNotifyMsg]     = useState('')
  const [notifySending, setNotifySending] = useState(false)

  useEffect(() => { fetchData() }, [month, year])

  async function fetchData() {
    const { data: billData } = await supabase
      .from('monthly_bills')
      .select('*, trader:users!monthly_bills_trader_id_fkey(full_name, email)')
      .eq('party_id', userId)
      .eq('month', month)
      .eq('year', year)
      .order('created_at', { ascending: false })
    const list = (billData as Bill[]) ?? []
    setBills(list)

    if (list.length > 0) {
      const ids = list.map(b => b.id)
      const [{ data: logData }, { data: ptcData }] = await Promise.all([
        supabase.from('payment_logs').select('*').in('bill_id', ids).order('payment_date', { ascending: false }),
        supabase.from('payment_term_confirmations').select('*').in('bill_id', ids),
      ])
      setLogs((logData as PaymentLog[]) ?? [])
      const map: Record<string, PTC> = {}
      ;(ptcData ?? []).forEach((p: PTC) => { map[p.bill_id] = p })
      setPtcs(map)
    }
  }

  async function confirmTerms(ptc: PTC) {
    setPtcSaving(ptc.bill_id)
    await supabase
      .from('payment_term_confirmations')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', ptc.id)
    // notify trader
    const bill = bills.find(b => b.id === ptc.bill_id)
    if (bill) {
      const monthName = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long' })
      await supabase.from('notifications').insert({
        user_id: ptc.trader_id,
        title:   'Payment Terms Confirmed',
        body:    `${role.charAt(0).toUpperCase() + role.slice(1)} has confirmed payment terms for ${monthName} ${year} bill of ₹${bill.total_amount.toLocaleString('en-IN')}.`,
        type:    'payment_terms_confirmed',
        ref_id:  bill.id,
      })
    }
    await fetchData()
    setPtcSaving(null)
  }

  async function submitDispute(ptc: PTC) {
    if (!disputeNote.trim()) return
    setPtcSaving(ptc.bill_id)
    await supabase
      .from('payment_term_confirmations')
      .update({ status: 'disputed', dispute_note: disputeNote.trim() })
      .eq('id', ptc.id)
    // notify trader
    const bill = bills.find(b => b.id === ptc.bill_id)
    if (bill) {
      const monthName = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long' })
      await supabase.from('notifications').insert({
        user_id: ptc.trader_id,
        title:   'Payment Terms Disputed',
        body:    `${role.charAt(0).toUpperCase() + role.slice(1)} has raised a dispute on ${monthName} ${year} bill: "${disputeNote.trim()}"`,
        type:    'payment_terms_disputed',
        ref_id:  bill.id,
      })
    }
    setDisputeBillId(null)
    setDisputeNote('')
    await fetchData()
    setPtcSaving(null)
  }

  async function sendNotification() {
    if (!notifyBill || !notifyMsg.trim()) return
    setNotifySending(true)
    const monthName = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long' })
    await supabase.from('notifications').insert({
      user_id: notifyBill.trader_id,
      title:   `Payment Update — ${monthName} ${year}`,
      body:    notifyMsg.trim(),
      type:    'party_payment_update',
      ref_id:  notifyBill.id,
    })
    setNotifyBill(null)
    setNotifyMsg('')
    setNotifySending(false)
  }

  async function downloadExcel(bill: Bill) {
    setDownloading(bill.id)
    const res = await fetch('/api/export-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'party_trips', partyId: userId, partyRole: role, month, year }),
    })
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    const monthName = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long' })
    a.download = `SandX_${role}_${monthName}_${year}.xlsx`
    a.click(); URL.revokeObjectURL(url)
    setDownloading(null)
  }

  const totalBilled  = bills.reduce((s, b) => s + b.total_amount, 0)
  const totalPaid    = bills.reduce((s, b) => s + b.amount_paid, 0)
  const totalBalance = totalBilled - totalPaid

  const roleLabel = role === 'buyer' ? 'Your invoices' : 'Payable to you'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

      {/* Month/Year picker */}
      <div className="flex items-center gap-2">
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="border border-sx-border bg-sx-raised text-sx-hi rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-sx-border bg-sx-raised text-sx-hi rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent">
          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="ml-2 text-sm text-sx-lo">{roleLabel}</span>
      </div>

      {/* Summary bar */}
      {bills.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-sx-raised border border-sx-border rounded-xl px-3 py-3 text-center">
            <p className="text-[10px] text-sx-lo uppercase font-semibold mb-0.5">Billed</p>
            <p className="text-base font-bold text-sx-hi">₹{totalBilled.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-green-900/40 border border-green-900/60 rounded-xl px-3 py-3 text-center">
            <p className="text-[10px] text-sx-green uppercase font-semibold mb-0.5">Received</p>
            <p className="text-base font-bold text-sx-green">₹{totalPaid.toLocaleString('en-IN')}</p>
          </div>
          <div className={`border rounded-xl px-3 py-3 text-center ${totalBalance > 0 ? 'bg-amber-900/40 border-amber-900/60' : 'bg-green-900/40 border-green-900/60'}`}>
            <p className={`text-[10px] uppercase font-semibold mb-0.5 ${totalBalance > 0 ? 'text-sx-amber' : 'text-sx-green'}`}>
              {totalBalance > 0 ? 'Pending' : 'Settled'}
            </p>
            <p className={`text-base font-bold ${totalBalance > 0 ? 'text-sx-amber' : 'text-sx-green'}`}>
              ₹{Math.abs(totalBalance).toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      )}

      {/* Bills list */}
      {bills.length === 0 ? (
        <div className="bg-sx-card rounded-xl border border-sx-border px-5 py-12 text-center text-sx-lo text-sm">
          No billing data for {MONTHS[month - 1]} {year}.
        </div>
      ) : (
        <div className="space-y-3">
          {bills.map(bill => {
            const balance    = bill.total_amount - bill.amount_paid
            const billLogs   = logs.filter(l => l.bill_id === bill.id)
            const isExpanded = expanded === bill.id
            const ptc        = ptcs[bill.id]

            return (
              <div key={bill.id} className="bg-sx-card rounded-xl border border-sx-border overflow-hidden">
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sx-hi text-sm">
                        {MONTHS[bill.month - 1]} {bill.year} Statement
                      </p>
                      <p className="text-xs text-sx-lo">
                        {bill.total_trips} trips · {bill.total_weight_mt?.toFixed(1) ?? 0} MT
                        {bill.trader && ` · ${bill.trader.full_name ?? bill.trader.email}`}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${
                      bill.status === 'paid'    ? 'bg-green-900/40 text-sx-green' :
                      bill.status === 'partial' ? 'bg-amber-900/40 text-sx-amber' :
                      'bg-red-900/40 text-sx-red'
                    }`}>{bill.status}</span>
                  </div>

                  <div className="flex gap-4 text-sm flex-wrap">
                    <span className="text-sx-lo">Total: <span className="font-semibold text-sx-hi">₹{bill.total_amount.toLocaleString('en-IN')}</span></span>
                    {bill.amount_paid > 0 && (
                      <span className="text-sx-green">Paid: <span className="font-semibold">₹{bill.amount_paid.toLocaleString('en-IN')}</span></span>
                    )}
                    {balance > 0 && (
                      <span className="text-sx-accent">Due: <span className="font-bold">₹{balance.toLocaleString('en-IN')}</span></span>
                    )}
                  </div>

                  {/* Payment Terms from Trader */}
                  {ptc && (
                    <div className={`rounded-lg px-3 py-2.5 space-y-2 border ${
                      ptc.status === 'confirmed' ? 'bg-green-900/40 border-green-900/60' :
                      ptc.status === 'disputed'  ? 'bg-red-900/40 border-red-900/60' :
                      'bg-amber-900/40 border-amber-900/60'
                    }`}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-sx-lo">Payment Terms from Trader</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          ptc.status === 'confirmed' ? 'bg-green-900/40 text-sx-green' :
                          ptc.status === 'disputed'  ? 'bg-red-900/40 text-sx-red' :
                          'bg-amber-900/40 text-sx-amber'
                        }`}>{ptc.status}</span>
                      </div>
                      <div className="text-xs text-sx-lo space-y-0.5">
                        <p>Due date: <span className="font-semibold">
                          {new Date(ptc.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span></p>
                        {ptc.terms_note && <p>Terms: <span className="font-semibold">{ptc.terms_note}</span></p>}
                        {ptc.confirmed_at && (
                          <p className="text-sx-green">Confirmed on {new Date(ptc.confirmed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                        )}
                        {ptc.dispute_note && (
                          <p className="text-sx-red">Your dispute: {ptc.dispute_note}</p>
                        )}
                      </div>
                      {ptc.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => confirmTerms(ptc)} disabled={ptcSaving === bill.id}
                            className="flex-1 bg-green-500 text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-green-600 disabled:opacity-50 transition">
                            {ptcSaving === bill.id ? 'Saving…' : 'Confirm Terms'}
                          </button>
                          <button onClick={() => { setDisputeBillId(bill.id); setDisputeNote('') }}
                            className="flex-1 border border-red-900/60 text-sx-red rounded-lg py-1.5 text-xs font-semibold hover:bg-red-900/40 transition">
                            Raise Dispute
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dispute input inline */}
                  {disputeBillId === bill.id && (
                    <div className="space-y-2">
                      <textarea rows={2} placeholder="Describe your dispute…"
                        value={disputeNote}
                        onChange={e => setDisputeNote(e.target.value)}
                        className="w-full border border-sx-border bg-sx-raised text-sx-hi rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-900/60 resize-none" />
                      <div className="flex gap-2">
                        <button onClick={() => ptc && submitDispute(ptc)} disabled={!disputeNote.trim() || ptcSaving === bill.id}
                          className="flex-1 bg-red-500 text-white rounded-lg py-1.5 text-sm font-semibold hover:bg-red-600 disabled:opacity-50">
                          Submit Dispute
                        </button>
                        <button onClick={() => setDisputeBillId(null)}
                          className="px-4 py-1.5 text-sm border border-sx-border rounded-lg text-sx-lo hover:bg-sx-raised">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {bill.due_date && !ptc && (
                    <p className="text-xs text-sx-lo">
                      Due date: {new Date(bill.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    {bill.pdf_url && (
                      <a href={bill.pdf_url} target="_blank" rel="noreferrer"
                        className="flex-1 text-center border border-blue-900/60 text-sx-blue rounded-lg py-1.5 text-sm hover:bg-blue-900/40">
                        View Statement PDF
                      </a>
                    )}
                    <button onClick={() => downloadExcel(bill)} disabled={downloading === bill.id}
                      className="flex-1 border border-green-900/60 text-sx-green rounded-lg py-1.5 text-sm hover:bg-green-900/40 disabled:opacity-50 transition">
                      {downloading === bill.id ? 'Downloading…' : 'Download Excel'}
                    </button>
                    <button onClick={() => { setNotifyBill(bill); setNotifyMsg('') }}
                      className="px-3 py-1.5 text-xs text-sx-lo border border-sx-border rounded-lg hover:bg-sx-raised">
                      Notify Trader
                    </button>
                    {billLogs.length > 0 && (
                      <button onClick={() => setExpanded(isExpanded ? null : bill.id)}
                        className="px-3 py-1.5 text-xs text-sx-lo border border-sx-border rounded-lg hover:bg-sx-raised">
                        {isExpanded ? 'Hide' : `${billLogs.length} payment${billLogs.length > 1 ? 's' : ''}`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Payment logs */}
                {isExpanded && billLogs.length > 0 && (
                  <div className="border-t border-sx-border px-5 py-3 space-y-2 bg-sx-raised">
                    <p className="text-xs font-semibold text-sx-lo uppercase tracking-wide">Payment History</p>
                    {billLogs.map(log => (
                      <div key={log.id} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium text-sx-hi">₹{log.amount.toLocaleString('en-IN')}</span>
                          {log.notes && <span className="text-sx-lo text-xs ml-2">· {log.notes}</span>}
                        </div>
                        <span className="text-xs text-sx-lo">
                          {new Date(log.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Notify Trader Modal */}
      {notifyBill && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4">
          <div className="bg-sx-card rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 border border-sx-border">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sx-hi">Notify Trader</h3>
              <button onClick={() => setNotifyBill(null)} className="text-sx-lo hover:text-sx-hi text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-sx-lo">
              Send a message to your trader about this bill
              ({MONTHS[notifyBill.month - 1]} {notifyBill.year}).
            </p>
            <textarea rows={3} placeholder="e.g. Payment of ₹50,000 sent via NEFT today…"
              value={notifyMsg}
              onChange={e => setNotifyMsg(e.target.value)}
              className="w-full border border-sx-border bg-sx-raised text-sx-hi rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sx-accent resize-none" />
            <div className="flex gap-2">
              <button onClick={sendNotification} disabled={!notifyMsg.trim() || notifySending}
                className="flex-1 bg-sx-accent text-white rounded-xl py-2.5 font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition">
                {notifySending ? 'Sending…' : 'Send Notification'}
              </button>
              <button onClick={() => setNotifyBill(null)}
                className="px-5 py-2.5 border border-sx-border rounded-xl text-sm text-sx-lo hover:bg-sx-raised">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
