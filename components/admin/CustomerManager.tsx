'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  Plus, Pencil, X, Users, RefreshCw, Search, Phone, MapPin, Wallet,
  CheckCircle, XCircle, Truck, Clock
} from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { formatCurrency } from '@/lib/utils'

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

type DispatchResult = 'paid' | 'partial' | 'due' | 'skipped'

interface PaikariConfirmItem {
  _id: string
  name: string
  dailyLitres: number
  result?: DispatchResult
  cashPaid?: number
}

type TabOption = 'All' | 'Retail' | 'Paikari'

interface Props {
  role: 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'MANAGER'
  assignedBranches: string[]
  /** When set, this page is locked to a single branch (POS customer view) */
  forceBranchId?: string
}

export default function CustomerManager({ role, assignedBranches, forceBranchId }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<TabOption>(role === 'MANAGER' ? 'Retail' : 'All')
  const [modal, setModal] = useState<null | 'create' | Customer>(null)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)

  // Dispatch panel state (MANAGER + Paikari tab only)
  const [paikariItems, setPaikariItems] = useState<PaikariConfirmItem[]>([])
  const [paikariLoading, setPaikariLoading] = useState(false)
  const [dispatchingId, setDispatchingId] = useState<string | null>(null)

  const branchScope = forceBranchId ?? ''
  const isManagerPaikariView = role === 'MANAGER' && activeTab === 'Paikari'

  const typeFilter = activeTab === 'All' ? '' : activeTab

  // Tabs available per role
  const tabs: TabOption[] = role === 'MANAGER' ? ['Retail', 'Paikari'] : ['All', 'Retail', 'Paikari']

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (typeFilter) params.set('type', typeFilter)
    if (branchScope) params.set('branchId', branchScope)

    const [custRes, branchRes] = await Promise.all([
      fetch(`/api/customers?${params}`),
      role !== 'MANAGER' ? fetch('/api/branches') : Promise.resolve(null)
    ])

    const custData = await custRes.json()
    setCustomers(Array.isArray(custData) ? custData : [])

    if (branchRes) {
      const branchData = await branchRes.json()
      setBranches(Array.isArray(branchData) ? branchData : [])
    }

    setLoading(false)
  }, [search, typeFilter, branchScope, role])

  const loadPaikariConfirm = useCallback(async () => {
    setPaikariLoading(true)
    const params = new URLSearchParams({ confirm: '1' })
    if (branchScope) params.set('branchId', branchScope)

    const res = await fetch(`/api/customers?${params}`)
    const data = await res.json()
    setPaikariItems(
      (Array.isArray(data) ? data : []).map((item: PaikariConfirmItem) => ({
        ...item,
        result: undefined
      }))
    )
    setPaikariLoading(false)
  }, [branchScope])

  useEffect(() => {
    if (isManagerPaikariView) {
      loadPaikariConfirm()
    } else {
      loadCustomers()
    }
  }, [isManagerPaikariView, loadCustomers, loadPaikariConfirm])

  const branchName = (id?: string) =>
    branches.find((b) => b._id === id)?.name ?? id?.slice(-6) ?? '—'

  // paymentMode: 'paid' | 'partial' | 'due' | null (null = not today)
  async function handleAutoDispatch(item: PaikariConfirmItem, paymentMode: 'paid' | 'partial' | 'due' | null, cashPaidAmount?: number) {
    if (paymentMode === null) {
      setPaikariItems((prev) =>
        prev.map((p) => p._id === item._id ? { ...p, result: 'skipped' } : p)
      )
      toast.success(`${item.name}: marked as not dispatched today`)
      return
    }

    const effectiveBranch = branchScope || assignedBranches[0]
    if (!effectiveBranch) {
      toast.error('No branch assigned')
      return
    }

    setDispatchingId(item._id)
    const res = await fetch(`/api/customers/${item._id}?action=auto-dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId: effectiveBranch,
        paymentMode,
        cashPaid: cashPaidAmount
      })
    })
    setDispatchingId(null)

    if (res.ok) {
      setPaikariItems((prev) =>
        prev.map((p) => p._id === item._id ? { ...p, result: paymentMode, cashPaid: cashPaidAmount } : p)
      )
      const msg =
        paymentMode === 'paid' ? 'confirmed & fully paid' :
        paymentMode === 'partial' ? `confirmed — partial (৳${cashPaidAmount} paid, rest to due)` :
        'confirmed — full amount added to due'
      toast.success(`${item.name}: ${msg}`)
    } else {
      const err = await res.json()
      toast.error(err.error ?? 'Dispatch failed')
    }
  }

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

  return (
    <div>
      {/* Type filter tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-800">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab === 'All' ? 'All Customers' : tab === 'Retail' ? 'Retail' : 'Paikari / Wholesale'}
          </button>
        ))}
      </div>

      {/* Manager Paikari tab: dispatch confirmation panel */}
      {isManagerPaikariView ? (
        <PaikariDispatchPanel
          items={paikariItems}
          loading={paikariLoading}
          dispatchingId={dispatchingId}
          onRefresh={loadPaikariConfirm}
          onDispatch={(item, mode, cashPaid) => handleAutoDispatch(item, mode, cashPaid)}
        />
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                className="input-base pl-9"
                placeholder="Search name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <button
              onClick={loadCustomers}
              className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
              title="Refresh"
            >
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
            <div className="text-center text-slate-500 py-12 text-sm">Loading customers…</div>
          ) : customers.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No customers yet</p>
              <p className="text-slate-600 text-sm mt-1">Add your first customer to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Name</th>
                    <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Phone</th>
                    <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Type</th>
                    {showBranchCol && (
                      <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Branch</th>
                    )}
                    <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Due</th>
                    <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c._id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                      <td className="py-2.5 px-3">
                        <span className="text-slate-200 font-medium">{c.name}</span>
                        {c.location && (
                          <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                            <MapPin className="w-3 h-3" />
                            {c.location}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Phone className="w-3 h-3 text-slate-500" />
                          {c.phone}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          c.customerType === 'Paikari'
                            ? 'bg-amber-900/30 text-amber-400'
                            : 'bg-blue-900/30 text-blue-400'
                        }`}>
                          {c.customerType}
                        </span>
                      </td>
                      {showBranchCol && (
                        <td className="py-2.5 px-3 text-slate-400 text-xs">
                          {branchName(c.registeredBranch)}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-right">
                        {c.khata.currentDue > 0 ? (
                          <span className="text-rose-400 font-medium flex items-center justify-end gap-1">
                            <Wallet className="w-3 h-3" />
                            {formatCurrency(c.khata.currentDue)}
                          </span>
                        ) : (
                          <span className="text-emerald-500 text-xs">Clear</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setModal(c)}
                            className="p-1.5 text-slate-500 hover:text-slate-100 hover:bg-slate-700 rounded transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(c)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-900/20 rounded transition-colors"
                            title="Remove"
                          >
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
        </>
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

// Dispatch confirmation panel — MANAGER only, Paikari tab.
// Shows customer name + daily quantity. Manager confirms dispatch status.
// Customer details (location, phone, khata) are intentionally hidden.
function PaikariDispatchPanel({
  items,
  loading,
  dispatchingId,
  onRefresh,
  onDispatch
}: {
  items: PaikariConfirmItem[]
  loading: boolean
  dispatchingId: string | null
  onRefresh: () => void
  onDispatch: (item: PaikariConfirmItem, mode: 'paid' | 'partial' | 'due' | null, cashPaid?: number) => void
}) {
  const [partialTarget, setPartialTarget] = useState<PaikariConfirmItem | null>(null)
  const [partialAmount, setPartialAmount] = useState('')

  if (loading) {
    return <div className="text-center text-slate-500 py-12 text-sm">Loading dispatch list…</div>
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <Truck className="w-10 h-10 text-slate-700 mx-auto mb-3" />
        <p className="text-slate-400 font-medium">No Paikari customers</p>
        <p className="text-slate-600 text-sm mt-1">No wholesale customers are configured for this branch</p>
      </div>
    )
  }

  const pending = items.filter((i) => !i.result).length
  const dispatched = items.filter((i) => i.result && i.result !== 'skipped').length
  const skipped = items.filter((i) => i.result === 'skipped').length

  return (
    <div>
      {/* Summary strip */}
      <div className="flex items-center gap-4 mb-4 p-3 rounded-lg bg-slate-800/40 border border-slate-800">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-slate-500" />
          <span className="text-slate-400">{pending} pending</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          <span className="text-emerald-400">{dispatched} dispatched</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <XCircle className="w-4 h-4 text-slate-500" />
          <span className="text-slate-400">{skipped} not today</span>
        </div>
        <button
          onClick={onRefresh}
          className="ml-auto p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="text-xs text-slate-600 mb-3 px-1">
        Today&apos;s dispatch — confirm each customer&apos;s status
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const busy = dispatchingId === item._id
          const done = !!item.result

          return (
            <div
              key={item._id}
              className={`p-3 rounded-lg border transition-colors ${
                done
                  ? 'bg-slate-800/20 border-slate-800/50 opacity-70'
                  : 'bg-slate-800/40 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">{item.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Daily: {item.dailyLitres}L</p>
                </div>

                {done ? (
                  <DispatchResultBadge result={item.result!} cashPaid={item.cashPaid} />
                ) : (
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <button
                      onClick={() => onDispatch(item, 'paid')}
                      disabled={busy}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-600/30 transition-colors disabled:opacity-50"
                    >
                      {busy ? '…' : 'Paid'}
                    </button>
                    <button
                      onClick={() => { setPartialTarget(item); setPartialAmount('') }}
                      disabled={busy}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-600/30 transition-colors disabled:opacity-50"
                    >
                      Partial
                    </button>
                    <button
                      onClick={() => onDispatch(item, 'due')}
                      disabled={busy}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 border border-amber-600/30 transition-colors disabled:opacity-50"
                    >
                      Due
                    </button>
                    <button
                      onClick={() => onDispatch(item, null)}
                      disabled={busy}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-700/50 text-slate-500 hover:bg-slate-700 border border-slate-700 transition-colors disabled:opacity-50"
                    >
                      Not Today
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Partial payment mini-modal */}
      {partialTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-xs">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">Partial Payment</h3>
              <button onClick={() => setPartialTarget(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-slate-300">{partialTarget.name}</p>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Cash received ৳</label>
                <input
                  type="number"
                  className="input-base"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  min={1}
                  placeholder="0"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPartialTarget(null)}
                  className="btn-secondary flex-1 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const amt = Number(partialAmount)
                    if (!amt || amt <= 0) return
                    onDispatch(partialTarget, 'partial', amt)
                    setPartialTarget(null)
                  }}
                  disabled={!partialAmount || Number(partialAmount) <= 0}
                  className="btn-primary flex-1 text-sm"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DispatchResultBadge({ result, cashPaid }: { result: DispatchResult; cashPaid?: number }) {
  if (result === 'paid') {
    return (
      <div className="flex items-center gap-1.5 text-sm text-emerald-400">
        <CheckCircle className="w-4 h-4" />
        Paid
      </div>
    )
  }
  if (result === 'partial') {
    return (
      <div className="flex items-center gap-1.5 text-sm text-blue-400">
        <Wallet className="w-4 h-4" />
        Partial {cashPaid ? `(৳${cashPaid})` : ''}
      </div>
    )
  }
  if (result === 'due') {
    return (
      <div className="flex items-center gap-1.5 text-sm text-amber-400">
        <Wallet className="w-4 h-4" />
        Added to Due
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 text-sm text-slate-500">
      <XCircle className="w-4 h-4" />
      Not Today
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

  const autoSelectedBranch = forceBranchId ?? (visibleBranches.length === 1 ? visibleBranches[0]._id : '')

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

    if (!registeredBranch) {
      toast.error('Please select a branch')
      return
    }

    setSubmitting(true)
    const payload = { name, phone, location, customerType, registeredBranch }

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

          {needsBranchSelector && (
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
              disabled={submitting || !!phoneError || (!registeredBranch && needsBranchSelector)}
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
