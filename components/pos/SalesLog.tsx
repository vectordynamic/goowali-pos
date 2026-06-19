'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, Search, Receipt, User, ChevronDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Role } from '@/types'
import DailyOrders from './DailyOrders'

interface TransactionItem {
  productId: string
  variantId: string
  quantity: number
  rateApplied: number
  isCustomOverride?: boolean
}

interface Transaction {
  _id: string
  invoiceId: string
  transactionType: string
  items: TransactionItem[]
  financials: {
    totalBill: number
    cashPaid: number
    amountAddedToKhata: number
    netProfitAmount?: number
  }
  customerId?: { name: string; phone: string } | null
  recordedBy?: { name: string }
  createdAt: string
}

interface Props {
  branchId: string
  role: Role
}

function todayDate() {
  return new Date().toISOString().split('T')[0]
}

const TYPE_COLORS: Record<string, string> = {
  'Cash Sale': 'bg-emerald-900/30 text-emerald-400',
  'Credit Sale': 'bg-amber-900/30 text-amber-400',
  'Partial Payment': 'bg-blue-900/30 text-blue-400',
  'Due Collection': 'bg-violet-900/30 text-violet-400',
  'Expense': 'bg-rose-900/30 text-rose-400',
  'Procurement': 'bg-slate-700 text-slate-400'
}

