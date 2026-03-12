const { Client } = require('pg')
const { createClient } = require('@supabase/supabase-js')

const db = new Client({
  connectionString: 'postgresql://postgres:dICg7eTGIHhclcAQ@db.usivkqiyxpycegkqpekw.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
})

const supabase = createClient(
  'https://usivkqiyxpycegkqpekw.supabase.co',
  'sb_publishable_Npdf2VxMDDbabLhC0rVkXw_sFmo2DBO'
)

async function run() {
  await db.connect()

  // Get user IDs
  const { rows: users } = await db.query(
    `SELECT id, email, role FROM public.users WHERE email IN ('trader@sandx.com','supplier1@sandx.com','supplier2@sandx.com','supplier3@sandx.com','driver1@sandx.com','driver2@sandx.com','driver3@sandx.com','buyer1@sandx.com','buyer2@sandx.com','buyer3@sandx.com')`
  )

  const byEmail = {}
  users.forEach(u => byEmail[u.email] = u.id)

  const trader = byEmail['trader@sandx.com']
  console.log('Trader ID:', trader)

  // Default deals: supplier ₹350, driver ₹400, buyer ₹600 — all monthly
  const deals = [
    // Suppliers
    { trader_id: trader, party_id: byEmail['supplier1@sandx.com'], party_role: 'supplier', default_rate_per_mt: 350, payment_terms: 'monthly', credit_days: 30 },
    { trader_id: trader, party_id: byEmail['supplier2@sandx.com'], party_role: 'supplier', default_rate_per_mt: 340, payment_terms: 'monthly', credit_days: 30 },
    { trader_id: trader, party_id: byEmail['supplier3@sandx.com'], party_role: 'supplier', default_rate_per_mt: 360, payment_terms: 'monthly', credit_days: 30 },
    // Drivers
    { trader_id: trader, party_id: byEmail['driver1@sandx.com'], party_role: 'driver', default_rate_per_mt: 400, payment_terms: 'monthly', credit_days: 30 },
    { trader_id: trader, party_id: byEmail['driver2@sandx.com'], party_role: 'driver', default_rate_per_mt: 380, payment_terms: 'monthly', credit_days: 30 },
    { trader_id: trader, party_id: byEmail['driver3@sandx.com'], party_role: 'driver', default_rate_per_mt: 420, payment_terms: 'monthly', credit_days: 30 },
    // Buyers
    { trader_id: trader, party_id: byEmail['buyer1@sandx.com'], party_role: 'buyer', default_rate_per_mt: 600, payment_terms: 'monthly', credit_days: 15 },
    { trader_id: trader, party_id: byEmail['buyer2@sandx.com'], party_role: 'buyer', default_rate_per_mt: 580, payment_terms: 'monthly', credit_days: 15 },
    { trader_id: trader, party_id: byEmail['buyer3@sandx.com'], party_role: 'buyer', default_rate_per_mt: 620, payment_terms: 'monthly', credit_days: 15 },
  ]

  for (const d of deals) {
    if (!d.party_id) { console.log('SKIP — missing party ID'); continue }
    const { rows } = await db.query(
      `INSERT INTO public.deals (trader_id,party_id,party_role,default_rate_per_mt,payment_terms,credit_days)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT DO NOTHING RETURNING id`,
      [d.trader_id, d.party_id, d.party_role, d.default_rate_per_mt, d.payment_terms, d.credit_days]
    )
    console.log(`Deal: ${d.party_role} ₹${d.default_rate_per_mt}/MT — ${rows.length ? 'INSERTED' : 'ALREADY EXISTS'}`)
  }

  await db.end()
  console.log('\nDone.')
}

run().catch(e => { console.error(e.message); db.end() })
