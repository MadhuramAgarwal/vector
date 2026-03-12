// Supabase Edge Function: payment-reminders
// Schedule: every day at 9:00 AM IST (03:30 UTC) via pg_cron
// Implements 10 notification rules for payment tracking

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

interface Bill {
  id: string
  trader_id: string
  party_id: string
  party_role: string
  month: number
  year: number
  total_trips: number
  total_amount: number
  amount_paid: number
  due_date: string
  status: string
}

Deno.serve(async (_req) => {
  try {
    const today     = new Date()
    const todayStr  = today.toISOString().split('T')[0]
    const notifications: object[] = []

    // Fetch all unpaid/partial bills
    const { data: bills, error } = await supabase
      .from('monthly_bills')
      .select('*')
      .in('status', ['unpaid', 'partial'])

    if (error) throw error

    for (const bill of (bills as Bill[])) {
      const balance   = bill.total_amount - bill.amount_paid
      const dueDate   = new Date(bill.due_date)
      const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      const isOverdue = daysUntilDue < 0
      const overdueDays = Math.abs(daysUntilDue)

      // ── Rule 1: Due today ─────────────────────────────────────────────────
      if (daysUntilDue === 0) {
        notifications.push({
          user_id: bill.party_id,
          title: 'Payment Due Today',
          body: `Your ${monthName(bill.month)} ${bill.year} bill of ₹${balance.toLocaleString('en-IN')} is due today.`,
          type: 'payment_due',
          ref_id: bill.id,
        })
        // Also notify trader
        notifications.push({
          user_id: bill.trader_id,
          title: 'Payment Due Today',
          body: `${roleLabel(bill.party_role)} payment of ₹${balance.toLocaleString('en-IN')} is due today.`,
          type: 'payment_due',
          ref_id: bill.id,
        })
      }

      // ── Rule 2: Due in 3 days ─────────────────────────────────────────────
      if (daysUntilDue === 3) {
        notifications.push({
          user_id: bill.party_id,
          title: 'Payment Due in 3 Days',
          body: `Your ${monthName(bill.month)} ${bill.year} payment of ₹${balance.toLocaleString('en-IN')} is due in 3 days.`,
          type: 'payment_reminder',
          ref_id: bill.id,
        })
      }

      // ── Rule 3: Due in 7 days ─────────────────────────────────────────────
      if (daysUntilDue === 7) {
        notifications.push({
          user_id: bill.party_id,
          title: 'Payment Reminder',
          body: `Your ${monthName(bill.month)} ${bill.year} bill of ₹${balance.toLocaleString('en-IN')} is due in 7 days.`,
          type: 'payment_reminder',
          ref_id: bill.id,
        })
      }

      // ── Rule 4: 1 day overdue ─────────────────────────────────────────────
      if (isOverdue && overdueDays === 1) {
        notifications.push({
          user_id: bill.party_id,
          title: 'Payment Overdue',
          body: `Your ${monthName(bill.month)} ${bill.year} payment of ₹${balance.toLocaleString('en-IN')} was due yesterday. Please settle immediately.`,
          type: 'payment_overdue',
          ref_id: bill.id,
        })
        notifications.push({
          user_id: bill.trader_id,
          title: 'Payment Overdue',
          body: `${roleLabel(bill.party_role)} payment of ₹${balance.toLocaleString('en-IN')} is 1 day overdue.`,
          type: 'payment_overdue',
          ref_id: bill.id,
        })
      }

      // ── Rule 5: 7 days overdue ────────────────────────────────────────────
      if (isOverdue && overdueDays === 7) {
        notifications.push({
          user_id: bill.party_id,
          title: 'Payment 7 Days Overdue',
          body: `Your ${monthName(bill.month)} ${bill.year} payment of ₹${balance.toLocaleString('en-IN')} is 7 days overdue. Action required.`,
          type: 'payment_overdue',
          ref_id: bill.id,
        })
        notifications.push({
          user_id: bill.trader_id,
          title: 'Urgent: Payment 7 Days Overdue',
          body: `${roleLabel(bill.party_role)} payment of ₹${balance.toLocaleString('en-IN')} is 7 days overdue. Follow up immediately.`,
          type: 'payment_overdue',
          ref_id: bill.id,
        })
      }

      // ── Rule 6: 15 days overdue ───────────────────────────────────────────
      if (isOverdue && overdueDays === 15) {
        notifications.push({
          user_id: bill.party_id,
          title: 'Payment 15 Days Overdue',
          body: `URGENT: Your ${monthName(bill.month)} ${bill.year} payment of ₹${balance.toLocaleString('en-IN')} is 15 days overdue.`,
          type: 'payment_overdue',
          ref_id: bill.id,
        })
        notifications.push({
          user_id: bill.trader_id,
          title: 'Critical: 15 Days Overdue',
          body: `${roleLabel(bill.party_role)} bill ₹${balance.toLocaleString('en-IN')} — 15 days overdue. Consider legal action.`,
          type: 'payment_overdue',
          ref_id: bill.id,
        })
      }

      // ── Rule 7: 30 days overdue ───────────────────────────────────────────
      if (isOverdue && overdueDays === 30) {
        notifications.push({
          user_id: bill.trader_id,
          title: '30 Days Overdue — Escalate',
          body: `${roleLabel(bill.party_role)} bill of ₹${balance.toLocaleString('en-IN')} is 30 days overdue. Escalate to management.`,
          type: 'payment_overdue',
          ref_id: bill.id,
        })
      }

      // ── Rule 8: Partial payment received — remind about balance ──────────
      if (bill.status === 'partial' && bill.amount_paid > 0 && daysUntilDue <= 5 && daysUntilDue >= 0) {
        notifications.push({
          user_id: bill.party_id,
          title: 'Pending Balance Reminder',
          body: `You have an outstanding balance of ₹${balance.toLocaleString('en-IN')} for ${monthName(bill.month)} ${bill.year}. Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}.`,
          type: 'payment_reminder',
          ref_id: bill.id,
        })
      }

      // ── Rule 9: Bill generated (first day of month, check new bills) ──────
      // Bills generated today = created today
      const billCreatedToday = (bill as unknown as { created_at: string }).created_at?.startsWith(todayStr)
      if (billCreatedToday) {
        notifications.push({
          user_id: bill.party_id,
          title: 'New Bill Generated',
          body: `Your ${monthName(bill.month)} ${bill.year} bill of ₹${bill.total_amount.toLocaleString('en-IN')} has been generated. Due: ${new Date(bill.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}.`,
          type: 'bill_generated',
          ref_id: bill.id,
        })
      }
    }

    // ── Rule 10: Remind supplier/driver about pending trip_rates ─────────────
    const { data: pendingRates } = await supabase
      .from('trip_rates')
      .select('party_id, party_role, default_rate_per_mt, trip_id, expires_at')
      .eq('rate_status', 'pending')

    for (const rate of (pendingRates ?? []) as { party_id: string; party_role: string; default_rate_per_mt: number; trip_id: string; expires_at: string | null }[]) {
      // Only remind once per day (use expires_at null as proxy for not-yet-proposed)
      if (!rate.expires_at) {
        notifications.push({
          user_id: rate.party_id,
          title: 'Trip Rate Pending',
          body: `You have a trip with a default rate of ₹${rate.default_rate_per_mt}/MT. You can propose a different rate before the trip is completed.`,
          type: 'rate_reminder',
          ref_id: rate.trip_id,
        })
      }
    }

    // ── Rule 11: Unconfirmed payment terms (pending > 1 day) ─────────────────
    const { data: pendingPTCs } = await supabase
      .from('payment_term_confirmations')
      .select('bill_id, party_id, trader_id, due_date, sent_at')
      .eq('status', 'pending')

    for (const ptc of (pendingPTCs ?? []) as { bill_id: string; party_id: string; trader_id: string; due_date: string; sent_at: string }[]) {
      const sentAt = new Date(ptc.sent_at)
      const daysSinceSent = Math.floor((today.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24))
      if (daysSinceSent === 1) {
        notifications.push({
          user_id: ptc.party_id,
          title: 'Payment Terms Awaiting Confirmation',
          body: `Your trader has shared payment terms for bill due ${new Date(ptc.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}. Please confirm or raise a dispute.`,
          type: 'payment_terms',
          ref_id: ptc.bill_id,
        })
      }
    }

    // Insert all notifications in batch
    if (notifications.length > 0) {
      await supabase.from('notifications').insert(notifications)
    }

    return new Response(JSON.stringify({
      success: true,
      notificationsSent: notifications.length,
      billsChecked: (bills as Bill[]).length,
      date: todayStr,
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('payment-reminders error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

function monthName(month: number) {
  return new Date(2024, month - 1).toLocaleString('en-IN', { month: 'long' })
}

function roleLabel(role: string) {
  if (role === 'supplier') return 'Supplier'
  if (role === 'driver')   return 'Transporter'
  return 'Buyer'
}
