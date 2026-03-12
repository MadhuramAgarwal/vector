import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib'
import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/createNotification'

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(d: Date = new Date()) {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function drawBorderBox(page: PDFPage, x: number, y: number, w: number, h: number) {
  page.drawRectangle({ x, y, width: w, height: h, borderWidth: 1.2, borderColor: rgb(0.2, 0.3, 0.6), color: rgb(1, 1, 1) })
}

function hLine(page: PDFPage, x1: number, x2: number, y: number, thin = false) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: thin ? 0.5 : 0.8, color: rgb(0.3, 0.4, 0.6) })
}

function vLine(page: PDFPage, x: number, y1: number, y2: number) {
  page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: 0.8, color: rgb(0.3, 0.4, 0.6) })
}

export async function POST(req: NextRequest) {
  try {
    const {
      tripId, orderId, materialType, deliveryAddress,
      buyerId, traderId,
      supplierName, supplierAddress, driverName, truckNumber,
      royaltyNo, orderedQty,
      wb1Weight, wb2Weight,
      royaltyExtracted, wb1Extracted,
    } = await req.json()

    if (!tripId || !orderId || !materialType || !deliveryAddress || !buyerId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()

    // Fetch buyer name
    const { data: buyerUser } = await supabase.from('users').select('full_name').eq('id', buyerId).single()
    const buyerName = buyerUser?.full_name ?? 'Buyer'

    const wb1 = Number(wb1Weight ?? 0)
    const wb2 = Number(wb2Weight ?? 0)
    const netWeight = wb1 > 0 && wb2 > 0
      ? parseFloat(Math.abs(wb1 - wb2).toFixed(3))
      : parseFloat((wb1 || wb2).toFixed(3))

    // ── Mismatch checks ────────────────────────────────────────────────────────
    const ordered = Number(orderedQty ?? 0)
    const TOLERANCE_MT = 0.5

    if (traderId && ordered > 0 && Math.abs(netWeight - ordered) > TOLERANCE_MT) {
      const diff = (netWeight - ordered).toFixed(2)
      await createNotification({
        userId: traderId,
        title:  'Weight Mismatch Alert',
        body:   `Order was for ${ordered} MT but weighbridge shows ${netWeight} MT (diff: ${diff > '0' ? '+' : ''}${diff} MT). Trip: ${tripId.slice(0, 8).toUpperCase()}`,
        type:   'weight_mismatch',
        refId:  tripId,
      })
    }

    // ── Extra mismatch checks from extracted documents ──────────────────────────
    if (traderId && royaltyExtracted) {
      const rp = royaltyExtracted as Record<string, unknown>

      // Vehicle number mismatch: royalty pass vs truck number
      const rpVehicle = (rp.vehicleNumber ?? rp.vehicle_number ?? '') as string
      if (rpVehicle && truckNumber && rpVehicle.replace(/\s/g, '').toUpperCase() !== truckNumber.replace(/\s/g, '').toUpperCase()) {
        await createNotification({
          userId: traderId,
          title:  'Vehicle Number Mismatch',
          body:   `Royalty pass shows vehicle "${rpVehicle}" but trip truck is "${truckNumber}". Please verify. Trip: ${tripId.slice(0, 8).toUpperCase()}`,
          type:   'vehicle_mismatch',
          refId:  tripId,
        })
      }

      // Material mismatch: royalty pass vs ordered material
      const rpMaterial = (rp.material ?? rp.materialType ?? rp.sand_type ?? '') as string
      if (rpMaterial && materialType && !materialType.toLowerCase().includes(rpMaterial.toLowerCase()) && !rpMaterial.toLowerCase().includes(materialType.toLowerCase())) {
        await createNotification({
          userId: traderId,
          title:  'Material Mismatch',
          body:   `Royalty pass material "${rpMaterial}" does not match ordered material "${materialType}". Trip: ${tripId.slice(0, 8).toUpperCase()}`,
          type:   'material_mismatch',
          refId:  tripId,
        })
      }
    }

    // WB1 vehicle number vs truck number
    if (traderId && wb1Extracted) {
      const wb = wb1Extracted as Record<string, unknown>
      const wbVehicle = (wb.vehicleNumber ?? wb.vehicle_number ?? wb.truckNumber ?? '') as string
      if (wbVehicle && truckNumber && wbVehicle.replace(/\s/g, '').toUpperCase() !== truckNumber.replace(/\s/g, '').toUpperCase()) {
        await createNotification({
          userId: traderId,
          title:  'WB1 Vehicle Mismatch',
          body:   `Weighbridge slip 1 shows vehicle "${wbVehicle}" but trip truck is "${truckNumber}". Trip: ${tripId.slice(0, 8).toUpperCase()}`,
          type:   'vehicle_mismatch',
          refId:  tripId,
        })
      }
    }

    // Address check: notify trader so they can verify manually
    if (traderId && supplierAddress && deliveryAddress) {
      // Notify every time so trader can cross-check From→To on challan
      await createNotification({
        userId: traderId,
        title:  'Challan Generated — Verify Address',
        body:   `Delivery challan for ${materialType} (${netWeight} MT). From: ${supplierName ?? 'Supplier'} → To: ${deliveryAddress}. Please verify the delivery address matches the order.`,
        type:   'challan_address_check',
        refId:  tripId,
      })
    }

    // ── Build PDF (A5 portrait, challan style) ─────────────────────────────────
    // A5: 420 × 595 pt
    const W = 420
    const H = 595
    const pdfDoc = await PDFDocument.create()
    const page   = pdfDoc.addPage([W, H])
    const font   = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const bold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const PAD   = 16   // outer padding
    const IW    = W - PAD * 2  // inner width: 388
    const LEFT  = PAD
    const RIGHT = LEFT + IW

    // ── Outer border ──────────────────────────────────────────────────────────
    drawBorderBox(page, LEFT - 2, PAD - 2, IW + 4, H - PAD * 2 + 4)

    // ── Header ────────────────────────────────────────────────────────────────
    let y = H - PAD

    // Top header background
    page.drawRectangle({ x: LEFT - 2, y: y - 64, width: IW + 4, height: 66, color: rgb(0.96, 0.97, 1.0) })

    // "DELIVERY CHALLAN" label on top right
    page.drawText('DELIVERY CHALLAN', { x: RIGHT - 110, y: y - 13, font: bold, size: 7.5, color: rgb(0.2, 0.3, 0.6) })

    // Company name
    page.drawText('SandX', { x: LEFT + 4, y: y - 18, font: bold, size: 18, color: rgb(0.9, 0.4, 0.05) })
    page.drawText('Sand Trading Platform', { x: LEFT + 4, y: y - 30, font, size: 7, color: rgb(0.4, 0.4, 0.4) })
    page.drawText('Quality Delivered At Right Time', { x: LEFT + 4, y: y - 40, font, size: 7, color: rgb(0.4, 0.4, 0.4) })

    // Challan number (red, prominent) on right
    const challanNo = `${Date.now().toString(36).slice(-4).toUpperCase()}`
    page.drawText('Challan No.:', { x: RIGHT - 110, y: y - 28, font: bold, size: 7.5, color: rgb(0.3, 0.3, 0.3) })
    page.drawText(challanNo, { x: RIGHT - 50, y: y - 28, font: bold, size: 14, color: rgb(0.85, 0.1, 0.1) })

    y -= 68
    hLine(page, LEFT - 2, RIGHT + 2, y, false)

    // ── Field rows ────────────────────────────────────────────────────────────
    const ROW_H = 28
    const MID   = LEFT + IW * 0.48   // vertical divider ~48% across

    // Helper: draw one row with optional vertical split
    function fieldRow(
      labelL: string, valueL: string,
      labelR: string | null, valueR: string | null,
      fn: PDFFont, fb: PDFFont
    ) {
      const textY = y - ROW_H + 9

      // Left cell
      page.drawText(labelL, { x: LEFT + 4, y: textY + 7, font: fb, size: 7, color: rgb(0.4, 0.4, 0.5) })
      page.drawText(valueL || '—', { x: LEFT + 4, y: textY, font: fn, size: 8.5, color: rgb(0.05, 0.05, 0.15) })

      if (labelR !== null) {
        vLine(page, MID, y, y - ROW_H)
        page.drawText(labelR, { x: MID + 5, y: textY + 7, font: fb, size: 7, color: rgb(0.4, 0.4, 0.5) })
        page.drawText(valueR || '—', { x: MID + 5, y: textY, font: fn, size: 8.5, color: rgb(0.05, 0.05, 0.15) })
      }

      y -= ROW_H
      hLine(page, LEFT - 2, RIGHT + 2, y, true)
    }

    // Row 1 — Date | Challan No. (decorative)
    fieldRow('Date', fmtDate(), 'Order ID', tripId.slice(0, 8).toUpperCase(), font, bold)

    // Row 2 — Party Name | To
    fieldRow('Party Name', buyerName, 'To (Delivery Address)', deliveryAddress, font, bold)

    // Row 3 — Party Address (full width)
    const addrY = y - ROW_H + 9
    page.drawText('Party Address', { x: LEFT + 4, y: addrY + 7, font: bold, size: 7, color: rgb(0.4, 0.4, 0.5) })
    page.drawText(deliveryAddress || '—', { x: LEFT + 4, y: addrY, font, size: 8.5, color: rgb(0.05, 0.05, 0.15) })
    y -= ROW_H
    hLine(page, LEFT - 2, RIGHT + 2, y, true)

    // Row 4 — From | Royalty No.
    fieldRow('From (Supplier)', supplierName ?? '—', 'Royalty No.', royaltyNo ?? '—', font, bold)

    // Row 5 — From Address | Transporter
    fieldRow('Supplier Address', supplierAddress ?? '—', 'Transporter', driverName ?? '—', font, bold)

    // Row 6 — Material | Truck No.
    fieldRow('Material', materialType, 'Truck No.', truckNumber ?? '—', font, bold)

    // Row 7 — Weight (source) | Rece. Weight (party) — highlighted
    page.drawRectangle({ x: LEFT - 2, y: y - ROW_H, width: IW + 4, height: ROW_H, color: rgb(0.94, 0.97, 1.0) })

    const wY = y - ROW_H + 9
    page.drawText('Weight (at Source)', { x: LEFT + 4, y: wY + 7, font: bold, size: 7, color: rgb(0.2, 0.3, 0.6) })
    page.drawText(wb1 > 0 ? `${wb1.toFixed(3)} MT` : '—', {
      x: LEFT + 4, y: wY, font: bold, size: 11, color: rgb(0.1, 0.4, 0.8),
    })
    vLine(page, MID, y, y - ROW_H)
    page.drawText('Rece. Weight (at Party)', { x: MID + 5, y: wY + 7, font: bold, size: 7, color: rgb(0.2, 0.3, 0.6) })
    page.drawText(wb2 > 0 ? `${wb2.toFixed(3)} MT` : (netWeight > 0 ? `${netWeight.toFixed(3)} MT` : '—'), {
      x: MID + 5, y: wY, font: bold, size: 11, color: rgb(0.1, 0.4, 0.8),
    })
    y -= ROW_H
    hLine(page, LEFT - 2, RIGHT + 2, y, false)

    // Net weight row (full width, accent)
    if (wb1 > 0 && wb2 > 0) {
      page.drawRectangle({ x: LEFT - 2, y: y - ROW_H, width: IW + 4, height: ROW_H, color: rgb(0.9, 0.97, 0.91) })
      const nY = y - ROW_H + 9
      page.drawText('Net Weight (Delivered)', { x: LEFT + 4, y: nY + 7, font: bold, size: 7, color: rgb(0.15, 0.5, 0.2) })
      page.drawText(`${netWeight.toFixed(3)} MT`, { x: LEFT + 4, y: nY, font: bold, size: 13, color: rgb(0.1, 0.45, 0.15) })
      y -= ROW_H
      hLine(page, LEFT - 2, RIGHT + 2, y, false)
    }

    // Ordered vs delivered check row
    if (ordered > 0 && Math.abs(netWeight - ordered) > TOLERANCE_MT) {
      page.drawRectangle({ x: LEFT - 2, y: y - ROW_H + 2, width: IW + 4, height: ROW_H - 2, color: rgb(1, 0.95, 0.92) })
      page.drawText(`⚠ Ordered ${ordered} MT — Delivered ${netWeight.toFixed(3)} MT (Diff: ${(netWeight - ordered > 0 ? '+' : '')}${(netWeight - ordered).toFixed(3)} MT)`, {
        x: LEFT + 4, y: y - ROW_H + 13, font: bold, size: 7.5, color: rgb(0.8, 0.3, 0.1),
      })
      y -= ROW_H
      hLine(page, LEFT - 2, RIGHT + 2, y, true)
    }

    // ── Signature section ─────────────────────────────────────────────────────
    const SIG_H = 62
    y -= 4
    page.drawRectangle({ x: LEFT - 2, y: y - SIG_H, width: IW + 4, height: SIG_H, color: rgb(0.98, 0.98, 0.98) })
    vLine(page, MID, y, y - SIG_H)

    // Left: receiver signature
    page.drawText("Receiver's Signature:", { x: LEFT + 4, y: y - 12, font: bold, size: 7.5, color: rgb(0.3, 0.3, 0.3) })
    page.drawText('With Rubber Stamp', { x: LEFT + 4, y: y - 22, font, size: 6.5, color: rgb(0.5, 0.5, 0.5) })
    page.drawLine({
      start: { x: LEFT + 4, y: y - 46 }, end: { x: MID - 8, y: y - 46 },
      thickness: 0.5, color: rgb(0.6, 0.6, 0.6),
    })
    page.drawText('Mobile No. : ____________', { x: LEFT + 4, y: y - 58, font, size: 6.5, color: rgb(0.4, 0.4, 0.4) })

    // Right: For company
    page.drawText('For, SandX Platform', { x: MID + 5, y: y - 12, font: bold, size: 7.5, color: rgb(0.2, 0.3, 0.6) })
    page.drawLine({
      start: { x: MID + 5, y: y - 46 }, end: { x: RIGHT - 4, y: y - 46 },
      thickness: 0.5, color: rgb(0.6, 0.6, 0.6),
    })
    page.drawText('Authorised Signatory', { x: MID + 30, y: y - 56, font, size: 6.5, color: rgb(0.5, 0.5, 0.5) })

    const pdfBytes = await pdfDoc.save()

    // ── Upload PDF ─────────────────────────────────────────────────────────────
    const filename = `${tripId}-${Date.now()}.pdf`
    const { error: uploadErr } = await supabase.storage
      .from('challans')
      .upload(filename, pdfBytes, { contentType: 'application/pdf', upsert: true })
    if (uploadErr) throw uploadErr

    const { data: { publicUrl } } = supabase.storage.from('challans').getPublicUrl(filename)

    // ── Save challan record ────────────────────────────────────────────────────
    const { data: challan, error: challanErr } = await supabase
      .from('challans')
      .insert({
        trip_id:          tripId,
        order_id:         orderId,
        pdf_url:          publicUrl,
        net_weight:       netWeight,
        material_type:    materialType,
        delivery_address: deliveryAddress,
        buyer_confirmed:  true,
        buyer_confirmed_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (challanErr) throw challanErr

    // Mark trip delivered
    await supabase.from('trips').update({ status: 'delivered' }).eq('id', tripId)
    await supabase.from('trip_status_log').insert({ trip_id: tripId, status: 'delivered', updated_by: buyerId })

    // ── Notifications ──────────────────────────────────────────────────────────
    await createNotification({
      userId: buyerId,
      title:  'Delivery Confirmed',
      body:   `Your challan for ${materialType} (${netWeight} MT) has been generated.`,
      type:   'challan_ready',
      refId:  challan.id,
    })

    if (traderId) {
      await createNotification({
        userId: traderId,
        title:  'Challan Pending Approval',
        body:   `Buyer confirmed delivery of ${materialType} (${netWeight} MT) from ${supplierName ?? 'Supplier'}. Please review and approve.`,
        type:   'challan_ready',
        refId:  challan.id,
      })
    }

    return NextResponse.json({ challanId: challan.id, pdfUrl: publicUrl, netWeight })
  } catch (err) {
    console.error('generate-challan error:', err)
    return NextResponse.json({ error: 'Challan generation failed' }, { status: 500 })
  }
}
