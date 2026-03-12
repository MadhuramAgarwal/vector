'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  role: string
  label: string
  children?: React.ReactNode
}

export default function DashboardShell({ role, label, children }: Props) {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-gray-900">SandX</span>
          <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
            {role}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-800 transition"
        >
          Logout
        </button>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{label} Dashboard</h2>
        <p className="text-gray-500 mb-8">Welcome to SandX. Your dashboard is coming soon.</p>

        {children ?? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {['Orders', 'Payments', 'Reports', 'Settings'].map(item => (
              <div
                key={item}
                className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm"
              >
                <div className="text-3xl mb-2">🚧</div>
                <div className="font-medium text-gray-600">{item}</div>
                <div className="text-xs mt-1">Coming soon</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
