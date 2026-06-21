'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  BarChart3,
  Package,
  Users,
  GitBranch,
  LogOut,
  ShoppingCart,
  UserRound,
  Truck,
  ClipboardList,
  Wallet,
  History,
  LayoutDashboard
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'

interface Branch {
  _id: string
  name: string
}

interface Props {
  role: Role
  assignedBranches: string[]
  branchList?: Branch[]
}

const adminNavItems = [
  { href: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN'] },
  { href: '/branch-report', label: 'Branch Report', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN'] },
  { href: '/products', label: 'Products', icon: Package, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN'] },
  { href: '/customers', label: 'Customers', icon: UserRound, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN'] },
  { href: '/regular-orders', label: 'Regular Orders', icon: ClipboardList, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN'] },
  { href: '/due', label: 'Due Collection', icon: Wallet, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN'] },
  { href: '/stock-log', label: 'Stock Log', icon: History, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN'] },
  { href: '/users', label: 'Users', icon: Users, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN'] },
  { href: '/branches', label: 'Branches', icon: GitBranch, roles: ['SUPER_ADMIN'] }
]

export default function AdminSidebar({ role, assignedBranches, branchList = [] }: Props) {
  const pathname = usePathname()

  const visibleItems = adminNavItems.filter((item) => item.roles.includes(role))

  // Map branchId → name for sidebar POS links
  const branchName = (id: string) => branchList.find((b) => b._id === id)?.name ?? `Branch …${id.slice(-4)}`

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <ShoppingCart className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-100 text-sm">ShopMS</span>
        </div>
      </div>

      {/* Role badge */}
      <div className="px-4 py-3 border-b border-slate-800">
        <span className={cn(
          'text-xs font-medium px-2 py-1 rounded-full',
          role === 'SUPER_ADMIN' && 'bg-violet-900/50 text-violet-400',
          role === 'BRANCH_ADMIN' && 'bg-blue-900/50 text-blue-400'
        )}>
          {role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {/* Main admin nav */}
        {visibleItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-blue-600/20 text-blue-400 font-medium'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          )
        })}

        {/* POS terminal shortcuts — shown for both SUPER_ADMIN and BRANCH_ADMIN */}
        {assignedBranches.length > 0 && (
          <div className="pt-4">
            <p className="text-xs text-slate-600 px-3 mb-1.5 uppercase tracking-wider font-medium">
              {role === 'SUPER_ADMIN' ? 'POS Terminals' : 'My Branch'}
            </p>
            {assignedBranches.slice(0, 5).map((bid) => {
              const name = branchName(bid)
              const posActive = pathname.startsWith(`/${bid}`)
              return (
                <div key={bid} className={cn(
                  'rounded-lg mb-0.5',
                  posActive ? 'bg-blue-600/10' : ''
                )}>
                  <Link
                    href={`/${bid}/pos`}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                      posActive
                        ? 'text-blue-400 font-medium'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                    )}
                  >
                    <ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{name}</span>
                  </Link>
                  {/* Wholesale shortcut — not for MANAGER (MANAGER can't reach dispatch) */}
                  <Link
                    href={`/${bid}/wholesale-dispatch`}
                    className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors ml-1"
                  >
                    <Truck className="w-3 h-3 flex-shrink-0" />
                    Wholesale
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </nav>

      {/* Sign out */}
      <div className="px-2 py-3 border-t border-slate-800">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-rose-400 hover:bg-rose-900/20 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