export default function SalesLog({ branchId, role }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(todayDate)
  const [typeFilter, setTypeFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ branchId, date })
    if (typeFilter) params.set('type', typeFilter)

    fetch(`/api/transactions?${params}`)
      .then((r) => r.json())
      .then((data) => setTransactions(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Failed to load transactions'))
      .finally(() => setLoading(false))
  }, [branchId, date, typeFilter])

  useEffect(() => { load() }, [load])

  const SALE_TYPES = ['Cash Sale', 'Credit Sale', 'Partial Payment']
  const saleCount = transactions.filter((t) => SALE_TYPES.includes(t.transactionType)).length

  const total = transactions.reduce((s, t) => s + t.financials.totalBill, 0)
  const cashTotal = transactions.reduce((s, t) => s + t.financials.cashPaid, 0)
  const khataTotal = transactions.reduce((s, t) => s + t.financials.amountAddedToKhata, 0)

  const isToday = date === todayDate()

  return (
    <div className="space-y-4">
      {/* Regular orders checklist — only shown for today */}
      {isToday && (
        <DailyOrders
          branchId={branchId}
          date={date}
          onTaken={load}
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Date</label>
          <input
            type="date"
            className="input-base w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <select
          className="input-base w-40"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          <option value="Cash Sale">Cash Sale</option>
          <option value="Credit Sale">Credit Sale</option>
          <option value="Partial Payment">Partial Payment</option>
          <option value="Due Collection">Due Collection</option>
        </select>

        <button
          onClick={load}
          className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setDate(todayDate())}
          className="btn-secondary text-xs"
        >
          Today
        </button>
      </div>

      {/* Summary strip */}
      {!loading && transactions.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <div className="card px-4 py-2 flex items-center gap-2">
            <span className="text-xs text-slate-500">Total Sales</span>
            <span className="text-sm font-bold text-slate-100">{saleCount}</span>
          </div>
          {role !== 'MANAGER' && (
            <div className="card px-4 py-2 flex items-center gap-2">
              <span className="text-xs text-slate-500">Revenue</span>
              <span className="text-sm font-bold text-emerald-400">{formatCurrency(total)}</span>
            </div>
          )}
          <div className="card px-4 py-2 flex items-center gap-2">
            <span className="text-xs text-slate-500">Cash In</span>
            <span className="text-sm font-bold text-blue-400">{formatCurrency(cashTotal)}</span>
          </div>
          {khataTotal > 0 && (
            <div className="card px-4 py-2 flex items-center gap-2">
              <span className="text-xs text-slate-500">Credit Given</span>
              <span className="text-sm font-bold text-amber-400">{formatCurrency(khataTotal)}</span>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center text-slate-500 py-12 text-sm">Loading sales log…</div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-16">
          <Receipt className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No transactions</p>
          <p className="text-slate-600 text-sm mt-1">No sales logged for this date</p>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => {
            const isOpen = expanded === tx._id
            return (
              <div key={tx._id} className="card overflow-hidden">
                {/* Row header */}
                <button
                  onClick={() => setExpanded(isOpen ? null : tx._id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/30 transition-colors"
                >
                  {/* Time */}
                  <span className="text-xs font-mono text-slate-500 w-14 shrink-0">
                    {new Date(tx.createdAt).toLocaleTimeString('en-BD', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </span>

                  {/* Type badge */}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    TYPE_COLORS[tx.transactionType] ?? 'bg-slate-700 text-slate-400'
                  }`}>
                    {tx.transactionType}
                  </span>

                  {/* Customer */}
                  <span className="flex items-center gap-1 text-sm text-slate-400 flex-1 min-w-0">
                    <User className="w-3 h-3 shrink-0 text-slate-600" />
                    <span className="truncate">
                      {tx.customerId?.name ?? (
                        tx.transactionType === 'Procurement' ? 'Stock Purchase' :
                        tx.transactionType === 'Expense' ? 'Store Expense' :
                        'Walk-in'
                      )}
                    </span>
                  </span>

                  {/* Item summary */}
                  <span className="text-xs text-slate-500 hidden sm:block shrink-0">
                    {tx.items.length} item{tx.items.length !== 1 ? 's' : ''}
                  </span>

                  {/* Total */}
                  <span className="text-sm font-bold text-emerald-400 shrink-0">
                    {formatCurrency(tx.financials.totalBill)}
                  </span>

                  <ChevronDown className={`w-3.5 h-3.5 text-slate-600 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-slate-800 px-4 pb-4 pt-3 bg-slate-800/20 space-y-3">
                    {/* Invoice + recorded by */}
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="font-mono">{tx.invoiceId}</span>
                      {tx.recordedBy && <span>by {tx.recordedBy.name}</span>}
                    </div>

                    {/* Items table */}
                    {tx.items.length > 0 && (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="text-left py-1 text-xs text-slate-500 font-medium">Variant</th>
                            <th className="text-right py-1 text-xs text-slate-500 font-medium">Qty</th>
                            <th className="text-right py-1 text-xs text-slate-500 font-medium">Rate</th>
                            <th className="text-right py-1 text-xs text-slate-500 font-medium">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tx.items.map((item, i) => (
                            <tr key={i} className="border-b border-slate-800/50">
                              <td className="py-1.5 text-slate-300 font-mono text-xs">
                                {item.variantId}
                                {item.isCustomOverride && (
                                  <span className="ml-1.5 text-amber-400 text-[10px]">custom rate</span>
                                )}
                              </td>
                              <td className="py-1.5 text-right text-slate-300">{item.quantity}</td>
                              <td className="py-1.5 text-right text-slate-300">{formatCurrency(item.rateApplied)}</td>
                              <td className="py-1.5 text-right text-slate-200 font-medium">
                                {formatCurrency(item.rateApplied * item.quantity)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {/* Payment breakdown */}
                    <div className="flex flex-wrap gap-4 text-xs pt-1">
                      {role !== 'MANAGER' && (
                        <div>
                          <span className="text-slate-500">Total: </span>
                          <span className="text-emerald-400 font-medium">{formatCurrency(tx.financials.totalBill)}</span>
                        </div>
                      )}
                      {tx.financials.cashPaid > 0 && (
                        <div>
                          <span className="text-slate-500">Cash received: </span>
                          <span className="text-blue-400 font-medium">{formatCurrency(tx.financials.cashPaid)}</span>
                        </div>
                      )}
                      {tx.financials.amountAddedToKhata > 0 && (
                        <div>
                          <span className="text-slate-500">On credit: </span>
                          <span className="text-amber-400 font-medium">{formatCurrency(tx.financials.amountAddedToKhata)}</span>
                        </div>
                      )}
                      {role !== 'MANAGER' && tx.financials.netProfitAmount !== undefined && (
                        <div>
                          <span className="text-slate-500">Profit: </span>
                          <span className="text-violet-400 font-medium">{formatCurrency(tx.financials.netProfitAmount)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
