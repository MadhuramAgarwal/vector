const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://usivkqiyxpycegkqpekw.supabase.co',
  'sb_publishable_Npdf2VxMDDbabLhC0rVkXw_sFmo2DBO'
)

async function main() {
  // Sign in as driver1 to be able to read/write own row
  const { data: session } = await supabase.auth.signInWithPassword({
    email: 'driver1@sandx.com',
    password: 'Driver@1234',
  })
  console.log('Signed in as:', session?.user?.email, '| ID:', session?.user?.id)

  // Force update the name
  const { error } = await supabase.from('users')
    .update({ full_name: 'Suresh Bhai' })
    .eq('id', session?.user?.id)
  console.log('Name update:', error ? error.message : 'OK → Suresh Bhai')

  // List all drivers
  await supabase.auth.signInWithPassword({ email: 'trader@sandx.com', password: 'Trader@1234' })
  const { data: drivers } = await supabase.from('users').select('id, email, full_name, role').eq('role', 'driver')
  console.log('\nAll driver accounts:')
  drivers?.forEach(d => console.log(` ${d.full_name?.padEnd(20)} ${d.email?.padEnd(30)} ${d.id}`))
}

main().catch(console.error)
