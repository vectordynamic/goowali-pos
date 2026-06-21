'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Wallet, RefreshCw, Search, Phone } from 'lucide-react'
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
  const showBranchFilter = role === 'SUPER_ADMIN' && !forceBranchId

  function handleCollected(customerId: string) {
    setCustomers((prev) => prev.filter((c) => c._id !== customerId))
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
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {tab === 'Paikari' ? 'পাইকারি' : 'খুচরা'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 bg-white border border-gray-200 rounded-2xl p-3 shadow-sm">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            className="linput pl-12"
            placeholder="নাম বা ফোন খুঁজুন..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {showBranchFilter && branches.length > 1 && (
          <select
            className="linput w-48"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="">সব শাখা</option>
            {branches.map((b) => (
              <option key={b._id} value={b._id}>{b.name}</option>
            ))}
          </select>
        )}

        <button onClick={load} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors">
          <RefreshCw className="w-5 h-5" />
        </button>

        {customers.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <Wallet className="w-5 h-5 text-red-500" />
            <span className="text-lg font-black text-red-500">{formatCurrency(totalDue)}</span>
            <span className="text-gray-500 font-bold">মোট বাকি</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12 text-lg">লোড হচ্ছে...</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16 lcard">
          <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-lg font-bold text-gray-600">কোনো বাকি নেই</p>
          <p className="text-gray-400 mt-1">
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
}: {
  customer: Customer
  branchLabel?: string
  branchId: string
  onCollected: () => void
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(customer.khata.currentDue))
  const [submitting, setSubmitting] = useState(false)

  const remaining = Math.max(0, customer.khata.currentDue - Number(amount))
  const isFull = Number(amount) >= customer.khata.currentDue

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
      toast.success(
        isFull
          ? `${customer.name}: বাকি শেষ হয়েছে ✓`
          : `${customer.name}: ${formatCurrency(amt)} আদায়, ${formatCurrency(remaining)} বাকি আছে`
      )
      onCollected()
    } else {
      const err = await res.json()
      toast.error(err.error ?? 'আদায় হয়নি')
    }
  }

  return (
    <div className={`lcard overflow-hidden transition-all ${open ? 'ring-2 ring-blue-200' : ''}`}>
      {/* Main row — always visible */}
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-black text-gray-800">{customer.name}</span>
            {branchLabel && (
              <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg">{branchLabel}</span>
            )}
          </div>
          {customer.phone && (
            <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
              <Phone className="w-3.5 h-3.5" />
              {customer.phone}
            </div>
          )}
        </div>

        <span className="text-lg font-black text-red-500 flex-shrink-0">
          {formatCurrency(customer.khata.currentDue)}
        </span>

        <button
          onClick={() => setOpen((o) => !o)}
          className={`flex-shrink-0 px-4 py-2 text-base font-bold rounded-xl transition-colors ${
            open
              ? 'bg-gray-200 text-gray-600'
              : 'bg-green-500 text-white hover:bg-green-600 shadow-sm'
          }`}
        >
          {open ? 'বন্ধ করুন' : 'আদায়'}
        </button>
      </div>

      {/* Inline collect form — no modal */}
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50 space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-sm font-bold text-gray-600 block mb-1.5">
                কত টাকা নিলেন? (৳)
              </label>
              <input
                type="number"
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-xl font-black text-gray-800 bg-white focus:outline-none focus:border-blue-400"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={1}
                max={customer.khata.currentDue}
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

          {Number(amount) > 0 && Number(amount) < customer.khata.currentDue && (
            <p className="text-base font-bold text-amber-600 bg-amber-50 rounded-xl px-4 py-2.5 border border-amber-200">
              আংশিক — {formatCurrency(remaining)} এখনো বাকি থাকবে
            </p>
          )}
          {Number(amount) >= customer.khata.currentDue && Number(amount) > 0 && (
            <p className="text-base font-bold text-green-600 bg-green-50 rounded-xl px-4 py-2.5 border border-green-200">
              ✓ সম্পূর্ণ — বাকি শেষ হয়ে যাবে
            </p>
          )}
        </div>
      )}
    </div>
  )
}
