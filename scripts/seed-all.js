const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://usivkqiyxpycegkqpekw.supabase.co',
  'sb_publishable_Npdf2VxMDDbabLhC0rVkXw_sFmo2DBO'
)

const USERS = [
  // ── Trader ───────────────────────────────────────────────────────────────
  {
    email: 'trader@sandx.com', password: 'Trader@1234', role: 'trader',
    full_name: 'Ajay Trader',
  },
  // ── Admin ────────────────────────────────────────────────────────────────
  {
    email: 'admin@sandx.com', password: 'Admin@1234', role: 'admin',
    full_name: 'SandX Admin',
  },
  // ── Buyers (Surat) ───────────────────────────────────────────────────────
  {
    email: 'buyer1@sandx.com', password: 'Buyer@1234', role: 'buyer',
    full_name: 'Rahul Mehta',
    lat: 21.1959, lng: 72.7897, address: 'Adajan, Surat, Gujarat',
  },
  {
    email: 'buyer2@sandx.com', password: 'Buyer2@1234', role: 'buyer',
    full_name: 'Priya Shah',
    lat: 21.1957, lng: 72.8762, address: 'Varachha, Surat, Gujarat',
  },
  {
    email: 'buyer3@sandx.com', password: 'Buyer3@1234', role: 'buyer',
    full_name: 'Amit Patel',
    lat: 21.1455, lng: 72.7794, address: 'Vesu, Surat, Gujarat',
  },
  // ── Suppliers (Surat) ────────────────────────────────────────────────────
  {
    email: 'supplier1@sandx.com', password: 'Supplier@1234', role: 'supplier',
    full_name: 'Mohan Stockyard',
    lat: 21.2083, lng: 72.8375, address: 'Katargam, Surat, Gujarat',
    base_location_address: 'Katargam Sand Depot, Surat',
  },
  {
    email: 'supplier2@sandx.com', password: 'Supplier2@1234', role: 'supplier',
    full_name: 'Raj Sand Supply',
    lat: 21.0833, lng: 72.8667, address: 'Sachin, Surat, Gujarat',
    base_location_address: 'Sachin Industrial Area, Surat',
  },
  {
    email: 'supplier3@sandx.com', password: 'Supplier3@1234', role: 'supplier',
    full_name: 'Gujarat Minerals',
    lat: 21.1570, lng: 72.8463, address: 'Udhna, Surat, Gujarat',
    base_location_address: 'Udhna Quarry, Surat',
  },
  // ── Drivers (Surat) ──────────────────────────────────────────────────────
  {
    email: 'driver1@sandx.com', password: 'Driver@1234', role: 'driver',
    full_name: 'Suresh Bhai',
    lat: 21.1959, lng: 72.7897, address: 'Adajan, Surat, Gujarat',
    truck_number: 'GJ05-AB-1234', truck_capacity_mt: 20, is_available: true,
  },
  {
    email: 'driver2@sandx.com', password: 'Driver2@1234', role: 'driver',
    full_name: 'Ramesh Kumar',
    lat: 21.1786, lng: 72.8324, address: 'Ring Road, Surat, Gujarat',
    truck_number: 'GJ05-CD-5678', truck_capacity_mt: 15, is_available: true,
  },
  {
    email: 'driver3@sandx.com', password: 'Driver3@1234', role: 'driver',
    full_name: 'Dinesh Patil',
    lat: 21.0944, lng: 72.7167, address: 'Dumas, Surat, Gujarat',
    truck_number: 'GJ05-EF-9012', truck_capacity_mt: 25, is_available: true,
  },
]

async function createOrGetUser(u) {
  // Try sign up
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: u.email,
    password: u.password,
    options: { data: { role: u.role } },
  })

  if (!signUpErr && signUpData?.user?.id) {
    await new Promise(r => setTimeout(r, 500))
    return signUpData.user.id
  }

  // Already exists — sign in
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: u.email,
    password: u.password,
  })

  if (signInErr) throw new Error(`Cannot sign in as ${u.email}: ${signInErr.message}`)
  return signInData.user.id
}

async function seed() {
  for (const u of USERS) {
    process.stdout.write(`${u.role.padEnd(10)} ${u.email.padEnd(30)} `)

    try {
      const userId = await createOrGetUser(u)

      const profileFields = {
        id:       userId,
        email:    u.email,
        role:     u.role,
        full_name: u.full_name,
      }
      if (u.lat !== undefined)  profileFields.lat  = u.lat
      if (u.lng !== undefined)  profileFields.lng  = u.lng
      if (u.address !== undefined) profileFields.address = u.address
      if (u.base_location_address !== undefined) profileFields.base_location_address = u.base_location_address
      if (u.truck_number !== undefined)   profileFields.truck_number    = u.truck_number
      if (u.truck_capacity_mt !== undefined) profileFields.truck_capacity_mt = u.truck_capacity_mt
      if (u.is_available !== undefined)   profileFields.is_available    = u.is_available

      const { error: profileErr } = await supabase
        .from('users')
        .upsert(profileFields, { onConflict: 'id' })

      if (profileErr) {
        console.log(`AUTH OK | profile error: ${profileErr.message}`)
      } else {
        console.log('OK')
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`)
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════╗')
  console.log('║                     SANDX TEST CREDENTIALS                      ║')
  console.log('╠══════════╦═══════════════════════════════╦═══════════════════════╣')
  console.log('║ Role     ║ Email                         ║ Password              ║')
  console.log('╠══════════╬═══════════════════════════════╬═══════════════════════╣')
  for (const u of USERS) {
    const role = u.role.padEnd(8)
    const email = u.email.padEnd(29)
    const pass = u.password.padEnd(21)
    console.log(`║ ${role} ║ ${email} ║ ${pass} ║`)
  }
  console.log('╚══════════╩═══════════════════════════════╩═══════════════════════╝')
  console.log('\nLocations (for smart match):')
  for (const u of USERS.filter(u => u.lat)) {
    console.log(`  ${u.full_name.padEnd(20)} ${u.address}`)
  }
}

seed().catch(console.error)
