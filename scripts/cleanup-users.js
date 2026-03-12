const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://usivkqiyxpycegkqpekw.supabase.co',
  'sb_publishable_Npdf2VxMDDbabLhC0rVkXw_sFmo2DBO'
)

const KEEP_EMAILS = [
  'trader@sandx.com',
  'admin@sandx.com',
  'buyer1@sandx.com',
  'buyer2@sandx.com',
  'buyer3@sandx.com',
  'supplier1@sandx.com',
  'supplier2@sandx.com',
  'supplier3@sandx.com',
  'driver1@sandx.com',
  'driver2@sandx.com',
  'driver3@sandx.com',
]

// Old accounts that have email+password — sign in as each and delete own row
const OLD_EMAIL_ACCOUNTS = [
  { email: 'buyer@sandx.com',    password: 'Buyer@1234' },
  { email: 'supplier@sandx.com', password: 'Supplier@1234' },
  { email: 'driver@sandx.com',   password: 'Driver@1234' },
]

async function main() {
  // Step 1: Delete old email/password accounts by signing in as each
  for (const acc of OLD_EMAIL_ACCOUNTS) {
    process.stdout.write(`Deleting ${acc.email}… `)
    const { data: s } = await supabase.auth.signInWithPassword({ email: acc.email, password: acc.password })
    if (!s?.user) { console.log('SKIP (cannot sign in)'); continue }
    const { error } = await supabase.from('users').delete().eq('id', s.user.id)
    console.log(error ? `ERROR: ${error.message}` : 'OK')
  }

  // Step 2: Sign in as trader and attempt to delete all other non-seeded rows
  await supabase.auth.signInWithPassword({ email: 'trader@sandx.com', password: 'Trader@1234' })

  const { data: allUsers } = await supabase.from('users').select('id, email, full_name')
  const toDelete = (allUsers ?? []).filter(u => !KEEP_EMAILS.includes(u.email))

  console.log(`\nAttempting to remove ${toDelete.length} remaining non-seeded accounts…`)
  for (const u of toDelete) {
    process.stdout.write(`  ${(u.full_name ?? '—').padEnd(24)} ${u.email ?? '(no email)'}… `)
    const { error } = await supabase.from('users').delete().eq('id', u.id)
    console.log(error ? `BLOCKED (${error.message})` : 'OK')
  }

  // Step 3: Show final state
  const { data: final } = await supabase.from('users').select('role, full_name, email').order('role')
  console.log('\n── FINAL USER LIST ─────────────────────────────────')
  const byRole = {}
  for (const u of final ?? []) {
    if (!byRole[u.role]) byRole[u.role] = []
    byRole[u.role].push(u)
  }
  for (const [role, users] of Object.entries(byRole)) {
    console.log(`\n${role.toUpperCase()} (${users.length})`)
    for (const u of users)
      console.log(`  ${(u.full_name ?? '—').padEnd(24)} ${u.email ?? '—'}`)
  }
}

main().catch(console.error)
