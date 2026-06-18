'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { ShoppingCart, Truck, FileText, LayoutDashboard, LogOut, UserRound, ClipboardList, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'

interface Props {
  branchId: string
  userId: string
  userName: string
  role: Role
}

export default function POSHeader({ branchId, userName, role }: Props) {
  const pathname = usePathname()

  // Build tabs based on role:
  // MANAGER: POS + Customers (Retail only) + Z-Report
  // BRANCH_ADMIN / SUPER_ADMIN: POS + Customers + Dispatch + Z-Report + Dashboard link
  const tabs = [
    { href: `/${branchId}/pos`, label: 'POS', icon: ShoppingCart, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'] },
    { href: `/${branchId}/transactions`, label: 'Sales Log', icon: ClipboardList, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'] },
    { href: `/${branchId}/customers`, label: 'Customers', icon: UserRound, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'] },
    { href: `/${branchId}/wholesale-dispatch`, label: 'Dispatch', icon: Truck, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN'] },
    { href: `/${branchId}/due`, label: 'Due', icon: Wallet, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'] },
    { href: `/${branchId}/z-report`, label: 'Z-Report', icon: FileText, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'] }
  ].filter((t) => t.roles.includes(role))

  const roleName =
    role === 'SUPER_ADMIN' ? 'Super Admin' :
    role === 'BRANCH_ADMIN' ? 'Admin' :
    'Manager'

  return (
    <header className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center gap-4">
      <div className="flex items-center gap-2 mr-2">
        <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
          <ShoppingCart className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-sm font-bold text-slate-100 hidden sm:block">ShopMS</span>
      </div>

      <nav className="flex items-center gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
                active
                  ? 'bg-blue-600/20 text-blue-400 font-medium'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </Link>
          )
        })}
      </nav>

      <div className="flex-1" />

      {/* Admins get a back-to-dashboard shortcut */}
      {role !== 'MANAGER' && (
        <Link
          href="/analytics"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          Dashboard
        </Link>
      )}

      <div className="flex items-center gap-3 pl-3 border-l border-slate-700">
        <div className="text-right hidden sm:block">
          <p className="text-xs font-medium text-slate-200">{userName}</p>
          <p className="text-xs text-slate-500">{roleName}</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-900/20 transition-colors"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
