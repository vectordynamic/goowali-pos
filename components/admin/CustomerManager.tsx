'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import {
  Plus, Pencil, X, Users, RefreshCw, Search, Phone, MapPin, Wallet
} from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { formatCurrency } from '@/lib/utils'
import { useBranches } from '@/lib/queries/useBranches'

interface Branch {
  _id: string
  name: string
}

interface Customer {
  _id: string
  name: string
  phone: string
  location?: string
  customerType: 'Retail' | 'Paikari'
  registeredBranch?: string
  khata: { currentDue: number; creditLimit: number; lastPaymentDate?: string }
  createdAt: string
}

type TabOption = 'All' | 'Retail' | 'Paikari'

interface Props {
  role: 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'MANAGER'
  assignedBranches: string[]
  forceBranchId?: string
  lightMode?: boolean
}

export default function CustomerManager({ role, assignedBranches, forceBranchId, lightMode }: Props) {
  return <AdminCustomerView role={role} assignedBranches={assignedBranches} forceBranchId={forceBranchId} lightMode={lightMode} />
}

// Full customer management view for SUPER_ADMIN and BRANCH_ADMIN
function AdminCustomerView({ role, assignedBranches, forceBranchId, lightMode }: Props) {
  // Shared cache — was previously re-fetched on every debounced search keystroke and every
  // tab-filter change since it lived inside the same loadCustomers() call; branches don't
  // depend on either, so pulling it out here is a real fix, not just a dedup with other pages.
  const { data: branchesData } = useBranches(role !== 'MANAGER')
  const branches: Branch[] = branchesData ?? []

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeTab, setActiveTab] = useState<TabOption>('All')
  const [modal, setModal] = useState<null | 'create' | Customer>(null)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const branchScope = forceBranchId ?? ''
  const typeFilter = activeTab === 'All' ? '' : activeTab
  // Manager sees flat list of their own customers — no type tabs needed
  const tabs: TabOption[] = role === 'MANAGER' ? [] : ['All', 'Retail', 'Paikari']

  // Debounce the search box — avoid firing a request on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const loadCustomers = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (typeFilter && role !== 'MANAGER') params.set('type', typeFilter)
    if (branchScope) params.set('branchId', branchScope)

    try {
      const custRes = await fetch(`/api/customers?${params}`, { signal: controller.signal })
      const custData = await custRes.json()
      setCustomers(Array.isArray(custData) ? custData : [])
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      toast.error('Failed to load customers')
    } finally {
      if (abortRef.current === controller) setLoading(false)
    }
  }, [debouncedSearch, typeFilter, branchScope, role])

  useEffect(() => {
    loadCustomers()
    return () => abortRef.current?.abort()
  }, [loadCustomers])

  const branchName = (id?: string) =>
    branches.find((b) => b._id === id)?.name ?? id?.slice(-6) ?? '—'

  async function handleDelete(customer: Customer) {
    const loadingToast = toast.loading(`Removing ${customer.name}…`)
    const res = await fetch(`/api/customers/${customer._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false })
    })
    toast.dismiss(loadingToast)
    if (res.ok) {
      toast.success(`${customer.name} removed`)
      setDeleteTarget(null)
      loadCustomers()
    } else {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to remove customer')
    }
  }

  const showBranchCol = role === 'SUPER_ADMIN' && !forceBranchId

  const t = lightMode
    ? {
        tabBorder: 'border-b border-gray-200',
        tabActive: 'border-blue-500 text-blue-600',
        tabInactive: 'border-transparent text-gray-500 hover:text-gray-700',
        searchIcon: 'text-gray-400',
        searchInput: 'border-2 border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-blue-400 w-full pl-9',
        refreshBtn: 'p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors',
        emptyIcon: 'text-gray-300',
        emptyTitle: 'text-gray-600',
        emptySub: 'text-gray-400',
        loadingText: 'text-gray-400',
        theadBorder: 'border-b border-gray-200',
        thText: 'text-xs text-gray-500 font-semibold',
        rowBorder: 'border-b border-gray-100 hover:bg-gray-50 transition-colors',
        nameText: 'text-gray-800 font-semibold',
        subText: 'text-gray-400',
        phoneText: 'text-gray-700',
        phoneIcon: 'text-gray-400',
        typeBadgeRetail: 'bg-blue-100 text-blue-700',
        typeBadgePaikari: 'bg-amber-100 text-amber-700',
        branchText: 'text-gray-500 text-xs',
        actionBtn: 'p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors',
        deleteBtn: 'p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors',
      }
    : {
        tabBorder: 'border-b border-slate-800',
        tabActive: 'border-blue-500 text-blue-400',
        tabInactive: 'border-transparent text-slate-500 hover:text-slate-300',
        searchIcon: 'text-slate-500',
        searchInput: 'input-base pl-9',
        refreshBtn: 'p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors',
        emptyIcon: 'text-slate-700',
        emptyTitle: 'text-slate-400',
        emptySub: 'text-slate-600',
        loadingText: 'text-slate-500',
        theadBorder: 'border-b border-slate-800',
        thText: 'text-xs text-slate-500 font-medium',
        rowBorder: 'border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors',
        nameText: 'text-slate-200 font-medium',
        subText: 'text-slate-500',
        phoneText: 'text-slate-300',
        phoneIcon: 'text-slate-500',
        typeBadgeRetail: 'bg-blue-900/30 text-blue-400',
        typeBadgePaikari: 'bg-amber-900/30 text-amber-400',
        branchText: 'text-slate-400 text-xs',
        actionBtn: 'p-1.5 text-slate-500 hover:text-slate-100 hover:bg-slate-700 rounded transition-colors',
        deleteBtn: 'p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-900/20 rounded transition-colors',
      }

  return (
    <div>
      {/* Type filter tabs — hidden for manager */}
      {tabs.length > 0 && (
        <div className={`flex items-center gap-1 mb-4 ${t.tabBorder}`}>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab ? t.tabActive : t.tabInactive
              }`}
            >
              {tab === 'All' ? 'All Customers' : tab === 'Retail' ? 'Retail' : 'Paikari / Wholesale'}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${t.searchIcon}`} />
          <input
            className={t.searchInput}
            placeholder="Search name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button onClick={loadCustomers} className={t.refreshBtn} title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setModal('create')}
          className="btn-primary flex items-center gap-1.5 ml-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          New Customer
        </button>
      </div>

      {loading ? (
        <div className={`text-center py-12 text-sm ${t.loadingText}`}>Loading customers…</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16">
          <Users className={`w-10 h-10 mx-auto mb-3 ${t.emptyIcon}`} />
          <p className={`font-medium ${t.emptyTitle}`}>No customers yet</p>
          <p className={`text-sm mt-1 ${t.emptySub}`}>
            {role === 'MANAGER'
              ? 'Customers you add will appear here'
              : 'Add your first customer to get started'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={t.theadBorder}>
                <th className={`text-left py-2 px-3 ${t.thText}`}>Name</th>
                <th className={`text-left py-2 px-3 ${t.thText}`}>Phone</th>
                <th className={`text-left py-2 px-3 ${t.thText}`}>Type</th>
                {showBranchCol && (
                  <th className={`text-left py-2 px-3 ${t.thText}`}>Branch</th>
                )}
                <th className={`text-right py-2 px-3 ${t.thText}`}>Due</th>
                <th className={`text-right py-2 px-3 w-20 ${t.thText}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c._id} className={t.rowBorder}>
                  <td className="py-2.5 px-3">
                    <span className={t.nameText}>{c.name}</span>
                    {c.location && (
                      <div className={`flex items-center gap-1 text-xs mt-0.5 ${t.subText}`}>
                        <MapPin className="w-3 h-3" />
                        {c.location}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className={`flex items-center gap-1.5 ${t.phoneText}`}>
                      <Phone className={`w-3 h-3 ${t.phoneIcon}`} />
                      {c.phone}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      c.customerType === 'Paikari' ? t.typeBadgePaikari : t.typeBadgeRetail
                    }`}>
                      {c.customerType}
                    </span>
                  </td>
                  {showBranchCol && (
                    <td className={`py-2.5 px-3 ${t.branchText}`}>
                      {branchName(c.registeredBranch)}
                    </td>
                  )}
                  <td className="py-2.5 px-3 text-right">
                    {c.khata.currentDue > 0 ? (
                      <span className="text-rose-500 font-medium flex items-center justify-end gap-1">
                        <Wallet className="w-3 h-3" />
                        {formatCurrency(c.khata.currentDue)}
                      </span>
                    ) : (
                      <span className="text-emerald-600 text-xs font-semibold">Clear</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setModal(c)} className={t.actionBtn} title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(c)} className={t.deleteBtn} title="Remove">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <CustomerModal
          customer={modal === 'create' ? null : modal}
          branches={branches}
          role={role}
          assignedBranches={assignedBranches}
          forceBranchId={forceBranchId}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); loadCustomers() }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Remove customer?"
          message={`${deleteTarget.name} will be removed from the system.`}
          confirmLabel="Remove"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

function CustomerModal({
  customer,
  branches,
  role,
  assignedBranches,
  forceBranchId,
  onClose,
  onSave
}: {
  customer: Customer | null
  branches: Branch[]
  role: string
  assignedBranches: string[]
  forceBranchId?: string
  onClose: () => void
  onSave: () => void
}) {
  const visibleBranches = role === 'SUPER_ADMIN'
    ? branches
    : branches.filter((b) => assignedBranches.includes(b._id))

  const autoSelectedBranch = forceBranchId ?? (visibleBranches.length === 1 ? visibleBranches[0]?._id ?? '' : '')

  const [name, setName] = useState(customer?.name ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [location, setLocation] = useState(customer?.location ?? '')
  const [customerType, setCustomerType] = useState<'Retail' | 'Paikari'>(customer?.customerType ?? 'Retail')
  const [registeredBranch, setRegisteredBranch] = useState(
    customer?.registeredBranch ?? autoSelectedBranch
  )
  const [phoneError, setPhoneError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const needsBranchSelector = !forceBranchId && visibleBranches.length !== 1

  function validatePhone(value: string) {
    if (value && !/^01[3-9]\d{8}$/.test(value)) {
      setPhoneError('Phone must be 11 digits and start with 013–019')
    } else {
      setPhoneError('')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (phoneError) return

    // Manager: branch comes from their assignment, no selector shown
    const branch = forceBranchId ?? (role === 'MANAGER' ? assignedBranches[0] : registeredBranch)

    if (!branch) {
      toast.error('Please select a branch')
      return
    }

    setSubmitting(true)
    const payload = {
      name,
      phone,
      location,
      customerType: role === 'MANAGER' ? 'Retail' : customerType,
      registeredBranch: branch
    }

    const res = customer
      ? await fetch(`/api/customers/${customer._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      : await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

    setSubmitting(false)

    if (!res.ok) {
      const err = await res.json()
      if (err.errors?.length) {
        toast.error(err.errors[0]?.message ?? 'Validation failed')
      } else {
        toast.error(err.error ?? 'Failed to save customer')
      }
      return
    }

    toast.success(customer ? `${name} updated` : `${name} added`)
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">
            {customer ? 'Edit Customer' : 'New Customer'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Name *</label>
            <input
              className="input-base"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Customer name"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Phone *</label>
            <input
              className={`input-base ${phoneError ? 'border-rose-500' : ''}`}
              value={phone}
              onChange={(e) => { setPhone(e.target.value); validatePhone(e.target.value) }}
              onBlur={() => validatePhone(phone)}
              required
              placeholder="01XXXXXXXXX"
              maxLength={11}
              disabled={!!customer}
            />
            {phoneError && <p className="text-rose-400 text-xs mt-1">{phoneError}</p>}
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Location</label>
            <input
              className="input-base"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Area / address"
            />
          </div>

          {role !== 'MANAGER' ? (
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Type *</label>
              <select
                className="input-base"
                value={customerType}
                onChange={(e) => setCustomerType(e.target.value as 'Retail' | 'Paikari')}
              >
                <option value="Retail">Retail</option>
                <option value="Paikari">Paikari (Wholesale)</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Type</label>
              <div className="input-base text-slate-500 cursor-not-allowed">Retail</div>
            </div>
          )}

          {needsBranchSelector && role !== 'MANAGER' && (
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Branch *</label>
              {visibleBranches.length === 0 ? (
                <p className="text-xs text-rose-400">No branches available. Create a branch first.</p>
              ) : (
                <select
                  className={`input-base ${!registeredBranch ? 'border-rose-500' : ''}`}
                  value={registeredBranch}
                  onChange={(e) => setRegisteredBranch(e.target.value)}
                  required
                >
                  <option value="">Select branch…</option>
                  {visibleBranches.map((b) => (
                    <option key={b._id} value={b._id}>{b.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button
              type="submit"
              disabled={submitting || !!phoneError}
              className="btn-primary flex-1"
            >
              {submitting ? 'Saving…' : customer ? 'Update' : 'Add Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
