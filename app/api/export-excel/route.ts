import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function fmtDate(d: string | null | undefined) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function inr(n: number | null | undefined) {
  if (!n) return 0
  return n
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export async function POST(req: NextRequest) {
  const { type, traderId, partyId, partyRole, month, year, billId } = await req.json()

  if (type === 'bill' && billId) {
    return exportBill(billId)
  }

  if (type === 'trips' && traderId) {
    return exportSandDispatched(traderId, month, year)
  }

  if (type === 'party_trips' && partyId && partyRole && month && year) {
    return exportPartyTrips(partyId, partyRole, month, year)
  }

  return NextResponse.json({ error: 'Invalid export type' }, { status: 400 })
}

// ── SAND DISPATCHED REPORT — main trader export ────────────────────────────────
async function exportSandDispatched(traderId: string, month: number, year: number) {
  const startDate = new Date(year, month - 1, 1).toISOString()
  const endDate   = new Date(year, month, 0, 23, 59, 59).toISOString()
  const monthName = MONTHS[month - 1]

  const { data: trips } = await supabase
    .from('trips')
    .select(`
      id, status, quantity_mt, created_at, bilty_no,
      truck_number,
      supplier_rate_per_mt, transport_rate_per_mt, sale_rate_per_mt,
      supplier_amount, transport_amount, sale_amount, gross_margin, margin_percentage,
      supplier_bill_no, supplier_bill_date, transporter_bill_no, transporter_bill_date,
      payment_due_date, payment_received_date,
      order:orders(
        material_type, delivery_address, scheduled_date,
        buyer:users!orders_buyer_id_fkey(full_name, email)
      ),
      supplier:users!trips_supplier_id_fkey(full_name, email),
      driver:users!trips_driver_id_fkey(full_name, email),
      weight_slips(net_weight, wb_type)
    `)
    .eq('trader_id', traderId)
    .eq('status', 'delivered')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at')

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('SAND DISPATCHED', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })

  // ── 29 columns ─────────────────────────────────────────────────────────────
  const COL_COUNT = 29
  ws.columns = [
    { key: 'srno',          width: 6  },  // A  1  SR NO
    { key: 'supply_date',   width: 14 },  // B  2  DATE OF SUPPLY
    { key: 'bilty_no',      width: 13 },  // C  3  BILTY NO
    { key: 'truck_no',      width: 13 },  // D  4  TRUCK NO
    { key: 'stockist',      width: 18 },  // E  5  STOCKIST (supplier name)
    { key: 'supp_bno',      width: 13 },  // F  6  SUPP. B.NO.
    { key: 'supp_bdate',    width: 13 },  // G  7  BILL DATE (supplier)
    { key: 'wt_source',     width: 13 },  // H  8  WT. AT SOURCE
    { key: 'supp_rate',     width: 10 },  // I  9  RATE (supplier)
    { key: 'supp_amt',      width: 12 },  // J  10 AMT (supplier)
    { key: 'trp_name',      width: 18 },  // K  11 TRANSPORTER NAME
    { key: 'trp_bno',       width: 13 },  // L  12 TRP B.NO.
    { key: 'trp_bdate',     width: 13 },  // M  13 BILL DATE (transporter)
    { key: 'wt_party',      width: 13 },  // N  14 WT. AT PARTY
    { key: 'trp_rate',      width: 10 },  // O  15 RATE (transport)
    { key: 'trp_amt',       width: 12 },  // P  16 AMT (transport)
    { key: 'trp_cost',      width: 12 },  // Q  17 COST (total transport cost)
    { key: 'party_name',    width: 18 },  // R  18 PARTY NAME (buyer)
    { key: 'material',      width: 13 },  // S  19 MATERIAL
    { key: 'pod',           width: 10 },  // T  20 POD
    { key: 'bill_no',       width: 12 },  // U  21 Bill no.
    { key: 'bill_date',     width: 13 },  // V  22 Bill raised date
    { key: 'recv_wt',       width: 13 },  // W  23 RECEIVED WEIGHT
    { key: 'sale_rate',     width: 10 },  // X  24 RATE SALES
    { key: 'bill_amt',      width: 13 },  // Y  25 Bill AMT
    { key: 'margin',        width: 12 },  // Z  26 Margin
    { key: 'margin_pct',    width: 10 },  // AA 27 Margin %
    { key: 'pay_due',       width: 14 },  // AB 28 Payment due
    { key: 'pay_recv',      width: 16 },  // AC 29 Payment recv date
  ]

  // ── Row 1: Merged title ───────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, COL_COUNT)
  const titleCell = ws.getCell('A1')
  titleCell.value = `SAND DISPATCHED REPORT  ${monthName.toUpperCase()} ${year}`
  titleCell.font  = { bold: true, size: 14, color: { argb: 'FF1F4E79' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } }
  ws.getRow(1).height = 28

  // ── Row 2: Column headers ─────────────────────────────────────────────────
  const headers = [
    'SR NO', 'DATE OF SUPPLY', 'BILTY NO', 'TRUCK NO',
    'STOCKIST', 'SUPP. B.NO.', 'BILL DATE',
    'WT. AT SOURCE', 'RATE', 'AMT',
    'TRANSPORTER NAME', 'TRP B.NO.', 'BILL DATE',
    'WT. AT PARTY', 'RATE', 'AMT', 'COST',
    'PARTY NAME', 'MATERIAL', 'POD',
    'Bill no.', 'Bill raised date', 'RECEIVED WEIGHT',
    'RATE SALES', 'Bill AMT',
    'Margin', 'Margin %', 'Payment due', 'Payment recv date',
  ]
  const headerRow = ws.getRow(2)
  headerRow.values = headers
  headerRow.eachCell(cell => {
    cell.font      = { bold: true, size: 9, color: { argb: 'FF1F3864' } }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border    = {
      top:    { style: 'thin', color: { argb: 'FF9DC3E6' } },
      bottom: { style: 'thin', color: { argb: 'FF9DC3E6' } },
      left:   { style: 'thin', color: { argb: 'FF9DC3E6' } },
      right:  { style: 'thin', color: { argb: 'FF9DC3E6' } },
    }
  })
  headerRow.height = 36

  // ── Data rows ─────────────────────────────────────────────────────────────
  const tripList = (trips ?? []) as {
    id: string; quantity_mt: number | null; created_at: string; bilty_no: string | null;
    truck_number: string | null;
    supplier_rate_per_mt: number | null; transport_rate_per_mt: number | null; sale_rate_per_mt: number | null;
    supplier_amount: number | null; transport_amount: number | null; sale_amount: number | null;
    gross_margin: number | null; margin_percentage: number | null;
    supplier_bill_no: string | null; supplier_bill_date: string | null;
    transporter_bill_no: string | null; transporter_bill_date: string | null;
    payment_due_date: string | null; payment_received_date: string | null;
    order: { material_type: string; delivery_address: string; scheduled_date: string; buyer: { full_name: string | null; email: string } | null } | null;
    supplier: { full_name: string | null; email: string } | null;
    driver:   { full_name: string | null; email: string } | null;
    weight_slips: { net_weight: number | null; wb_type: string }[];
  }[]

  let totWtSource = 0, totSuppAmt = 0, totTrpAmt = 0, totTrpCost = 0
  let totRecvWt = 0, totBillAmt = 0, totMargin = 0

  tripList.forEach((t, i) => {
    const order    = t.order as typeof tripList[0]['order']
    const supplier = t.supplier
    const driver   = t.driver
    const wtSource = t.quantity_mt ?? 0
    const wtParty  = (t.weight_slips as { net_weight: number | null; wb_type: string }[])
                       ?.find(w => w.wb_type === 'wb2')?.net_weight ?? wtSource
    const suppAmt  = inr(t.supplier_amount)
    const trpAmt   = inr(t.transport_amount)
    const saleAmt  = inr(t.sale_amount)
    const margin   = inr(t.gross_margin)

    totWtSource += wtSource
    totSuppAmt  += suppAmt
    totTrpAmt   += trpAmt
    totTrpCost  += trpAmt     // cost = transport amount
    totRecvWt   += wtParty
    totBillAmt  += saleAmt
    totMargin   += margin

    const isEven = i % 2 === 0
    const rowBg  = isEven ? 'FFFFFFFF' : 'FFF2F7FC'

    const dataRow = ws.addRow([
      i + 1,
      fmtDate(order?.scheduled_date ?? t.created_at),
      t.bilty_no ?? '',
      t.truck_number ?? '',
      supplier?.full_name ?? supplier?.email ?? '',
      t.supplier_bill_no ?? '',
      fmtDate(t.supplier_bill_date),
      wtSource,
      inr(t.supplier_rate_per_mt),
      suppAmt,
      driver?.full_name ?? driver?.email ?? '',
      t.transporter_bill_no ?? '',
      fmtDate(t.transporter_bill_date),
      wtParty,
      inr(t.transport_rate_per_mt),
      trpAmt,
      trpAmt,
      order?.buyer?.full_name ?? order?.buyer?.email ?? '',
      order?.material_type ?? 'Sand',
      'Yes',
      '',   // Bill no — from buyer's monthly bill (populated when bill generated)
      '',   // Bill raised date
      wtParty,
      inr(t.sale_rate_per_mt),
      saleAmt,
      margin,
      t.margin_percentage != null ? (Number(t.margin_percentage) / 100) : 0,
      fmtDate(t.payment_due_date),
      fmtDate(t.payment_received_date),
    ])

    dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
      cell.border = {
        top:    { style: 'hair', color: { argb: 'FFD9E1F2' } },
        bottom: { style: 'hair', color: { argb: 'FFD9E1F2' } },
        left:   { style: 'hair', color: { argb: 'FFD9E1F2' } },
        right:  { style: 'hair', color: { argb: 'FFD9E1F2' } },
      }
      cell.font = { size: 9 }
      cell.alignment = { vertical: 'middle', horizontal: colNum <= 4 || colNum >= 18 ? 'left' : 'center' }

      // Number cells: right-align amounts
      const numCols = [1, 8, 9, 10, 14, 15, 16, 17, 23, 24, 25, 26, 27]
      if (numCols.includes(colNum)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
        if ([10, 16, 17, 25, 26].includes(colNum)) {
          cell.numFmt = '#,##0'
        }
        if (colNum === 27) {
          cell.numFmt = '0.00%'
        }
      }
    })
    dataRow.height = 18
  })

  // ── Totals row ────────────────────────────────────────────────────────────
  if (tripList.length > 0) {
    const totRow = ws.addRow([
      '', 'TOTAL', '', '', '', '', '',
      totWtSource,          // H
      '', totSuppAmt,       // J
      '', '', '',
      totRecvWt,            // N
      '', totTrpAmt,        // P
      totTrpCost,           // Q
      '', '', '', '', '', totRecvWt, '', totBillAmt, totMargin, '', '', '',
    ])
    totRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = { bold: true, size: 9, color: { argb: 'FF1F3864' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } }
      cell.border = {
        top:    { style: 'medium', color: { argb: 'FF9DC3E6' } },
        bottom: { style: 'thin',   color: { argb: 'FF9DC3E6' } },
        left:   { style: 'thin',   color: { argb: 'FF9DC3E6' } },
        right:  { style: 'thin',   color: { argb: 'FF9DC3E6' } },
      }
      const numCols = [8, 10, 14, 16, 17, 23, 25, 26]
      if (numCols.includes(colNum)) {
        cell.numFmt = '#,##0'
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      }
    })
    totRow.height = 20
  }

  // ── Freeze panes & auto-filter ────────────────────────────────────────────
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: COL_COUNT } }

  const buf = await wb.xlsx.writeBuffer()
  const filename = `SAND_DISPATCHED_REPORT_${monthName.toUpperCase()}_${year}.xlsx`

  return new NextResponse(buf as Buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

// ── Bill export (summary + trips for one monthly bill) ────────────────────────
async function exportBill(billId: string) {
  const { data: bill } = await supabase
    .from('monthly_bills')
    .select('*, party:users!monthly_bills_party_id_fkey(full_name, email, phone), trader:users!monthly_bills_trader_id_fkey(full_name, email)')
    .eq('id', billId)
    .single()

  const { data: billTrips } = await supabase
    .from('bill_trips')
    .select('*')
    .eq('bill_id', billId)
    .order('supply_date')

  const party   = bill?.party   as { full_name?: string; email?: string; phone?: string } | null
  const trader  = bill?.trader  as { full_name?: string; email?: string } | null
  const monthName = MONTHS[(bill?.month ?? 1) - 1]

  const wb = new ExcelJS.Workbook()

  // Summary sheet
  const sumWs = wb.addWorksheet('Summary')
  sumWs.columns = [{ width: 22 }, { width: 28 }, { width: 16 }, { width: 22 }]

  const addSumRow = (label: string, value: string | number, label2 = '', value2: string | number = '') => {
    const r = sumWs.addRow([label, value, label2, value2])
    r.getCell(1).font = { bold: true, size: 10 }
    r.getCell(3).font = { bold: true, size: 10 }
    r.height = 18
  }

  sumWs.mergeCells('A1:D1')
  const t = sumWs.getCell('A1')
  t.value = `SandX Monthly Statement — ${monthName} ${bill?.year}`
  t.font  = { bold: true, size: 14, color: { argb: 'FF1F4E79' } }
  t.alignment = { horizontal: 'center' }
  t.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } }
  sumWs.getRow(1).height = 30

  sumWs.addRow([])
  addSumRow('Party Name', party?.full_name ?? '—', 'Role', (bill?.party_role ?? '').toUpperCase())
  addSumRow('Email', party?.email ?? '—', 'Phone', party?.phone ?? '—')
  addSumRow('Trader', trader?.full_name ?? '—')
  sumWs.addRow([])
  addSumRow('Total Trips',      bill?.total_trips ?? 0)
  addSumRow('Total Amount (₹)', bill?.total_amount ?? 0)
  addSumRow('Amount Paid (₹)',  bill?.amount_paid ?? 0)
  addSumRow('Balance Due (₹)',  (bill?.total_amount ?? 0) - (bill?.amount_paid ?? 0))
  addSumRow('Due Date',         fmtDate(bill?.due_date))
  addSumRow('Status',           (bill?.status ?? '').toUpperCase())

  // Trips detail sheet
  const trWs = wb.addWorksheet('Trip Details')
  trWs.columns = [
    { header: 'Date',               key: 'date',    width: 14 },
    { header: 'Bilty No.',          key: 'bilty',   width: 14 },
    { header: 'Truck No.',          key: 'truck',   width: 14 },
    { header: 'Wt. at Source (MT)', key: 'wts',     width: 18 },
    { header: 'Wt. at Party (MT)',  key: 'wtp',     width: 18 },
    { header: 'Rate/MT (₹)',        key: 'rate',    width: 14 },
    { header: 'Amount (₹)',         key: 'amt',     width: 14 },
  ]

  const hRow = trWs.getRow(1)
  hRow.eachCell(cell => {
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } }
    cell.alignment = { horizontal: 'center' }
  })
  hRow.height = 22

  ;(billTrips ?? []).forEach(bt => {
    trWs.addRow({
      date:  fmtDate(bt.supply_date),
      bilty: bt.bilty_no ?? '—',
      truck: bt.truck_number ?? '—',
      wts:   bt.weight_at_source_mt ?? 0,
      wtp:   bt.weight_at_party_mt ?? 0,
      rate:  bt.rate_per_mt ?? 0,
      amt:   bt.amount ?? 0,
    })
  })

  const buf = await wb.xlsx.writeBuffer()
  const pname = (party?.full_name ?? 'party').replace(/\s+/g, '_')
  const filename = `SandX_Bill_${pname}_${monthName}_${bill?.year}.xlsx`

  return new NextResponse(buf as Buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

// ── Party-specific trips export (buyer / supplier / driver) ───────────────────
async function exportPartyTrips(partyId: string, partyRole: string, month: number, year: number) {
  const startDate = new Date(year, month - 1, 1).toISOString()
  const endDate   = new Date(year, month, 0, 23, 59, 59).toISOString()
  const monthName = MONTHS[month - 1]

  let query = supabase
    .from('trips')
    .select('id, quantity_mt, created_at, bilty_no, supplier_rate_per_mt, transport_rate_per_mt, sale_rate_per_mt, supplier_amount, transport_amount, sale_amount, order:orders(material_type, scheduled_date), weight_slips(net_weight, wb_type)')
    .eq('status', 'delivered')
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  if (partyRole === 'supplier') query = query.eq('supplier_id', partyId)
  else if (partyRole === 'driver') query = query.eq('driver_id', partyId)

  const { data: trips } = await query

  const wb  = new ExcelJS.Workbook()
  const ws  = wb.addWorksheet(`${monthName} ${year}`)

  ws.columns = [
    { header: 'Date',          key: 'date',   width: 14 },
    { header: 'Material',      key: 'mat',    width: 14 },
    { header: 'Bilty No.',     key: 'bilty',  width: 14 },
    { header: 'Net Weight (MT)', key: 'wt',   width: 18 },
    { header: 'Rate/MT (₹)',   key: 'rate',   width: 14 },
    { header: 'Amount (₹)',    key: 'amt',    width: 14 },
  ]

  const hRow = ws.getRow(1)
  hRow.eachCell(cell => {
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } }
    cell.alignment = { horizontal: 'center' }
  })
  hRow.height = 22

  ;(trips ?? []).forEach(t => {
    const order = t.order as { material_type: string; scheduled_date: string } | null
    const wt    = (t.weight_slips as { net_weight: number | null; wb_type: string }[])?.find(w => w.wb_type === 'wb2')?.net_weight ?? t.quantity_mt ?? 0
    const rate  = partyRole === 'supplier' ? (t.supplier_rate_per_mt ?? 0) : partyRole === 'driver' ? (t.transport_rate_per_mt ?? 0) : (t.sale_rate_per_mt ?? 0)
    const amt   = partyRole === 'supplier' ? (t.supplier_amount ?? 0)      : partyRole === 'driver' ? (t.transport_amount ?? 0)      : (t.sale_amount ?? 0)
    ws.addRow({ date: fmtDate(order?.scheduled_date ?? t.created_at), mat: order?.material_type ?? 'Sand', bilty: t.bilty_no ?? '—', wt, rate, amt })
  })

  const buf = await wb.xlsx.writeBuffer()

  return new NextResponse(buf as Buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="SandX_${partyRole}_${monthName}_${year}.xlsx"`,
    },
  })
}
