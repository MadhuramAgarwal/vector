import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export async function POST(req: NextRequest) {
  const { traderId, partyId, partyRole, month, year } = await req.json()

  if (!traderId || !partyId || !partyRole || !month || !year) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Fetch party info
  const { data: party } = await supabase
    .from('users')
    .select('full_name, email, phone, address')
    .eq('id', partyId)
    .single()

  const { data: trader } = await supabase
    .from('users')
    .select('full_name, email, phone, address')
    .eq('id', traderId)
    .single()

  // Fetch completed trips for this month with rates
  const startDate = new Date(year, month - 1, 1).toISOString()
  const endDate   = new Date(year, month, 0, 23, 59, 59).toISOString()

  let tripsQuery = supabase
    .from('trips')
    .select(`
      id, status, quantity_mt, created_at, bilty_no,
      supplier_rate_per_mt, transport_rate_per_mt, sale_rate_per_mt,
      supplier_amount, transport_amount, sale_amount,
      order:orders(material_type, delivery_address, scheduled_date, buyer:users!orders_buyer_id_fkey(full_name)),
      driver:users!trips_driver_id_fkey(full_name),
      supplier:users!trips_supplier_id_fkey(full_name),
      weight_slips(net_weight, wb_type)
    `)
    .eq('status', 'delivered')
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  if (partyRole === 'supplier') tripsQuery = tripsQuery.eq('supplier_id', partyId)
  else if (partyRole === 'driver') tripsQuery = tripsQuery.eq('driver_id', partyId)

  const { data: trips } = await tripsQuery

  // For buyer, we need to go via orders
  let buyerTrips: typeof trips = []
  if (partyRole === 'buyer') {
    const { data: bt } = await supabase
      .from('trips')
      .select(`
        id, status, quantity_mt, created_at, bilty_no,
        supplier_rate_per_mt, transport_rate_per_mt, sale_rate_per_mt,
        supplier_amount, transport_amount, sale_amount,
        order:orders!inner(material_type, delivery_address, scheduled_date, buyer_id, buyer:users!orders_buyer_id_fkey(full_name)),
        driver:users!trips_driver_id_fkey(full_name),
        supplier:users!trips_supplier_id_fkey(full_name),
        weight_slips(net_weight, wb_type)
      `)
      .eq('status', 'delivered')
      .eq('order.buyer_id', partyId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
    buyerTrips = bt ?? []
  }

  const allTrips = partyRole === 'buyer' ? buyerTrips : (trips ?? [])

  // Calculate totals
  let totalAmount = 0
  const tripRows: { date: string; material: string; biltyNo: string; grossMt: number; rateMt: number; amount: number }[] = []

  for (const t of allTrips) {
    const wb2 = (t.weight_slips as { net_weight: number | null; wb_type: string }[])?.find(w => w.wb_type === 'wb1')
    const weightMt = wb2?.net_weight ?? t.quantity_mt ?? 0
    let rateMt = 0
    let amount = 0
    if (partyRole === 'supplier') { rateMt = t.supplier_rate_per_mt ?? 0; amount = t.supplier_amount ?? (rateMt * weightMt) }
    if (partyRole === 'driver')   { rateMt = t.transport_rate_per_mt ?? 0; amount = t.transport_amount ?? (rateMt * weightMt) }
    if (partyRole === 'buyer')    { rateMt = t.sale_rate_per_mt ?? 0; amount = t.sale_amount ?? (rateMt * weightMt) }
    totalAmount += amount

    const order = t.order as unknown as { material_type: string; delivery_address: string; scheduled_date: string } | null
    tripRows.push({
      date: fmtDate(order?.scheduled_date ?? t.created_at),
      material: order?.material_type ?? 'Sand',
      biltyNo: t.bilty_no ?? '—',
      grossMt: weightMt,
      rateMt,
      amount,
    })
  }

  const monthName = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long' })
  const dueDate = new Date(year, month, partyRole === 'buyer' ? 15 : 30)

  // Check if bill already exists
  const { data: existingBill } = await supabase
    .from('monthly_bills')
    .select('id')
    .eq('trader_id', traderId)
    .eq('party_id', partyId)
    .eq('party_role', partyRole)
    .eq('month', month)
    .eq('year', year)
    .single()

  // Upsert monthly_bill record
  let billId: string
  if (existingBill) {
    billId = existingBill.id
    await supabase.from('monthly_bills').update({
      total_trips: allTrips.length,
      total_amount: totalAmount,
      due_date: dueDate.toISOString().split('T')[0],
    }).eq('id', billId)
  } else {
    const { data: newBill, error: billErr } = await supabase.from('monthly_bills').insert({
      trader_id: traderId,
      party_id: partyId,
      party_role: partyRole,
      month,
      year,
      total_trips: allTrips.length,
      total_amount: totalAmount,
      due_date: dueDate.toISOString().split('T')[0],
      status: 'unpaid',
    }).select('id').single()

    if (billErr || !newBill) {
      return NextResponse.json({ error: billErr?.message ?? 'Failed to create bill record' }, { status: 500 })
    }
    billId = newBill.id

    // Insert bill_trips
    if (allTrips.length > 0) {
      await supabase.from('bill_trips').insert(
        allTrips.map((t, i) => ({
          bill_id: billId,
          trip_id: t.id,
          bilty_no: t.bilty_no ?? null,
          supply_date: (t.order as unknown as { scheduled_date: string } | null)?.scheduled_date ?? null,
          weight_at_source_mt: tripRows[i].grossMt,
          rate_per_mt: tripRows[i].rateMt,
          amount: tripRows[i].amount,
        }))
      )
    }
  }

  // ── Generate PDF ──────────────────────────────────────────────────────────
  const pdfDoc  = await PDFDocument.create()
  const font    = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontB   = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const page    = pdfDoc.addPage([595, 842]) // A4
  const { width, height } = page.getSize()

  const orange = rgb(0.929, 0.396, 0.024)
  const gray   = rgb(0.4, 0.4, 0.4)
  const black  = rgb(0, 0, 0)
  const lgray  = rgb(0.95, 0.95, 0.95)

  let y = height - 40

  // Header bar
  page.drawRectangle({ x: 0, y: height - 70, width, height: 70, color: orange })
  page.drawText('SandX', { x: 36, y: height - 42, size: 22, font: fontB, color: rgb(1, 1, 1) })
  page.drawText('Monthly Statement', { x: 36, y: height - 62, size: 11, font, color: rgb(1, 1, 1) })
  const roleLabel = partyRole === 'supplier' ? 'Supplier Bill' : partyRole === 'driver' ? 'Transport Bill' : 'Sales Invoice'
  page.drawText(roleLabel, { x: width - 140, y: height - 48, size: 13, font: fontB, color: rgb(1, 1, 1) })
  page.drawText(`${monthName} ${year}`, { x: width - 140, y: height - 64, size: 10, font, color: rgb(1, 1, 1) })

  y = height - 90

  // Party info
  page.drawText('From:', { x: 36, y, size: 9, font, color: gray })
  page.drawText('To:', { x: 310, y, size: 9, font, color: gray })
  y -= 14
  page.drawText(trader?.full_name ?? 'Trader', { x: 36, y, size: 11, font: fontB, color: black })
  page.drawText(party?.full_name ?? 'Party', { x: 310, y, size: 11, font: fontB, color: black })
  y -= 12
  page.drawText(trader?.email ?? '', { x: 36, y, size: 9, font, color: gray })
  page.drawText(party?.email ?? '', { x: 310, y, size: 9, font, color: gray })

  y -= 30

  // Summary box
  page.drawRectangle({ x: 36, y: y - 50, width: width - 72, height: 60, color: lgray, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 })
  const summaryItems = [
    { label: 'Total Trips', value: String(allTrips.length) },
    { label: 'Total Weight', value: `${tripRows.reduce((s, r) => s + r.grossMt, 0).toFixed(2)} MT` },
    { label: 'Total Amount', value: fmtINR(totalAmount) },
    { label: 'Due Date', value: dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
  ]
  summaryItems.forEach((item, i) => {
    const x = 50 + i * 130
    page.drawText(item.label, { x, y: y - 18, size: 8, font, color: gray })
    page.drawText(item.value, { x, y: y - 32, size: 10, font: fontB, color: orange })
  })

  y -= 70

  // Table header
  const cols = [36, 100, 180, 290, 380, 450]
  const headers = ['Date', 'Material', 'Bilty No.', 'Weight (MT)', 'Rate/MT', 'Amount']
  page.drawRectangle({ x: 36, y: y - 4, width: width - 72, height: 18, color: orange })
  headers.forEach((h, i) => {
    page.drawText(h, { x: cols[i] + 2, y: y + 1, size: 8, font: fontB, color: rgb(1, 1, 1) })
  })
  y -= 18

  // Table rows
  tripRows.forEach((row, idx) => {
    if (y < 80) return // simple overflow guard
    if (idx % 2 === 0) {
      page.drawRectangle({ x: 36, y: y - 4, width: width - 72, height: 16, color: lgray })
    }
    const cells = [row.date, row.material, row.biltyNo, row.grossMt.toFixed(2), `₹${row.rateMt.toFixed(0)}`, fmtINR(row.amount)]
    cells.forEach((c, i) => {
      page.drawText(c, { x: cols[i] + 2, y: y + 1, size: 8, font, color: black })
    })
    y -= 16
  })

  // Total row
  y -= 4
  page.drawRectangle({ x: 36, y: y - 6, width: width - 72, height: 20, color: rgb(0.1, 0.1, 0.1) })
  page.drawText('TOTAL', { x: 38, y: y, size: 9, font: fontB, color: rgb(1, 1, 1) })
  page.drawText(fmtINR(totalAmount), { x: cols[5] + 2, y: y, size: 9, font: fontB, color: orange })

  // Footer
  page.drawText('Generated by SandX · This is a computer-generated statement.', {
    x: 36, y: 30, size: 8, font, color: gray,
  })

  const pdfBytes = await pdfDoc.save()
  const buffer   = Buffer.from(pdfBytes)

  // Upload to Supabase storage
  const filename = `bills/${billId}.pdf`
  await supabase.storage.from('documents').upload(filename, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  })
  const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filename)

  // Update bill with pdf_url
  await supabase.from('monthly_bills').update({ pdf_url: publicUrl }).eq('id', billId)

  return NextResponse.json({ billId, pdfUrl: publicUrl, totalAmount, totalTrips: allTrips.length })
}
