'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Lock, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react'
import { formatCurrency, today } from '@/lib/utils'

interface SystemTotals {
  openingCash: number
  cashSales: number
  dueCollections: number
  expensesLogged: number
  expectedDrawerCash: number
}

interface Closing {
  _id: string
  date: string
  status: 'Open' | 'Locked'
  mathematicalSystemTotals: SystemTotals
  managerSubmittedTotals: { physicalCashCounted: number; remainingMilkStock: number }
  discrepancies: { cashShortage: number; stockMismatch: number }
}

export default function ZReport({ branchId }: { branchId: string }) {
  const [closing, setClosing] = useState<Closing | null>(null)
  const [physicalCash, setPhysicalCash] = useState('')
  const [milkStock, setMilkStock] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/daily-closing?branchId=${branchId}&date=${today()}`)
      .then((r) => r.json())
      .then((data) => {
        setClosing(data)
        if (data.status === 'Locked') {
          setPhysicalCash(String(data.managerSubmittedTotals.physicalCashCounted))
          setMilkStock(String(data.managerSubmittedTotals.remainingMilkStock))
        }
      })
      .catch(() => toast.error('Failed to load closing data'))
      .finally(() => setLoading(false))
  }, [branchId])

  async function handleSubmit() {
    if (!physicalCash) {
      toast.error('Enter physical cash count')
      return
    }

    setSubmitting(true)
    const res = await fetch('/api/daily-closing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId,
        date: today(),
        physicalCashCounted: Number(physicalCash),
        remainingMilkStock: Number(milkStock)
      })
    })
    setSubmitting(false)

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to submit')
      return
    }

    const data = await res.json()
    setClosing(data)
    toast.success('Z-Report submitted and day locked')
  }

  if (loading) {
    return <div className="text-slate-500 text-sm">Loading…</div>
  }

  const s = closing?.mathematicalSystemTotals
  const isLocked = closing?.status === 'Locked'

  return (
    <div className="max-w-2xl space-y-4">
      {/* Status */}
      <div className={`card p-4 flex items-center gap-3 ${isLocked ? 'border-emerald-800/50' : 'border-amber-800/50'}`}>
        {isLocked ? (
          <Lock className="w-5 h-5 text-emerald-400" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        )}
        <div>
          <p className={`text-sm font-medium ${isLocked ? 'text-emerald-400' : 'text-amber-400'}`}>
            {isLocked ? 'Day Locked' : 'Day Open'}
          </p>
          <p className="text-xs text-slate-500">{closing?.date}</p>
        </div>
      </div>

      {/* System totals */}
      <div className="card">
        <div className="px-4 py-3 border-b border-slate-800">
          <p className="text-sm font-medium text-slate-100">System Totals</p>
          <p className="text-xs text-slate-500">Auto-calculated from transactions</p>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3">
          {[
            { label: 'Opening Cash', value: s?.openingCash ?? 0 },
            { label: 'Cash Sales', value: s?.cashSales ?? 0 },
            { label: 'Due Collections', value: s?.dueCollections ?? 0 },
            { label: 'Expenses', value: s?.expensesLogged ?? 0 },
          ].map((row) => (
            <div key={row.label} className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-0.5">{row.label}</p>
              <p className="text-sm font-bold text-slate-100">{formatCurrency(row.value)}</p>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4">
          <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3 flex justify-between items-center">
            <span className="text-sm text-blue-300">Expected Drawer Cash</span>
            <span className="text-base font-bold text-blue-400">
              {formatCurrency(s?.expectedDrawerCash ?? 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Manager inputs */}
      <div className="card p-4 space-y-4">
        <p className="text-sm font-medium text-slate-100">Manager Submission</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Physical Cash Counted (৳)</label>
            <input
              type="number"
              className="input-base"
              placeholder="0"
              value={physicalCash}
              onChange={(e) => setPhysicalCash(e.target.value)}
              disabled={isLocked}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Remaining Milk Stock (L)</label>
            <input
              type="number"
              className="input-base"
              placeholder="0"
              value={milkStock}
              onChange={(e) => setMilkStock(e.target.value)}
              disabled={isLocked}
            />
          </div>
        </div>

        {/* Discrepancy preview */}
        {physicalCash && !isLocked && (
          <div className={`rounded-lg px-3 py-2 text-sm border ${
            Number(physicalCash) < (s?.expectedDrawerCash ?? 0)
              ? 'bg-rose-900/20 border-rose-800/30 text-rose-400'
              : 'bg-emerald-900/20 border-emerald-800/30 text-emerald-400'
          }`}>
            {Number(physicalCash) < (s?.expectedDrawerCash ?? 0) ? (
              <>Shortage: {formatCurrency((s?.expectedDrawerCash ?? 0) - Number(physicalCash))}</>
            ) : (
              <>Surplus: {formatCurrency(Number(physicalCash) - (s?.expectedDrawerCash ?? 0))}</>
            )}
          </div>
        )}

        {/* Locked discrepancy */}
        {isLocked && closing && (
          <div className={`rounded-lg px-3 py-2 text-sm border ${
            closing.discrepancies.cashShortage > 0
              ? 'bg-rose-900/20 border-rose-800/30 text-rose-400'
              : 'bg-emerald-900/20 border-emerald-800/30 text-emerald-400'
          }`}>
            {closing.discrepancies.cashShortage > 0 ? (
              <>Cash shortage: {formatCurrency(closing.discrepancies.cashShortage)}</>
            ) : (
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                Balanced
              </div>
            )}
          </div>
        )}

        {!isLocked && (
          <button
            onClick={handleSubmit}
            disabled={submitting || !physicalCash}
            className="btn-primary w-full"
          >
            <Lock className="w-3.5 h-3.5 inline mr-1.5" />
            {submitting ? 'Locking…' : 'Submit & Lock Day'}
          </button>
        )}
      </div>
    </div>
  )
}
