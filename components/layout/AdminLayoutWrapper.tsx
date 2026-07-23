'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, ShoppingCart } from 'lucide-react'
import AdminSidebar from './AdminSidebar'
import type { Role } from '@/types'

interface Branch {
  _id: string
  name: string
}

interface Props {
  role: Role
  assignedBranches: string[]
  branchList: Branch[]
  children: React.ReactNode
}

export default function AdminLayoutWrapper({
  role,
  assignedBranches,
  branchList,
  children
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#0a0a0f] text-slate-100">
      {/* ── Mobile Header Topbar (< md) ── */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 flex-shrink-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <ShoppingCart className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-100 text-sm tracking-wide">ShopMS</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-blue-400 border border-slate-700">
            {role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}
          </span>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Toggle Navigation Menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* ── Desktop Fixed Sidebar (≥ md) ── */}
      <div className="hidden md:flex flex-shrink-0">
        <AdminSidebar
          role={role}
          assignedBranches={assignedBranches}
          branchList={branchList}
        />
      </div>

      {/* ── Mobile Slide-over Drawer Backdrop & Content (< md) ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer Panel */}
          <div className="relative z-10 w-64 max-w-[80vw] h-full shadow-2xl animate-in slide-in-from-left duration-200">
            <AdminSidebar
              role={role}
              assignedBranches={assignedBranches}
              branchList={branchList}
              onNavItemClick={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ── Main Content Area ── */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  )
}
