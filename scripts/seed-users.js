const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://usivkqiyxpycegkqpekw.supabase.co',
  'sb_publishable_Npdf2VxMDDbabLhC0rVkXw_sFmo2DBO'
)

const USERS = [
  { email: 'buyer@sandx.com',    password: 'Buyer@1234',    role: 'buyer',    full_name: 'Ravi Kumar' },
  { email: 'supplier@sandx.com', password: 'Supplier@1234', role: 'supplier', full_name: 'Mohan Stockyard' },
  { email: 'driver@sandx.com',   password: 'Driver@1234',   role: 'driver',   full_name: 'Suresh Driver' },
  { email: 'trader@sandx.com',   password: 'Trader@1234',   role: 'trader',   full_name: 'Ajay Trader' },
  { email: 'admin@sandx.com',    password: 'Admin@1234',    role: 'admin',    full_name: 'SandX Admin' },
]

async function seed() {
  for (const u of USERS) {
    process.stdout.write(`Creating ${u.role} (${u.email})… `)

    // Sign up
    const { data, error } = await supabase.auth.signUp({
      email: u.email,
      password: u.password,
      options: { data: { role: u.role } },
    })

    if (error) {
      console.log(`SKIP (${error.message})`)
      // Try to still upsert profile if user already exists
      const { data: existing } = await supabase.auth.signInWithPassword({
        email: u.email, password: u.password,
      })
      if (existing?.user) {
        await supabase.from('users').upsert(
          { id: existing.user.id, email: u.email, role: u.role, full_name: u.full_name },
          { onConflict: 'id' }
        )
      }
      continue
    }

    const userId = data.user?.id
    if (!userId) { console.log('ERROR: no user id'); continue }

    // Wait for trigger
    await new Promise(r => setTimeout(r, 400))

    // Upsert profile with full_name
    const { error: profileErr } = await supabase.from('users').upsert(
      { id: userId, email: u.email, role: u.role, full_name: u.full_name },
      { onConflict: 'id' }
    )

    if (profileErr) {
      console.log(`AUTH OK but profile error: ${profileErr.message}`)
    } else {
      console.log('DONE')
    }
  }

  console.log('\n--- Credentials ---')
  for (const u of USERS) {
    console.log(`${u.role.padEnd(10)} ${u.email.padEnd(25)} ${u.password}`)
  }
}

seed().catch(console.error)
