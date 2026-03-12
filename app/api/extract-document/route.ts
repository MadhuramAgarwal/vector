import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType, documentType } = await req.json()

    if (!imageBase64 || !mimeType || !documentType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' })

    let prompt = ''
    if (documentType === 'royalty_pass') {
      prompt = `Extract all details from this royalty pass document for sand mining.
Return a JSON object with these fields (use null if not found):
{
  "royaltyNumber": "string",
  "permitNumber": "string",
  "minerName": "string",
  "material": "string",
  "quantity": "number (in MT)",
  "validFrom": "YYYY-MM-DD",
  "validTo": "YYYY-MM-DD",
  "issueDate": "YYYY-MM-DD",
  "location": "string",
  "vehicleNumber": "string",
  "remarks": "string"
}
Return only valid JSON, no markdown.`
    } else if (documentType === 'weight_slip') {
      prompt = `Extract all details from this weighbridge / weight slip document.
Return a JSON object with these fields (use null if not found):
{
  "slipNumber": "string",
  "vehicleNumber": "string",
  "grossWeight": "number (in kg)",
  "tareWeight": "number (in kg)",
  "netWeight": "number (in kg)",
  "material": "string",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "weighbridgeName": "string",
  "driverName": "string",
  "remarks": "string"
}
Return only valid JSON, no markdown.`
    } else {
      return NextResponse.json({ error: 'Unknown documentType' }, { status: 400 })
    }

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      },
    ])

    const text = result.response.text().trim()
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const extracted = JSON.parse(cleaned)

    return NextResponse.json({ extracted })
  } catch (err) {
    console.error('extract-document error:', err)
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 })
  }
}
