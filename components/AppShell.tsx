'use client'

import { useRouter } from 'next/navigation'
import { SupabaseClient } from '@supabase/supabase-js'
import NotificationBell from './NotificationBell'

export type Tab = {
  id: string
  label: string
  icon?: string
}

const ROLE_LABELS: Record<string, string> = {
  buyer: 'Buyer',
  trader: 'Trader',
  supplier: 'Supplier',
  driver: 'Fleet Owner',
  truck_driver: 'Driver',
  admin: 'Admin',
}

const ROLE_COLORS: Record<string, string> = {
  buyer:       'text-sx-accent',
  trader:      'text-sx-blue',
  supplier:    'text-sx-green',
  driver:      'text-sx-amber',
  truck_driver:'text-sx-amber',
  admin:       'text-sx-lo',
}

export default function AppShell({
  role,
  tabs,
  activeTab,
  onTabChange,
  userId,
  supabase,
  children,
}: {
  role: string
  tabs: Tab[]
  activeTab: string
  onTabChange: (id: string) => void
  userId: string | null
  supabase: SupabaseClient
  children: React.ReactNode
}) {
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <div className="min-h-screen bg-sx-base">
      {/* ── Fixed top header ── */}
      <header className="fixed top-0 left-0 right-0 z-30 h-14 bg-sx-base border-b border-sx-border flex items-center justify-between px-4"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-3">
          <span className="font-bold text-sx-hi tracking-tight text-base">SandX</span>
          <span className={`text-xs font-semibold ${ROLE_COLORS[role] ?? 'text-sx-lo'}`}>
            {ROLE_LABELS[role] ?? role}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Desktop tabs */}
          <nav className="hidden sm:flex items-center gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-sx-accent text-white'
                    : 'text-sx-lo hover:text-sx-hi'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          {userId && <NotificationBell userId={userId} />}
          <button
            onClick={handleLogout}
            className="text-xs text-sx-lo hover:text-sx-hi transition-colors hidden sm:block"
          >
            Logout
          </button>
        </div>
      </header>

      {/* ── Scrollable content ── */}
      <main
        className="safe-top safe-bottom overflow-y-auto"
        style={{ minHeight: '100vh' }}
      >
        <div className="max-w-2xl mx-auto px-4 py-4">
          {children}
        </div>
      </main>

      {/* ── Mobile bottom tab bar ── */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-sx-base border-t border-sx-border flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center py-3 text-xs font-medium transition-colors ${
              activeTab === tab.id ? 'text-sx-accent' : 'text-sx-lo'
            }`}
          >
            {tab.icon && <span className="text-lg leading-none mb-0.5">{tab.icon}</span>}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
