'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { Wallet, RefreshCw, Search, Phone } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Role } from '@/types'
import { useBranches } from '@/lib/queries/useBranches'
import DuePdfDownload from './DuePdfDownload'

interface Customer {
  _id: string
  name: string
  phone: string
  location?: string
  customerType: 'Retail' | 'Paikari'
  registeredBranch?: string
  khata: { currentDue: number; creditLimit: number }
}

interface Branch {
  _id: string
  name: string
}

interface StatementItem {
  variantId: string
  quantity: number
  rateApplied: number
}

interface StatementRow {
  _id: string
  createdAt: string
  transactionType: string
  items: StatementItem[]
  totalBill: number
  cashPaid: number
  addedToKhata: number
  notes: string
}

interface Props {
  role: Role
  assignedBranches: string[]
  forceBranchId?: string
  lightMode?: boolean
}

type DueTab = 'Retail' | 'Paikari'

export default function DuePage({ role, assignedBranches, forceBranchId, lightMode }: Props) {
  // Shared cache — was previously re-fetched on every debounced search/tab change since it
  // lived inside the same load() call; branches don't depend on either.
  const { data: branchesData } = useBranches(role !== 'MANAGER')
  const branches: Branch[] = branchesData ?? []

  const [activeTab, setActiveTab] = useState<DueTab>('Retail')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState(forceBranchId ?? '')
  const [loading, setLoading] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  // Debounce the search box — avoid firing a request on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    const params = new URLSearchParams({ due: '1', type: activeTab })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (branchFilter) params.set('branchId', branchFilter)

    try {
      const custRes = await fetch(`/api/customers?${params}`, { signal: controller.signal })
      const custData = await custRes.json()
      setCustomers(Array.isArray(custData) ? custData : [])
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      toast.error('Failed to load due list')
    } finally {
      if (abortRef.current === controller) setLoading(false)
    }
  }, [activeTab, debouncedSearch, branchFilter, role])

  useEffect(() => {
    load()
    return () => abortRef.current?.abort()
  }, [load])

  const branchName = (id?: string) =>
    branches.find((b) => b._id === id)?.name ?? id?.slice(-6) ?? '—'

  const totalDue = customers.reduce((s, c) => s + c.khata.currentDue, 0)
  const showBranchFilter = role === 'SUPER_ADMIN' && !forceBranchId

  function handleCollected(customerId: string) {
    setCustomers((prev) => prev.filter((c) => c._id !== customerId))
  }

  const t = lightMode
    ? {
        tabInactive: 'bg-white border-gray-200 text-gray-500 hover:border-gray-300',
        filterPanel: 'bg-white border border-gray-200 rounded-2xl p-3 shadow-sm',
        searchIcon: 'text-gray-400',
        searchInput: 'linput pl-12',
        select: 'linput w-48',
        refreshBtn: 'p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors',
        totalLabel: 'text-gray-500 font-bold',
        loadingText: 'text-gray-400',
        emptyCard: 'text-center py-16 lcard',
        emptyIcon: 'text-gray-300',
        emptyTitle: 'text-gray-600',
        emptySub: 'text-gray-400',
        card: 'bg-white border border-gray-200 rounded-2xl shadow-sm',
        ring: 'ring-blue-200',
        nameText: 'text-gray-800',
        branchBadge: 'bg-gray-100 text-gray-500',
        phoneText: 'text-gray-500',
        phoneIcon: 'text-gray-400',
        toggleClosed: 'bg-gray-200 text-gray-600',
        formWrap: 'border-t border-gray-100 bg-gray-50',
        label: 'text-gray-600',
        amountInput: 'border-gray-300 text-gray-800 bg-white focus:border-blue-400',
        partialMsg: 'text-amber-600 bg-amber-50 border-amber-200',
        fullMsg: 'text-green-600 bg-green-50 border-green-200',
      }
    : {
        tabInactive: 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600',
        filterPanel: 'bg-slate-900 border border-slate-800 rounded-2xl p-3',
        searchIcon: 'text-slate-500',
        searchInput: 'input-base pl-12',
        select: 'input-base w-48',
        refreshBtn: 'p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-900/20 rounded-xl transition-colors',
        totalLabel: 'text-slate-400 font-bold',
        loadingText: 'text-slate-500',
        emptyCard: 'text-center py-16 bg-slate-900 border border-slate-800 rounded-2xl',
        emptyIcon: 'text-slate-700',
        emptyTitle: 'text-slate-400',
        emptySub: 'text-slate-600',
        card: 'bg-slate-900 border border-slate-800 rounded-2xl',
        ring: 'ring-blue-500/40',
        nameText: 'text-slate-100',
        branchBadge: 'bg-slate-800 text-slate-400',
        phoneText: 'text-slate-400',
        phoneIcon: 'text-slate-500',
        toggleClosed: 'bg-slate-700 text-slate-300',
        formWrap: 'border-t border-slate-800 bg-slate-800/50',
        label: 'text-slate-400',
        amountInput: 'border-slate-700 text-slate-100 bg-slate-800 focus:border-blue-500',
        partialMsg: 'text-amber-400 bg-amber-900/20 border-amber-800/50',
        fullMsg: 'text-green-400 bg-green-900/20 border-green-800/50',
      }

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4">
        {(['Retail', 'Paikari'] as DueTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-base font-bold rounded-xl transition-colors border-2 ${
              activeTab === tab
                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                : t.tabInactive
            }`}
          >
            {tab === 'Paikari' ? 'পাইকারি' : 'খুচরা'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className={`flex flex-wrap items-center gap-3 mb-4 ${t.filterPanel}`}>
        <div className="relative flex-1 min-w-[160px]">
          <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${t.searchIcon}`} />
          <input
            className={t.searchInput}
            placeholder="নাম বা ফোন খুঁজুন..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {showBranchFilter && branches.length > 1 && (
          <select
            className={t.select}
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="">সব শাখা</option>
            {branches.map((b) => (
              <option key={b._id} value={b._id}>{b.name}</option>
            ))}
          </select>
        )}

        <button onClick={load} className={t.refreshBtn}>
          <RefreshCw className="w-5 h-5" />
        </button>

        <DuePdfDownload
          branchId={forceBranchId || branchFilter || assignedBranches[0] || ''}
          type={activeTab}
          branchLabel={
            forceBranchId || branchFilter
              ? branchName(forceBranchId || branchFilter)
              : 'সব শাখা'
          }
          lightMode={lightMode}
        />

        {customers.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <Wallet className="w-5 h-5 text-red-500" />
            <span className="text-lg font-black text-red-500">{formatCurrency(totalDue)}</span>
            <span className={t.totalLabel}>মোট বাকি</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className={`text-center py-12 text-lg ${t.loadingText}`}>লোড হচ্ছে...</div>
      ) : customers.length === 0 ? (
        <div className={t.emptyCard}>
          <Wallet className={`w-12 h-12 mx-auto mb-3 ${t.emptyIcon}`} />
          <p className={`text-lg font-bold ${t.emptyTitle}`}>কোনো বাকি নেই</p>
          <p className={`mt-1 ${t.emptySub}`}>
            সব {activeTab === 'Retail' ? 'খুচরা' : 'পাইকারি'} কাস্টমারের বাকি পরিশোধ হয়েছে
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {customers.map((c) => (
            <DueRow
              key={c._id}
              customer={c}
              branchLabel={showBranchFilter ? branchName(c.registeredBranch) : undefined}
              branchId={forceBranchId || branchFilter || assignedBranches[0] || ''}
              onCollected={() => handleCollected(c._id)}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DueRow({
  customer,
  branchLabel,
  branchId,
  onCollected,
  t,
}: {
  customer: Customer
  branchLabel?: string
  branchId: string
  onCollected: () => void
  t: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  // Local due — starts from the customer prop, drops after each partial collection so the row
  // can stay on the list showing the reduced balance instead of vanishing.
  const [due, setDue] = useState(customer.khata.currentDue)
  const [amount, setAmount] = useState(String(customer.khata.currentDue))
  const [submitting, setSubmitting] = useState(false)
  const [statement, setStatement] = useState<StatementRow[] | null>(null)
  const [loadingStmt, setLoadingStmt] = useState(false)

  const remaining = Math.max(0, due - Number(amount))
  const isFull = Number(amount) >= due

  // Fetch the dated khata statement the first time the row is expanded.
  useEffect(() => {
    if (!open || statement !== null) return
    let alive = true
    setLoadingStmt(true)
    fetch(`/api/customers/${customer._id}?statement=1`)
      .then((r) => r.json())
      .then((d) => { if (alive) setStatement(Array.isArray(d.statement) ? d.statement : []) })
      .catch(() => { if (alive) setStatement([]) })
      .finally(() => { if (alive) setLoadingStmt(false) })
    return () => { alive = false }
  }, [open, statement, customer._id])

  async function handleCollect() {
    const amt = Number(amount)
    if (!amt || amt <= 0) { toast.error('সঠিক পরিমাণ দিন'); return }
    if (!branchId) { toast.error('শাখা নির্ধারণ হয়নি'); return }

    setSubmitting(true)
    const res = await fetch(`/api/customers/${customer._id}?action=collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId, amountCollected: amt }),
    })
    setSubmitting(false)

    if (res.ok) {
      if (isFull) {
        toast.success(`${customer.name}: বাকি শেষ হয়েছে ✓`)
        onCollected()
      } else {
        // Partial — keep the row, drop the balance, refetch the statement to show the collection.
        toast.success(`${customer.name}: ${formatCurrency(amt)} আদায়, ${formatCurrency(remaining)} বাকি আছে`)
        setDue(remaining)
        setAmount(String(remaining))
        setStatement(null)
      }
    } else {
      const err = await res.json()
      toast.error(err.error ?? 'আদায় হয়নি')
    }
  }

  return (
    <div className={`overflow-hidden transition-all ${t.card} ${open ? `ring-2 ${t.ring}` : ''}`}>
      {/* Main row — always visible */}
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-base font-black ${t.nameText}`}>{customer.name}</span>
            {branchLabel && (
              <span className={`text-sm px-2 py-0.5 rounded-lg ${t.branchBadge}`}>{branchLabel}</span>
            )}
          </div>
          {customer.phone && (
            <div className={`flex items-center gap-1 text-sm mt-0.5 ${t.phoneText}`}>
              <Phone className={`w-3.5 h-3.5 ${t.phoneIcon}`} />
              {customer.phone}
            </div>
          )}
        </div>

        <span className="text-lg font-black text-red-500 flex-shrink-0">
          {formatCurrency(due)}
        </span>

        <button
          onClick={() => setOpen((o) => !o)}
          className={`flex-shrink-0 px-4 py-2 text-base font-bold rounded-xl transition-colors ${
            open ? t.toggleClosed : 'bg-green-500 text-white hover:bg-green-600 shadow-sm'
          }`}
        >
          {open ? 'বন্ধ করুন' : 'আদায়'}
        </button>
      </div>

      {/* Inline collect form — no modal */}
      {open && (
        <div className={`px-4 pb-4 pt-3 space-y-3 ${t.formWrap}`}>
          {/* Dated khata statement */}
          <div>
            <p className={`text-sm font-bold mb-1.5 ${t.label}`}>বাকির বিবরণ (তারিখ অনুযায়ী)</p>
            {loadingStmt ? (
              <p className={`text-sm py-2 ${t.loadingText}`}>হিসাব লোড হচ্ছে...</p>
            ) : !statement || statement.length === 0 ? (
              <p className={`text-sm py-2 ${t.emptySub}`}>বিস্তারিত হিসাব নেই</p>
            ) : (
              <div className="space-y-1">
                {(() => {
                  let bal = 0
                  return statement.map((row) => {
                    const isCollection = row.transactionType === 'Due Collection'
                    bal += isCollection ? -row.cashPaid : row.addedToKhata
                    const date = new Date(row.createdAt).toLocaleDateString('bn-BD', {
                      day: '2-digit', month: '2-digit', year: '2-digit',
                    })
                    const itemText = row.items.length > 0
                      ? row.items.map((it) => `${it.variantId} ×${it.quantity}`).join(', ')
                      : (isCollection ? 'টাকা আদায়' : (row.notes || '—'))
                    return (
                      <div key={row._id} className="flex items-center gap-2 text-sm bg-white/60 rounded-lg px-3 py-2">
                        <span className={`w-14 shrink-0 font-bold ${t.phoneText}`}>{date}</span>
                        <span className={`flex-1 min-w-0 truncate ${t.nameText}`}>{itemText}</span>
                        <span className={`shrink-0 font-black ${isCollection ? 'text-green-600' : 'text-red-500'}`}>
                          {isCollection ? '−' : '+'}{formatCurrency(isCollection ? row.cashPaid : row.addedToKhata)}
                        </span>
                        <span className={`w-20 text-right shrink-0 text-xs font-bold ${t.phoneText}`}>
                          বাকি {formatCurrency(Math.max(0, bal))}
                        </span>
                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={`text-sm font-bold block mb-1.5 ${t.label}`}>
                কত টাকা নিলেন? (৳)
              </label>
              <input
                type="number"
                className={`w-full border-2 rounded-xl px-4 py-3 text-xl font-black focus:outline-none ${t.amountInput}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={1}
                max={due}
                autoFocus
              />
            </div>
            <button
              onClick={handleCollect}
              disabled={submitting}
              className="px-5 py-3 bg-green-500 hover:bg-green-600 text-white font-black text-base rounded-xl transition-colors disabled:opacity-40 shadow-sm"
            >
              {submitting ? '...' : 'নিশ্চিত ✓'}
            </button>
          </div>

          {Number(amount) > 0 && Number(amount) < due && (
            <p className={`text-base font-bold rounded-xl px-4 py-2.5 border ${t.partialMsg}`}>
              আংশিক — {formatCurrency(remaining)} এখনো বাকি থাকবে
            </p>
          )}
          {Number(amount) >= due && Number(amount) > 0 && (
            <p className={`text-base font-bold rounded-xl px-4 py-2.5 border ${t.fullMsg}`}>
              ✓ সম্পূর্ণ — বাকি শেষ হয়ে যাবে
            </p>
          )}
        </div>
      )}
    </div>
  )
}
