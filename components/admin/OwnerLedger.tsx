'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, Wallet, Package, ArrowDownCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Role } from '@/types'

interface Branch { _id: string; name: string }

type OwnerRef = { _id: string; name: string } | null
type BranchRef = { _id: string; name: string } | null
type ProductRef = { _id: string; name: string; unitType: string } | null

interface WithdrawalRecord {
  _id: string
  branchId: BranchRef
  ownerId: OwnerRef
  financials: { totalBill: number }
  notes?: string
  createdAt: string
}

interface PurchaseItem {
  productId: ProductRef
  variantId: string
  quantity: number
  rateApplied: number
}

interface PurchaseRecord {
  _id: string
  branchId: BranchRef
  ownerId: OwnerRef
  items: PurchaseItem[]
  financials: { totalBill: number }
  createdAt: string
}

// Always shown in Bangladesh time, consistent with the rest of the admin panel.
function bdDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'Asia/Dhaka', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

interface Props {
  role: Role
  branches: Branch[]
  assignedBranches: string[]
}

export default function OwnerLedger({ role, branches, assignedBranches }: Props) {
  const [branchFilter, setBranchFilter] = useState('')
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([])
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const showBranchFilter = role === 'SUPER_ADMIN'

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (branchFilter) params.set('branchId', branchFilter)

    Promise.all([
      fetch(`/api/withdrawals?${params}`).then((r) => r.json()),
      fetch(`/api/owner-purchases?${params}`).then((r) => r.json()),
    ])
      .then(([w, p]) => {
        setWithdrawals(Array.isArray(w) ? w : [])
        setPurchases(Array.isArray(p) ? p : [])
      })
      .catch(() => toast.error('Failed to load data'))
      .finally(() => setLoading(false))
  }, [branchFilter])

  useEffect(() => { load() }, [load])

  async function handleWithdraw() {
    const amt = Number(amount)
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }

    setSubmitting(true)
    const res = await fetch('/api/withdrawals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amt, notes: notes.trim() || undefined }),
    })
    setSubmitting(false)

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Withdrawal failed')
      return
    }

    toast.success(`${formatCurrency(amt)} withdrawn`)
    setAmount('')
    setNotes('')
    load()
  }

  const totalWithdrawn = withdrawals.reduce((s, w) => s + w.financials.totalBill, 0)
  const totalOwnerPurchases = purchases.reduce((s, p) => s + p.financials.totalBill, 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100">Owner Ledger</h1>
          <p className="text-sm text-slate-400">
            Cash withdrawn and stock funded by branch admins — money that never touched the store's own cash for a purchase, or cash taken out of the till
          </p>
        </div>
        <div className="flex items-center gap-3">
          {showBranchFilter && branches.length > 1 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Withdraw form — BRANCH_ADMIN only, always their own branch */}
      {role === 'BRANCH_ADMIN' && (
        <section className="rounded-xl border border-purple-800/40 bg-purple-950/20 p-4">
          <p className="text-sm font-bold text-purple-300 mb-3 flex items-center gap-2">
            <ArrowDownCircle className="w-4 h-4" />
            Withdraw Cash From Drawer
          </p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Amount (৳)</label>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 w-32 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-slate-400 block mb-1">Reason (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. personal expense"
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <button
              onClick={handleWithdraw}
              disabled={submitting}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-40"
            >
              {submitting ? 'Withdrawing…' : 'Withdraw'}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            This reduces today's expected drawer cash immediately. If today is already closed, it will reduce tomorrow's opening cash instead.
          </p>
        </section>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading…</div>
      ) : (
        <>
          {/* Withdrawals */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Cash Withdrawals</p>
              {totalWithdrawn > 0 && (
                <span className="bg-purple-900/40 border border-purple-800/40 text-purple-300 text-xs font-bold px-2 py-0.5 rounded-full">
                  Total {formatCurrency(totalWithdrawn)}
                </span>
              )}
            </div>
            {withdrawals.length === 0 ? (
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 flex items-center gap-2 text-slate-500 text-sm">
                <Wallet className="w-4 h-4" />
                No withdrawals recorded
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 bg-slate-800/60">
                        <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">When</th>
                        {showBranchFilter && <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Branch</th>}
                        <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Admin</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Reason</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawals.map((w) => (
                        <tr key={w._id} className="border-b border-slate-800 hover:bg-slate-800/30">
                          <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{bdDateTime(w.createdAt)}</td>
                          {showBranchFilter && <td className="px-4 py-3 text-slate-300">{w.branchId?.name ?? '—'}</td>}
                          <td className="px-4 py-3 text-slate-200 font-medium">{w.ownerId?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-400">{w.notes || <span className="text-slate-700 italic">No reason given</span>}</td>
                          <td className="px-4 py-3 text-right text-purple-300 font-black">{formatCurrency(w.financials.totalBill)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Owner-funded purchases */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Owner-Funded Stock Purchases</p>
              {totalOwnerPurchases > 0 && (
                <span className="bg-amber-900/40 border border-amber-800/40 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full">
                  Total {formatCurrency(totalOwnerPurchases)}
                </span>
              )}
            </div>
            {purchases.length === 0 ? (
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 flex items-center gap-2 text-slate-500 text-sm">
                <Package className="w-4 h-4" />
                No owner-funded purchases recorded
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 bg-slate-800/60">
                        <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">When</th>
                        {showBranchFilter && <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Branch</th>}
                        <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Admin</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Product</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">Qty</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map((p) => (
                        <tr key={p._id} className="border-b border-slate-800 hover:bg-slate-800/30">
                          <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{bdDateTime(p.createdAt)}</td>
                          {showBranchFilter && <td className="px-4 py-3 text-slate-300">{p.branchId?.name ?? '—'}</td>}
                          <td className="px-4 py-3 text-slate-200 font-medium">{p.ownerId?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-300">
                            {p.items.map((it, i) => (
                              <div key={i}>{it.productId?.name ?? '—'}</div>
                            ))}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-300">
                            {p.items.map((it, i) => <div key={i}>{it.quantity}</div>)}
                          </td>
                          <td className="px-4 py-3 text-right text-amber-400 font-black">{formatCurrency(p.financials.totalBill)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
