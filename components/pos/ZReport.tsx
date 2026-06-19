'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Wallet, TrendingUp, TrendingDown, Check, Pencil } from 'lucide-react'
import { formatCurrency, today } from '@/lib/utils'
import StockManager from './StockManager'

interface SystemTotals {
  openingCash: number
  cashSales: number
  dueCollections: number
  expensesLogged: number
  expectedDrawerCash: number
}

export default function ZReport({ branchId }: { branchId: string }) {
  const [totals, setTotals] = useState<SystemTotals | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerCash, setDrawerCash] = useState('')

  // Opening cash state
  const [openingCash, setOpeningCash] = useState('')
  const [openingSet, setOpeningSet] = useState(false)
  const [savingOpening, setSavingOpening] = useState(false)

  useEffect(() => {
    fetch(`/api/daily-closing?branchId=${branchId}&date=${today()}`)
      .then((r) => r.json())
      .then((data) => {
        const t = data?.mathematicalSystemTotals ?? null
        setTotals(t)
        if (t?.openingCash > 0) {
          setOpeningCash(String(t.openingCash))
          setOpeningSet(true)
        }
      })
      .catch(() => toast.error('Failed to load totals'))
      .finally(() => setLoading(false))
  }, [branchId])

  async function saveOpeningCash() {
    const amount = Number(openingCash)
    if (isNaN(amount) || amount < 0) {
      toast.error('Enter a valid amount')
      return
    }
    setSavingOpening(true)
    const res = await fetch('/api/daily-closing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId, date: today(), openingCash: amount })
    })
    setSavingOpening(false)
    if (!res.ok) {
      toast.error('Failed to save opening cash')
      return
    }
    const data = await res.json()
    setTotals(data.mathematicalSystemTotals)
    setOpeningSet(true)
    toast.success('Opening cash saved')
  }

  const expected = totals?.expectedDrawerCash ?? 0
  const actual = drawerCash !== '' ? Number(drawerCash) : null
  const diff = actual !== null ? actual - expected : null
  const isShort = diff !== null && diff < 0
  const isBalanced = diff !== null && diff === 0

  return (
    <div className="space-y-4">
      <StockManager branchId={branchId} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Today's Summary */}
        <div className="card">
          <div className="px-4 py-3 border-b border-slate-800">
            <p className="text-sm font-medium text-slate-100">Today's Summary</p>
            <p className="text-xs text-slate-500">Auto-calculated from transactions</p>
          </div>

          {loading ? (
            <div className="p-4 text-sm text-slate-500">Loading…</div>
          ) : (
            <>
              <div className="p-4 grid grid-cols-2 gap-3">
                {[
                  { label: 'Opening Cash', value: totals?.openingCash ?? 0 },
                  { label: 'Cash Sales', value: totals?.cashSales ?? 0 },
                  { label: 'Due Collections', value: totals?.dueCollections ?? 0 },
                  { label: 'Expenses', value: totals?.expensesLogged ?? 0 },
                ].map((row) => (
                  <div key={row.label} className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-0.5">{row.label}</p>
                    <p className="text-sm font-bold text-slate-100">{formatCurrency(row.value)}</p>
                  </div>
                ))}
              </div>
              <div className="px-4 pb-4">
                <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3 flex justify-between items-center">
                  <span className="text-sm text-blue-300">Expected in Drawer</span>
                  <span className="text-base font-bold text-blue-400">
                    {formatCurrency(expected)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Cash Drawer */}
        <div className="card flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-100">Cash Drawer</p>
              <p className="text-xs text-slate-500">Set opening balance, then count end-of-day cash</p>
            </div>
          </div>

          <div className="p-4 flex flex-col gap-4 flex-1">

            {/* Opening cash */}
            <div className="bg-slate-800/40 rounded-lg p-3 space-y-2">
              <p className="text-xs text-slate-400 font-medium">Opening Cash (start of day)</p>
              {openingSet ? (
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-slate-100">
                    {formatCurrency(Number(openingCash))}
                  </span>
                  <button
                    onClick={() => setOpeningSet(false)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    className="input-base flex-1"
                    placeholder="0"
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveOpeningCash()}
                    autoFocus
                  />
                  <button
                    onClick={saveOpeningCash}
                    disabled={savingOpening}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 border border-blue-500 rounded-md hover:bg-blue-500 transition-colors disabled:opacity-40"
                  >
                    <Check className="w-3 h-3" />
                    {savingOpening ? 'Saving…' : 'Set'}
                  </button>
                </div>
              )}
            </div>

            {/* Counted cash input */}
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Cash counted in drawer now (৳)</label>
              <input
                type="number"
                min="0"
                className="input-base text-lg font-bold"
                placeholder="0"
                value={drawerCash}
                onChange={(e) => setDrawerCash(e.target.value)}
              />
            </div>

            {/* Comparison */}
            {actual !== null && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Expected</span>
                  <span className="text-slate-300">{formatCurrency(expected)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Counted</span>
                  <span className="text-slate-300">{formatCurrency(actual)}</span>
                </div>
                <div className="h-px bg-slate-800" />
                <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 border ${
                  isBalanced
                    ? 'bg-emerald-900/20 border-emerald-800/30'
                    : isShort
                    ? 'bg-rose-900/20 border-rose-800/30'
                    : 'bg-amber-900/20 border-amber-800/30'
                }`}>
                  <div className="flex items-center gap-1.5">
                    {isBalanced ? (
                      <span className="text-sm text-emerald-400 font-medium">Balanced</span>
                    ) : isShort ? (
                      <>
                        <TrendingDown className="w-4 h-4 text-rose-400" />
                        <span className="text-sm text-rose-400 font-medium">Short</span>
                      </>
                    ) : (
                      <>
                        <TrendingUp className="w-4 h-4 text-amber-400" />
                        <span className="text-sm text-amber-400 font-medium">Surplus</span>
                      </>
                    )}
                  </div>
                  {diff !== 0 && diff !== null && (
                    <span className={`text-sm font-bold ${isShort ? 'text-rose-400' : 'text-amber-400'}`}>
                      {isShort ? '-' : '+'}{formatCurrency(Math.abs(diff))}
                    </span>
                  )}
                </div>
              </div>
            )}

            {actual === null && (
              <p className="text-xs text-slate-600 mt-auto">
                Enter counted cash above to compare with expected
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
