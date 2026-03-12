const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(
  'https://usivkqiyxpycegkqpekw.supabase.co',
  'sb_publishable_Npdf2VxMDDbabLhC0rVkXw_sFmo2DBO'
)

async function main() {
  await supabase.auth.signInWithPassword({ email: 'trader@sandx.com', password: 'Trader@1234' })

  const { data, error } = await supabase.from('users').select('role, full_name, email')
  if (error) { console.error(error.message); return }

  const byRole = {}
  for (const u of data) {
    if (!byRole[u.role]) byRole[u.role] = []
    byRole[u.role].push(u)
  }

  for (const [role, users] of Object.entries(byRole)) {
    console.log(`\n── ${role.toUpperCase()} (${users.length})`)
    for (const u of users)
      console.log(`   ${(u.full_name ?? '—').padEnd(24)} ${u.email ?? '(phone/OTP only — no email)'}`)
  }
}
main().catch(console.error)
