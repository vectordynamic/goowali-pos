'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { ShoppingCart, FileText, LayoutDashboard, LogOut, UserRound, ClipboardList, Wallet, Package, PhoneCall, Receipt } from 'lucide-react'
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
  const isManager = role === 'MANAGER'

  const tabs = [
    { href: `/${branchId}/pos`, label: isManager ? 'বিক্রি' : 'POS', icon: ShoppingCart, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'] },
    { href: `/${branchId}/transactions`, label: isManager ? 'হিসাব' : 'Sales Log', icon: ClipboardList, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'] },
    { href: `/${branchId}/customers`, label: isManager ? 'কাস্টমার' : 'Customers', icon: UserRound, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'] },
    { href: `/${branchId}/next-day-orders`, label: isManager ? 'কালকের অর্ডার' : 'Call Sheet', icon: PhoneCall, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'] },
    { href: `/${branchId}/stock`, label: isManager ? 'স্টক' : 'Stock', icon: Package, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'] },
    { href: `/${branchId}/due`, label: isManager ? 'বাকি' : 'Due', icon: Wallet, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'] },
    { href: `/${branchId}/expenses`, label: isManager ? 'খরচ' : 'Expenses', icon: Receipt, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'] },
    { href: `/${branchId}/z-report`, label: isManager ? 'রিপোর্ট' : 'Z-Report', icon: FileText, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'] }
  ].filter((t) => t.roles.includes(role))

  const roleName =
    role === 'SUPER_ADMIN' ? 'Super Admin' :
    role === 'BRANCH_ADMIN' ? 'Admin' : 'ম্যানেজার'

  if (isManager) {
    return (
      <header className="bg-white border-b-2 border-gray-200 px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 shadow-sm flex-shrink-0 z-20">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
            <ShoppingCart className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-black text-gray-800 hidden md:block">ShopMS</span>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 flex-1 mx-1 sm:mx-2 min-w-0">
          {tabs.map((tab) => {
            const active = pathname === tab.href
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs sm:text-sm md:text-base font-bold transition-colors whitespace-nowrap min-h-[40px] flex-shrink-0',
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                )}
              >
                <tab.icon className="w-4 h-4 flex-shrink-0" />
                <span>{tab.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-3 border-l-2 border-gray-200 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs sm:text-sm font-bold text-gray-800 truncate max-w-[120px]">{userName}</p>
            <p className="text-[10px] sm:text-xs text-gray-500">{roleName}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            title="বের হন"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>
    )
  }

  // Admin/Super admin — keep dark theme
  return (
    <header className="bg-slate-900 border-b border-slate-800 px-3 sm:px-4 py-2 flex items-center justify-between gap-3 flex-shrink-0 z-20">
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
          <ShoppingCart className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-sm font-bold text-slate-100 hidden md:block">ShopMS</span>
      </div>

      <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 flex-1 mx-1 sm:mx-2 min-w-0">
        {tabs.map((tab) => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm transition-colors whitespace-nowrap min-h-[36px] flex-shrink-0',
                active
                  ? 'bg-blue-600/20 text-blue-400 font-medium'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              )}
            >
              <tab.icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{tab.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <Link
          href="/analytics"
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs sm:text-sm text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-3 border-l border-slate-700">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-slate-200 truncate max-w-[100px]">{userName}</p>
            <p className="text-[10px] text-slate-500">{roleName}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-900/20 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
