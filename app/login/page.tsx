'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Role = 'buyer' | 'trader' | 'supplier' | 'driver' | 'truck_driver' | 'admin'
// 'login'   — default: email + password
// 'request' — request access form (sent to admin)
// 'setup'   — approved user sets their password
type Mode = 'login' | 'request' | 'setup'

const INPUT = 'w-full bg-sx-raised border border-sx-border rounded-xl px-4 py-3 text-sm text-sx-hi placeholder-sx-lo focus:outline-none focus:ring-2 focus:ring-sx-accent focus:border-transparent transition'
const LABEL = 'block text-xs font-medium text-sx-lo mb-1.5 uppercase tracking-wide'

const ROLE_OPTIONS = [
  { value: 'buyer',        label: 'Buyer — RMC Plant / Construction' },
  { value: 'supplier',     label: 'Supplier — Stockyard Owner' },
  { value: 'truck_driver', label: 'Fleet Owner — Truck Fleet' },
  { value: 'driver',       label: 'Driver — Individual Truck Driver' },
]

export default function LoginPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<Mode>('login')

  // Login state
  const [loginEmail,    setLoginEmail]    = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading,  setLoginLoading]  = useState(false)
  const [loginError,    setLoginError]    = useState('')

  // Request access state
  const [reqName,    setReqName]    = useState('')
  const [reqEmail,   setReqEmail]   = useState('')
  const [reqPhone,   setReqPhone]   = useState('')
  const [reqCompany, setReqCompany] = useState('')
  const [reqAddress, setReqAddress] = useState('')
  const [reqRole,    setReqRole]    = useState<string>('buyer')
  const [reqLoading, setReqLoading] = useState(false)
  const [reqError,   setReqError]   = useState('')
  const [reqDone,    setReqDone]    = useState(false)

  // Setup (approved user creates account) state
  const [setupEmail,    setSetupEmail]    = useState('')
  const [setupPassword, setSetupPassword] = useState('')
  const [setupLoading,  setSetupLoading]  = useState(false)
  const [setupError,    setSetupError]    = useState('')
  const [needsConfirm,  setNeedsConfirm]  = useState(false)

  // ── Login ──────────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    })

    if (error) {
      if (error.message.includes('Email not confirmed')) {
        setLoginError('Email not confirmed — disable email confirmations in Supabase → Authentication → Settings.')
      } else if (error.message.includes('Invalid login credentials')) {
        setLoginError('Wrong email or password.')
      } else {
        setLoginError(error.message)
      }
      setLoginLoading(false)
      return
    }

    const userId = data.user?.id
    const { data: profile } = await supabase.from('users').select('role').eq('id', userId).single()

    if (!profile) {
      const metaRole = (data.user?.user_metadata?.role ?? 'buyer') as Role
      await supabase.from('users').upsert({ id: userId, email: loginEmail, role: metaRole }, { onConflict: 'id' })
      setLoginLoading(false)
      router.replace(metaRole === 'truck_driver' ? '/truck-driver' : `/${metaRole}`)
      return
    }

    setLoginLoading(false)
    router.replace(profile.role === 'truck_driver' ? '/truck-driver' : `/${profile.role}`)
  }

  // ── Request Access ─────────────────────────────────────────────────────────
  async function handleRequest(e: React.FormEvent) {
    e.preventDefault()
    setReqError('')
    setReqLoading(true)

    const { error } = await supabase.from('user_invitations').insert({
      invited_by:   null,                        // direct public request
      target_role:  reqRole,
      full_name:    reqName.trim(),
      email:        reqEmail.toLowerCase().trim(),
      phone:        reqPhone.trim() || null,
      company_name: reqCompany.trim() || null,
      address:      reqAddress.trim() || null,
      status:       'pending',
      requires_approval: true,
    })

    if (error) {
      setReqError(error.message)
    } else {
      setReqDone(true)
    }
    setReqLoading(false)
  }

  // ── Setup Account (approved user picks password) ───────────────────────────
  async function handleSetup(e: React.FormEvent) {
    e.preventDefault()
    setSetupError('')
    setSetupLoading(true)

    // Check for an approved invitation
    const { data: invitation } = await supabase
      .from('user_invitations')
      .select('id, target_role, full_name')
      .eq('email', setupEmail.toLowerCase().trim())
      .eq('status', 'approved')
      .single()

    if (!invitation) {
      setSetupError('No approved invitation found for this email. Submit a request first, or wait for admin approval.')
      setSetupLoading(false)
      return
    }

    const role = invitation.target_role as Role

    const { data, error } = await supabase.auth.signUp({
      email: setupEmail,
      password: setupPassword,
      options: { data: { role, full_name: invitation.full_name } },
    })

    if (error) { setSetupError(error.message); setSetupLoading(false); return }
    if (!data.session) { setNeedsConfirm(true); setSetupLoading(false); return }

    const userId = data.user?.id
    if (userId) {
      await supabase.from('users').upsert(
        { id: userId, email: setupEmail, role, full_name: invitation.full_name },
        { onConflict: 'id' }
      )
      await supabase.from('user_invitations').update({ status: 'used' }).eq('id', invitation.id)
    }

    setSetupLoading(false)
    router.replace(role === 'truck_driver' ? '/truck-driver' : `/${role}`)
  }

  // ── Email confirmation screen ──────────────────────────────────────────────
  if (needsConfirm) return (
    <main className="min-h-screen flex items-center justify-center bg-sx-base px-4">
      <div className="w-full max-w-sm bg-sx-card rounded-2xl border border-sx-border p-8 space-y-4 text-center">
        <div className="text-4xl">📧</div>
        <h2 className="text-lg font-bold text-sx-hi">Check your email</h2>
        <p className="text-sm text-sx-lo">
          A confirmation link was sent to <span className="text-sx-hi font-medium">{setupEmail}</span>. Click it then log in.
        </p>
        <button onClick={() => { setNeedsConfirm(false); setMode('login') }}
          className="w-full bg-sx-accent text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 transition">
          Back to Log In
        </button>
      </div>
    </main>
  )

  // ── Request submitted screen ───────────────────────────────────────────────
  if (reqDone) return (
    <main className="min-h-screen flex items-center justify-center bg-sx-base px-4">
      <div className="w-full max-w-sm bg-sx-card rounded-2xl border border-sx-border p-8 space-y-4 text-center">
        <div className="text-4xl">✅</div>
        <h2 className="text-lg font-bold text-sx-hi">Request Submitted</h2>
        <p className="text-sm text-sx-lo">
          Your access request has been sent to the admin. Once approved, come back here and click <span className="text-sx-hi font-medium">"Set Up Account"</span> to create your password.
        </p>
        <button onClick={() => { setReqDone(false); setMode('login') }}
          className="w-full bg-sx-accent text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 transition">
          Back to Log In
        </button>
      </div>
    </main>
  )

  return (
    <main className="min-h-screen flex items-center justify-center bg-sx-base px-4 py-8"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="w-full max-w-sm space-y-4">

        {/* ── Log In ── */}
        {mode === 'login' && (
          <div className="bg-sx-card rounded-2xl border border-sx-border p-8 space-y-6">
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-bold text-sx-hi tracking-tight">SandX</h1>
              <p className="text-sm text-sx-lo">Sand Trading Platform</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className={LABEL}>Email</label>
                <input type="email" required placeholder="you@example.com"
                  value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Password</label>
                <input type="password" required placeholder="••••••••"
                  value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className={INPUT} />
              </div>
              {loginError && (
                <p className="text-xs text-sx-red bg-sx-raised border border-sx-border rounded-xl px-3 py-2">{loginError}</p>
              )}
              <button type="submit" disabled={loginLoading}
                className="w-full bg-sx-accent text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition">
                {loginLoading ? 'Logging in…' : 'Log In'}
              </button>
            </form>

            <div className="space-y-2 pt-2 border-t border-sx-border text-center">
              <button onClick={() => setMode('request')}
                className="w-full text-sm text-sx-accent hover:opacity-80 transition font-medium py-1">
                New to SandX? Request Access
              </button>
              <button onClick={() => setMode('setup')}
                className="w-full text-xs text-sx-lo hover:text-sx-hi transition py-1">
                Already approved? Set up your account
              </button>
            </div>
          </div>
        )}

        {/* ── Request Access ── */}
        {mode === 'request' && (
          <div className="bg-sx-card rounded-2xl border border-sx-border p-8 space-y-6">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-sx-hi">Request Access</h2>
              <p className="text-xs text-sx-lo">Fill in your details. The admin will review and approve your request.</p>
            </div>

            <form onSubmit={handleRequest} className="space-y-4">
              <div>
                <label className={LABEL}>I am a *</label>
                <select value={reqRole} onChange={e => setReqRole(e.target.value)}
                  className={INPUT}>
                  {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Full Name *</label>
                <input type="text" required placeholder="Your full name"
                  value={reqName} onChange={e => setReqName(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Email *</label>
                <input type="email" required placeholder="you@example.com"
                  value={reqEmail} onChange={e => setReqEmail(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Phone Number *</label>
                <input type="tel" required placeholder="+91 98765 43210"
                  value={reqPhone} onChange={e => setReqPhone(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Company / Business Name *</label>
                <input type="text" required placeholder="e.g. Raj Sand Supply Pvt Ltd"
                  value={reqCompany} onChange={e => setReqCompany(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Business Address</label>
                <input type="text" placeholder="City, District, State"
                  value={reqAddress} onChange={e => setReqAddress(e.target.value)} className={INPUT} />
              </div>

              {reqError && (
                <p className="text-xs text-sx-red bg-sx-raised border border-sx-border rounded-xl px-3 py-2">{reqError}</p>
              )}
              <button type="submit" disabled={reqLoading}
                className="w-full bg-sx-accent text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition">
                {reqLoading ? 'Submitting…' : 'Submit Request'}
              </button>
            </form>

            <button onClick={() => setMode('login')}
              className="w-full text-xs text-sx-lo hover:text-sx-hi transition text-center py-1">
              ← Back to Log In
            </button>
          </div>
        )}

        {/* ── Set Up Account (approved user) ── */}
        {mode === 'setup' && (
          <div className="bg-sx-card rounded-2xl border border-sx-border p-8 space-y-6">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-sx-hi">Set Up Account</h2>
              <p className="text-xs text-sx-lo">Use the email you submitted in your access request. Choose your own password.</p>
            </div>

            <form onSubmit={handleSetup} className="space-y-4">
              <div>
                <label className={LABEL}>Email (from your request)</label>
                <input type="email" required placeholder="you@example.com"
                  value={setupEmail} onChange={e => setSetupEmail(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Choose a Password</label>
                <input type="password" required minLength={6} placeholder="At least 6 characters"
                  value={setupPassword} onChange={e => setSetupPassword(e.target.value)} className={INPUT} />
              </div>
              {setupError && (
                <p className="text-xs text-sx-red bg-sx-raised border border-sx-border rounded-xl px-3 py-2">{setupError}</p>
              )}
              <button type="submit" disabled={setupLoading}
                className="w-full bg-sx-accent text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition">
                {setupLoading ? 'Creating account…' : 'Create My Account'}
              </button>
            </form>

            <button onClick={() => setMode('login')}
              className="w-full text-xs text-sx-lo hover:text-sx-hi transition text-center py-1">
              ← Back to Log In
            </button>
          </div>
        )}

      </div>
    </main>
  )
}
