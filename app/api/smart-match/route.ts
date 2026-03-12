import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// Haversine straight-line distance fallback (km)
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Google Distance Matrix API
async function getDistanceMatrix(
  origins: string[],
  destinations: string[]
): Promise<{ distance_km: number; duration_min: number }[][]> {
  const key = process.env.GOOGLE_MAPS_API_KEY!
  const enc  = encodeURIComponent
  const url  = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origins.map(enc).join('|')}&destinations=${destinations.map(enc).join('|')}&units=metric&key=${key}`
  const res  = await fetch(url)
  const data = await res.json()

  if (data.status !== 'OK') throw new Error(`Distance Matrix API: ${data.status}`)

  return data.rows.map((row: { elements: { status: string; distance: { value: number }; duration: { value: number } }[] }) =>
    row.elements.map((el: { status: string; distance: { value: number }; duration: { value: number } }) => ({
      distance_km:  el.status === 'OK' ? el.distance.value / 1000 : -1,
      duration_min: el.status === 'OK' ? el.duration.value / 60   : -1,
    }))
  )
}

export async function POST(req: NextRequest) {
  try {
    const { orderId, deliveryLat, deliveryLng, quantityMt } = await req.json()

    if (!deliveryLat || !deliveryLng) {
      return NextResponse.json({ error: 'Missing delivery location' }, { status: 400 })
    }

    const supabase = await createClient()

    // Fetch suppliers and drivers
    const [{ data: suppliers }, { data: drivers }] = await Promise.all([
      supabase.from('users').select('id, full_name, email, lat, lng, address').eq('role', 'supplier').eq('is_available', true),
      supabase.from('users').select('id, full_name, email, lat, lng, address, truck_number, truck_capacity_mt').eq('role', 'driver').eq('is_available', true),
    ])

    if (!suppliers?.length || !drivers?.length) {
      return NextResponse.json({ error: 'No available suppliers or drivers' }, { status: 404 })
    }

    const deliveryCoord = `${deliveryLat},${deliveryLng}`
    const supplierCoords = suppliers.map(s => `${s.lat},${s.lng}`)
    const driverCoords   = drivers.map(d => `${d.lat},${d.lng}`)

    // Build distance data — with fallback
    let supplierToDelivery: { distance_km: number; duration_min: number }[] = []
    let driverToSupplier:   { distance_km: number; duration_min: number }[][] = []

    try {
      // supplier → delivery
      const sdMatrix = await getDistanceMatrix(supplierCoords, [deliveryCoord])
      supplierToDelivery = sdMatrix.map(row => row[0])

      // driver → each supplier
      const dsMatrix = await getDistanceMatrix(driverCoords, supplierCoords)
      driverToSupplier = dsMatrix
    } catch (mapErr) {
      console.warn('Distance Matrix failed, using straight-line fallback:', mapErr)
      supplierToDelivery = suppliers.map(s => ({
        distance_km:  haversine(Number(s.lat), Number(s.lng), deliveryLat, deliveryLng),
        duration_min: haversine(Number(s.lat), Number(s.lng), deliveryLat, deliveryLng) * 3, // ~20 km/h
      }))
      driverToSupplier = drivers.map(d =>
        suppliers.map(s => ({
          distance_km:  haversine(Number(d.lat), Number(d.lng), Number(s.lat), Number(s.lng)),
          duration_min: haversine(Number(d.lat), Number(d.lng), Number(s.lat), Number(s.lng)) * 3,
        }))
      )
    }

    // Build combinations
    const combinations = []
    for (let si = 0; si < suppliers.length; si++) {
      for (let di = 0; di < drivers.length; di++) {
        const s2d = supplierToDelivery[si]
        const d2s = driverToSupplier[di]?.[si]
        if (!s2d || !d2s || s2d.distance_km < 0 || d2s.distance_km < 0) continue

        const totalDist = parseFloat((s2d.distance_km + d2s.distance_km).toFixed(1))
        const totalMins = parseFloat((s2d.duration_min + d2s.duration_min).toFixed(0))
        const fuelCost  = parseFloat((totalDist * 8).toFixed(0))

        combinations.push({
          supplier_id:             suppliers[si].id,
          supplier_name:           suppliers[si].full_name,
          supplier_address:        suppliers[si].address,
          driver_id:               drivers[di].id,
          driver_name:             drivers[di].full_name,
          driver_truck:            drivers[di].truck_number,
          driver_capacity_mt:      drivers[di].truck_capacity_mt,
          driver_to_supplier_km:   parseFloat(d2s.distance_km.toFixed(1)),
          supplier_to_delivery_km: parseFloat(s2d.distance_km.toFixed(1)),
          total_distance_km:       totalDist,
          total_duration_minutes:  totalMins,
          estimated_fuel_cost:     fuelCost,
        })
      }
    }

    if (!combinations.length) {
      return NextResponse.json({ error: 'Could not calculate combinations' }, { status: 500 })
    }

    // Sort by distance as base
    combinations.sort((a, b) => a.total_distance_km - b.total_distance_km)

    // Try Gemini ranking
    let geminiResult: { best_combination: typeof combinations[0] & { reasoning: string; rank: number }; all_combinations: typeof combinations } | null = null
    let aiUnavailable = false

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' })
      const prompt = `You are a logistics optimizer for a sand delivery platform in Surat, India.

Order: ${quantityMt} MT of sand to be delivered to coordinates (${deliveryLat}, ${deliveryLng}).
Order ID: ${orderId ?? 'N/A'}

Available supplier-driver combinations:
${JSON.stringify(combinations, null, 2)}

Analyze each combination and suggest the BEST one based on: shortest total distance, lowest cost, and practical logistics.

Return ONLY a valid JSON object (no markdown) with this exact structure:
{
  "best_combination": {
    "supplier_id": "...",
    "driver_id": "...",
    "supplier_name": "...",
    "driver_name": "...",
    "total_distance_km": 0,
    "total_duration_minutes": 0,
    "estimated_fuel_cost": 0,
    "reasoning": "1-2 sentences explaining why this is the best choice"
  },
  "all_combinations": [
    { ...same fields as above plus "rank": 1 },
    ...ranked best to worst
  ]
}`

      const result = await model.generateContent(prompt)
      const text = result.response.text().trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      geminiResult = JSON.parse(text)
    } catch (geminiErr) {
      console.warn('Gemini ranking failed, using distance fallback:', geminiErr)
      aiUnavailable = true
    }

    if (aiUnavailable || !geminiResult) {
      // Fallback: rank by distance
      const ranked = combinations.map((c, i) => ({ ...c, rank: i + 1, reasoning: null }))
      return NextResponse.json({
        best_combination: { ...ranked[0], reasoning: null },
        all_combinations: ranked,
        ai_unavailable: true,
      })
    }

    return NextResponse.json({
      best_combination: geminiResult.best_combination,
      all_combinations: geminiResult.all_combinations,
      ai_unavailable: false,
    })
  } catch (err) {
    console.error('smart-match error:', err)
    return NextResponse.json({ error: 'Smart match failed' }, { status: 500 })
  }
}
