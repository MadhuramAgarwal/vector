import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(req: NextRequest) {
  const { supplierRate, driverRate, buyerRate, quantityMt, material } = await req.json()

  const margin = buyerRate - supplierRate - driverRate
  const marginPct = buyerRate > 0 ? (margin / buyerRate) * 100 : 0
  const totalMargin = margin * quantityMt

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ analysis: buildFallbackAnalysis(margin, marginPct, totalMargin, quantityMt) })
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' })

    const prompt = `You are a sand trading business analyst. Analyze this trip margin for a trader:

Material: ${material}
Quantity: ${quantityMt} MT
Supplier rate: ₹${supplierRate}/MT (total cost: ₹${(supplierRate * quantityMt).toFixed(0)})
Transport rate: ₹${driverRate}/MT (total cost: ₹${(driverRate * quantityMt).toFixed(0)})
Sale rate to buyer: ₹${buyerRate}/MT (total revenue: ₹${(buyerRate * quantityMt).toFixed(0)})
Net margin: ₹${margin.toFixed(0)}/MT (${marginPct.toFixed(1)}%) — Total: ₹${totalMargin.toFixed(0)}

Give a concise 2-3 sentence analysis: Is this margin healthy for a sand trader? Any risk or recommendation? Be specific about the numbers. Keep it under 60 words.`

    const result = await model.generateContent(prompt)
    const analysis = result.response.text().trim()
    return NextResponse.json({ analysis })
  } catch (e) {
    console.error('Gemini analyze-margin error:', e)
    return NextResponse.json({ analysis: buildFallbackAnalysis(margin, marginPct, totalMargin, quantityMt) })
  }
}

function buildFallbackAnalysis(margin: number, marginPct: number, totalMargin: number, qty: number) {
  if (margin < 0) {
    return `This trip is at a loss of ₹${Math.abs(margin).toFixed(0)}/MT (${Math.abs(marginPct).toFixed(1)}%). Total loss: ₹${Math.abs(totalMargin).toFixed(0)} on ${qty} MT. Reconsider rates before confirming.`
  }
  if (marginPct < 10) {
    return `Margin is thin at ${marginPct.toFixed(1)}% (₹${margin.toFixed(0)}/MT). Total profit: ₹${totalMargin.toFixed(0)}. Consider negotiating better rates.`
  }
  return `Margin looks healthy at ${marginPct.toFixed(1)}% (₹${margin.toFixed(0)}/MT). Total profit: ₹${totalMargin.toFixed(0)} on ${qty} MT. Good to proceed.`
}
