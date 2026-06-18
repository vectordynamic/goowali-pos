'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  Wallet, RefreshCw, Search, Phone, MapPin, X, ChevronDown, ChevronRight
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Role } from '@/types'

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

interface Props {
  role: Role
  assignedBranches: string[]
  /** Pins view to a single branch (POS context) */
  forceBranchId?: string
}

type DueTab = 'Retail' | 'Paikari'

export default function DuePage({ role, assignedBranches, forceBranchId }: Props) {
  const [activeTab, setActiveTab] = useState<DueTab>('Retail')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState(forceBranchId ?? '')
  const [loading, setLoading] = useState(true)
  const [collectTarget, setCollectTarget] = useState<Customer | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ due: '1', type: activeTab })
    if (search) params.set('search', search)
    if (branchFilter) params.set('branchId', branchFilter)

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
  }, [activeTab, search, branchFilter, role])

  useEffect(() => { load() }, [load])

  const branchName = (id?: string) =>
    branches.find((b) => b._id === id)?.name ?? id?.slice(-6) ?? '—'

  const totalDue = customers.reduce((s, c) => s + c.khata.currentDue, 0)
  const showBranchFilter = role !== 'MANAGER' && !forceBranchId

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-800">
        {(['Retail', 'Paikari'] as DueTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab === 'Paikari' ? 'Paikari / Wholesale' : 'Retail'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            className="input-base pl-9"
            placeholder="Search name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {showBranchFilter && branches.length > 1 && (
          <select
            className="input-base w-44"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b._id} value={b._id}>{b.name}</option>
            ))}
          </select>
        )}

        <button
          onClick={load}
          className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {customers.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5 text-sm">
            <Wallet className="w-4 h-4 text-rose-400" />
            <span className="text-rose-400 font-semibold">{formatCurrency(totalDue)}</span>
            <span className="text-slate-500">total due</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12 text-sm">Loading due list…</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16">
          <Wallet className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No outstanding dues</p>
          <p className="text-slate-600 text-sm mt-1">All {activeTab.toLowerCase()} customers are clear</p>
        </div>
      ) : (
        <div className="space-y-1">
          {customers.map((c) => (
            <DueRow
              key={c._id}
              customer={c}
              branchLabel={showBranchFilter ? branchName(c.registeredBranch) : undefined}
              onCollect={() => setCollectTarget(c)}
            />
          ))}
        </div>
      )}

      {collectTarget && (
        <CollectModal
          customer={collectTarget}
          branchId={forceBranchId || branchFilter || assignedBranches[0] || ''}
          onClose={() => setCollectTarget(null)}
          onSuccess={() => {
            setCollectTarget(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function DueRow({
  customer,
  branchLabel,
  onCollect
}: {
  customer: Customer
  branchLabel?: string
  onCollect: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-100">{customer.name}</span>
            {branchLabel && (
              <span className="text-xs text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">
                {branchLabel}
              </span>
            )}
          </div>
          {customer.phone && (
            <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
              <Phone className="w-3 h-3" />
              {customer.phone}
              {customer.location && (
                <>
                  <span className="mx-1">·</span>
                  <MapPin className="w-3 h-3" />
                  {customer.location}
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-rose-400 font-semibold">
            {formatCurrency(customer.khata.currentDue)}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onCollect() }}
            className="px-3 py-1.5 text-xs font-medium bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 rounded-md hover:bg-emerald-600/30 transition-colors"
          >
            Collect
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-slate-800/50 bg-slate-900/20">
          <p className="text-xs text-slate-500 mb-1">Customer Details</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-600">Type:</span>{' '}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                customer.customerType === 'Paikari'
                  ? 'bg-amber-900/30 text-amber-400'
                  : 'bg-blue-900/30 text-blue-400'
              }`}>{customer.customerType}</span>
            </div>
            <div>
              <span className="text-slate-600">Credit limit:</span>{' '}
              <span className="text-slate-300">{formatCurrency(customer.khata.creditLimit)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CollectModal({
  customer,
  branchId,
  onClose,
  onSuccess
}: {
  customer: Customer
  branchId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState(customer.khata.currentDue)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const remaining = Math.max(0, customer.khata.currentDue - amount)
  const isFullPayment = amount >= customer.khata.currentDue

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    if (!branchId) {
      toast.error('Branch not identified')
      return
    }

    setSubmitting(true)
    const res = await fetch(`/api/customers/${customer._id}?action=collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId, amountCollected: amount, notes: notes || undefined })
    })
    setSubmitting(false)

    if (res.ok) {
      toast.success(
        isFullPayment
          ? `${customer.name}: due cleared`
          : `${customer.name}: ${formatCurrency(amount)} collected, ${formatCurrency(remaining)} remaining`
      )
      onSuccess()
    } else {
      const err = await res.json()
      toast.error(err.error ?? 'Collection failed')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">Collect Payment</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <p className="text-sm text-slate-200 font-medium">{customer.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{customer.phone}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-500">Current Due</span>
              <span className="text-rose-400 font-bold">{formatCurrency(customer.khata.currentDue)}</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Amount Received ৳ *</label>
            <input
              type="number"
              className="input-base text-lg font-bold"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              min={1}
              max={customer.khata.currentDue}
              required
              autoFocus
            />
          </div>

          {amount > 0 && amount < customer.khata.currentDue && (
            <p className="text-xs text-amber-400 bg-amber-900/20 rounded-lg px-3 py-2 border border-amber-800/30">
              Partial payment — {formatCurrency(remaining)} will remain as due
            </p>
          )}
          {amount >= customer.khata.currentDue && (
            <p className="text-xs text-emerald-400 bg-emerald-900/20 rounded-lg px-3 py-2 border border-emerald-800/30">
              Full payment — due will be cleared
            </p>
          )}

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Notes (optional)</label>
            <input
              className="input-base"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Cash collected on visit"
            />
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">
              {submitting ? 'Processing…' : 'Confirm Collection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
