'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { History, TrendingUp, TrendingDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface LogEntry {
  _id: string
  branchId: { _id: string; name: string } | null
  productId: { _id: string; name: string; unitType: string } | null
  variantId: string
  action: 'add' | 'set'
  quantityBefore: number
  quantityChange: number
  quantityAfter: number
  buyingPriceBefore?: number
  buyingPriceAfter?: number
  paidFromCash: boolean
  totalPurchaseCost?: number
  notes?: string
  recordedBy: { _id: string; name: string; role: string } | null
  createdAt: string
}

interface Branch {
  _id: string
  name: string
}

interface Props {
  role: 'SUPER_ADMIN' | 'BRANCH_ADMIN'
  assignedBranches: string[]
  branches: Branch[]
}

export default function StockLogViewer({ role, assignedBranches, branches }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [branchId, setBranchId] = useState(
    role === 'BRANCH_ADMIN' ? (assignedBranches[0] ?? '') : ''
  )
  const [date, setDate] = useState('')

  useEffect(() => {
    if (role === 'BRANCH_ADMIN' && !branchId) return
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, date])

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (branchId) params.set('branchId', branchId)
    if (date) params.set('date', date)

    const res = await fetch(`/api/stock-log?${params.toString()}`)
    setLoading(false)

    if (!res.ok) {
      toast.error('Failed to load stock log')
      return
    }

    setLogs(await res.json())
  }

  const visibleBranches = role === 'SUPER_ADMIN'
    ? branches
    : branches.filter((b) => assignedBranches.includes(b._id))

  function unitLabel(unitType?: string) {
    if (unitType === 'Liquid') return 'L'
    if (unitType === 'Weight') return 'kg'
    return 'pcs'
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {role === 'SUPER_ADMIN' && (
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="input-base w-48"
          >
            <option value="">All Branches</option>
            {visibleBranches.map((b) => (
              <option key={b._id} value={b._id}>{b.name}</option>
            ))}
          </select>
        )}
        {role === 'BRANCH_ADMIN' && visibleBranches.length > 1 && (
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="input-base w-48"
          >
            {visibleBranches.map((b) => (
              <option key={b._id} value={b._id}>{b.name}</option>
            ))}
          </select>
        )}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input-base w-44"
        />
        {date && (
          <button
            onClick={() => setDate('')}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Clear date
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
          <History className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-200">Stock Change History</span>
          <span className="ml-auto text-xs text-slate-500">{logs.length} entries</span>
        </div>

        {loading ? (
          <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">No stock changes recorded yet</div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {logs.map((entry) => {
              const isAdd = entry.action === 'add'
              const isPositive = entry.quantityChange >= 0

              return (
                <div key={entry._id} className="px-4 py-3 flex items-start gap-3">
                  {/* Change indicator */}
                  <div className={`mt-0.5 flex-shrink-0 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-100">
                        {entry.productId?.name ?? 'Unknown product'}
                      </span>
                      <span className="text-xs text-slate-500">{entry.variantId}</span>
                      {entry.branchId && role === 'SUPER_ADMIN' && (
                        <span className="text-xs px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                          {entry.branchId.name}
                        </span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        isAdd ? 'bg-blue-900/30 text-blue-400' : 'bg-amber-900/30 text-amber-400'
                      }`}>
                        {isAdd ? 'added' : 'set'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs">
                      {/* Stock quantity change */}
                      <span className="text-slate-500">
                        {entry.quantityBefore} → {entry.quantityAfter}{' '}
                        {unitLabel(entry.productId?.unitType)}
                        {' '}
                        <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                          ({isPositive ? '+' : ''}{entry.quantityChange})
                        </span>
                      </span>

                      {/* Buying price */}
                      {(() => {
                        const before = entry.buyingPriceBefore ?? 0
                        const after = entry.buyingPriceAfter
                        if (after !== undefined && after !== before) {
                          // Manager updated the price
                          return (
                            <span className="text-slate-500">
                              cost {formatCurrency(before)} →{' '}
                              <span className="text-slate-200 font-medium">{formatCurrency(after)}</span>
                              <span className="text-slate-600 ml-1">(updated)</span>
                            </span>
                          )
                        }
                        if (before > 0) {
                          return (
                            <span className="text-slate-500">
                              cost <span className="text-slate-300">{formatCurrency(before)}</span>
                              {after === undefined && <span className="text-slate-600 ml-1">(from admin)</span>}
                            </span>
                          )
                        }
                        return <span className="text-slate-600 italic">no buying price set</span>
                      })()}

                      {/* Cash purchase */}
                      {entry.paidFromCash && entry.totalPurchaseCost !== undefined && (
                        <span className="text-blue-400 font-medium">
                          ৳{entry.totalPurchaseCost.toLocaleString()} paid from cash
                        </span>
                      )}

                      {entry.notes && (
                        <span className="text-slate-400 italic">"{entry.notes}"</span>
                      )}
                    </div>

                    <div className="mt-0.5 text-xs text-slate-600">
                      {entry.recordedBy?.name ?? 'Unknown'}
                      {entry.recordedBy?.role && (
                        <span className="ml-1 opacity-60">{entry.recordedBy.role.replace('_', ' ')}</span>
                      )}
                      {' · '}
                      {new Date(entry.createdAt).toLocaleString('en-BD', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
