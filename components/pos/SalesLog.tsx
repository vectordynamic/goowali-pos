'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { RefreshCw, Receipt, User, ChevronDown, Undo2, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Role } from '@/types'
import DailyOrders from './DailyOrders'
import { useActiveClosingDate } from '@/lib/queries/useDailyClosing'
import { useProducts } from '@/lib/queries/useProducts'

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
  // Void / correction audit trail
  status?: 'active' | 'voided'
  voidedAt?: string
  voidedBy?: { name: string }
  voidReason?: string
  correctedFromId?: { invoiceId: string; transactionType: string; financials: { totalBill: number }; createdAt: string } | null
  correctedById?: { invoiceId: string; transactionType: string; createdAt: string } | null
}

interface Props {
  branchId: string
  role: Role
}

function todayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })
}

const SALE_TYPES = ['Cash Sale', 'Credit Sale', 'Partial Payment']
const CASH_IN_TYPES = ['Cash Sale', 'Partial Payment', 'Due Collection']

const TYPE_BN: Record<string, string> = {
  'Cash Sale': 'নগদ বিক্রি',
  'Credit Sale': 'বাকিতে বিক্রি',
  'Partial Payment': 'আংশিক নগদ',
  'Due Collection': 'বাকি আদায়',
  'Expense': 'খরচ',
  'Procurement': 'স্টক কেনা',
}

const TYPE_COLORS: Record<string, string> = {
  'Cash Sale': 'bg-green-100 text-green-700',
  'Credit Sale': 'bg-amber-100 text-amber-700',
  'Partial Payment': 'bg-blue-100 text-blue-700',
  'Due Collection': 'bg-purple-100 text-purple-700',
  'Expense': 'bg-red-100 text-red-600',
  'Procurement': 'bg-gray-100 text-gray-600',
}

export default function SalesLog({ branchId, role }: Props) {
  const queryClient = useQueryClient()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(todayDate)
  const [typeFilter, setTypeFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  // Void / correction modal state
  const [voidTarget, setVoidTarget] = useState<Transaction | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidMode, setVoidMode] = useState<'void' | 'correct'>('void')
  const [corrType, setCorrType] = useState('Credit Sale')
  const [corrCashPaid, setCorrCashPaid] = useState('')
  const [voidSubmitting, setVoidSubmitting] = useState(false)

  const { data: productsData } = useProducts(branchId)
  const products = productsData ?? []

  async function submitVoid() {
    if (!voidTarget) return
    if (!voidReason.trim()) { toast.error('বাতিলের কারণ লিখুন'); return }

    const body: Record<string, unknown> = { reason: voidReason.trim() }

    if (voidMode === 'correct') {
      // Use same items, just different payment type
      body.correction = {
        transactionType: corrType,
        cashPaid: corrType === 'Cash Sale' ? voidTarget.financials.totalBill
          : corrType === 'Partial Payment' ? Number(corrCashPaid)
          : 0,
        items: voidTarget.items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          rateApplied: i.rateApplied,
        })),
        notes: `সংশোধন — কারণ: ${voidReason.trim()}`,
      }
    }

    setVoidSubmitting(true)
    try {
      const res = await fetch(`/api/transactions/${voidTarget._id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'বাতিল হয়নি'); return }
      toast.success(voidMode === 'correct' ? 'সংশোধন সম্পন্ন হয়েছে ✓' : 'লেনদেন বাতিল হয়েছে ✓')
      setVoidTarget(null)
      setVoidReason('')
      setCorrCashPaid('')
      setVoidMode('void')
      queryClient.invalidateQueries({ queryKey: ['daily-closing', branchId] })
      queryClient.invalidateQueries({ queryKey: ['daily-orders', branchId] })
      queryClient.invalidateQueries({ queryKey: ['products', branchId] })
      load()
    } finally {
      setVoidSubmitting(false)
    }
  }

  // Sync to active business day on first load (handles midnight rollover before day is closed)
  const { data: activeDate } = useActiveClosingDate(branchId)
  useEffect(() => {
    if (activeDate) setDate((prev) => {
      // Only auto-sync if user hasn't manually changed the date
      if (prev === todayDate()) return activeDate
      return prev
    })
  }, [activeDate])

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ branchId, date })
    if (typeFilter) params.set('type', typeFilter)

    fetch(`/api/transactions?${params}`)
      .then((r) => r.json())
      .then((data) => setTransactions(Array.isArray(data) ? data : []))
      .catch(() => toast.error('লোড হয়নি'))
      .finally(() => setLoading(false))
  }, [branchId, date, typeFilter])

  useEffect(() => { load() }, [load])

  const { saleCount, cashTotal, khataTotal, total, procurementTotal, totalVolume } = useMemo(() => {
    let saleCount = 0, cashTotal = 0, khataTotal = 0, total = 0, procurementTotal = 0, totalVolume = 0

    function portionOf(productId: string, variantId: string) {
      const p = (products as any[]).find((x: any) => x._id === productId)
      const v = p?.variants?.find((x: any) => x.variantId === variantId)
      return v?.portionSize && v.portionSize > 0 ? v.portionSize : 1
    }

    for (const t of transactions) {
      if (t.status === 'voided') continue
      const isSale = SALE_TYPES.includes(t.transactionType)
      if (isSale) {
        saleCount++
        total += t.financials.totalBill
        for (const item of t.items) {
          totalVolume += item.quantity * portionOf(item.productId, item.variantId)
        }
      }
      if (CASH_IN_TYPES.includes(t.transactionType)) cashTotal += t.financials.cashPaid
      if (t.transactionType === 'Procurement') procurementTotal += t.financials.cashPaid
      khataTotal += t.financials.amountAddedToKhata
    }
    return { saleCount, cashTotal, khataTotal, total, procurementTotal, totalVolume }
  }, [transactions, products])

  const isToday = date === (activeDate ?? todayDate())

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-7xl mx-auto">

      {/* Daily Orders Section */}
      <DailyOrders branchId={branchId} date={date} onTaken={load} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-gray-600">তারিখ</label>
            <input
              type="date"
              className="linput w-auto min-h-[44px]"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <select
            className="border-2 border-gray-300 rounded-xl px-3 py-2 text-sm sm:text-base text-gray-800 bg-white focus:outline-none focus:border-blue-400 min-h-[44px]"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">সব ধরন</option>
            <option value="Cash Sale">নগদ বিক্রি</option>
            <option value="Credit Sale">বাকিতে বিক্রি</option>
            <option value="Partial Payment">আংশিক নগদ</option>
            <option value="Due Collection">বাকি আদায়</option>
          </select>
        </div>

        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={load}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="রিফ্রেশ"
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          <button
            onClick={() => setDate(todayDate())}
            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-sm transition-colors min-h-[44px]"
          >
            আজকের
          </button>
        </div>
      </div>

      {/* Summary */}
      {!loading && transactions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="lcard px-4 py-3">
            <p className="text-sm text-gray-500 mb-1">মোট বিক্রি</p>
            <p className="text-2xl font-black text-gray-800">{saleCount} টি</p>
          </div>
          <div className="lcard px-4 py-3">
            <p className="text-sm text-gray-500 mb-1">মোট পরিমাণ</p>
            <p className="text-2xl font-black text-blue-600">{Math.round(totalVolume * 100) / 100} কেজি</p>
          </div>
          {role !== 'MANAGER' && (
            <div className="lcard px-4 py-3">
              <p className="text-sm text-gray-500 mb-1">মোট টাকা</p>
              <p className="text-xl font-black text-green-600">{formatCurrency(total)}</p>
            </div>
          )}
          <div className="lcard px-4 py-3">
            <p className="text-sm text-gray-500 mb-1">নগদ পেয়েছি</p>
            <p className="text-xl font-black text-blue-600">{formatCurrency(cashTotal)}</p>
          </div>
          {khataTotal > 0 && (
            <div className="lcard px-4 py-3">
              <p className="text-sm text-gray-500 mb-1">বাকি দিয়েছি</p>
              <p className="text-xl font-black text-amber-600">{formatCurrency(khataTotal)}</p>
            </div>
          )}
          {procurementTotal > 0 && (
            <div className="lcard px-4 py-3">
              <p className="text-sm text-gray-500 mb-1">স্টক কিনেছি</p>
              <p className="text-xl font-black text-red-500">{formatCurrency(procurementTotal)}</p>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-12 text-lg">লোড হচ্ছে...</div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-16 lcard">
          <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-lg font-bold text-gray-600">কোনো বিক্রি নেই</p>
          <p className="text-gray-400 mt-1">এই তারিখে কোনো বিক্রির হিসাব নেই</p>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => {
            const isOpen = expanded === tx._id
            const isVoided = tx.status === 'voided'
            const isCorrection = !!tx.correctedFromId
            const canVoid = !isVoided && isToday
            return (
              <div key={tx._id} className={`lcard overflow-hidden ${isVoided ? 'opacity-60' : ''}`}>
                <button
                  onClick={() => setExpanded(isOpen ? null : tx._id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-bold text-gray-500 w-16 shrink-0">
                    {new Date(tx.createdAt).toLocaleTimeString('bn-BD', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </span>

                  <span className={`text-sm px-2.5 py-1 rounded-xl font-bold shrink-0 ${
                    isVoided ? 'bg-red-100 text-red-600 line-through' :
                    TYPE_COLORS[tx.transactionType] ?? 'bg-gray-100 text-gray-600'
                  }`}>
                    {TYPE_BN[tx.transactionType] ?? tx.transactionType}
                  </span>

                  {isVoided && (
                    <span className="text-xs px-2 py-0.5 rounded-lg font-bold bg-red-100 text-red-600 shrink-0">❌ বাতিল</span>
                  )}
                  {isCorrection && !isVoided && (
                    <span className="text-xs px-2 py-0.5 rounded-lg font-bold bg-blue-100 text-blue-600 shrink-0">✏️ সংশোধন</span>
                  )}

                  <span className="flex items-center gap-1 text-base text-gray-600 flex-1 min-w-0">
                    <User className="w-4 h-4 shrink-0 text-gray-400" />
                    <span className="truncate font-medium">
                      {tx.customerId?.name ?? (
                        tx.transactionType === 'Procurement' ? 'স্টক কেনা' :
                        tx.transactionType === 'Expense' ? 'খরচ' : 'সাধারণ কাস্টমার'
                      )}
                    </span>
                  </span>

                  <span className="text-base font-black text-gray-800 shrink-0">
                    {formatCurrency(tx.financials.totalBill)}
                  </span>

                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3 bg-gray-50 space-y-3">
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <span className="font-mono">{tx.invoiceId}</span>
                      {tx.recordedBy && <span>— {tx.recordedBy.name}</span>}
                    </div>

                    {/* Voided audit info */}
                    {isVoided && (
                      <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm">
                        <p className="font-bold text-red-700">❌ বাতিল করা হয়েছে</p>
                        <p className="text-red-600">কারণ: {tx.voidReason}</p>
                        {tx.voidedBy && <p className="text-red-500 text-xs">— {tx.voidedBy.name}, {tx.voidedAt ? new Date(tx.voidedAt).toLocaleString('bn-BD') : ''}</p>}
                        {tx.correctedById && <p className="text-blue-600 text-xs font-bold mt-1">✏️ সংশোধন করা হয়েছে</p>}
                      </div>
                    )}

                    {/* Correction source info */}
                    {isCorrection && !isVoided && tx.correctedFromId && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-sm">
                        <p className="font-bold text-blue-700">✏️ সংশোধন</p>
                        <p className="text-blue-600 text-xs">মূল: {tx.correctedFromId.invoiceId} ({TYPE_BN[tx.correctedFromId.transactionType] ?? tx.correctedFromId.transactionType}) — {formatCurrency(tx.correctedFromId.financials.totalBill)}</p>
                      </div>
                    )}

                    {tx.items.length > 0 && (
                      <table className="w-full text-base">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 text-sm text-gray-500 font-bold">পণ্য</th>
                            <th className="text-right py-2 text-sm text-gray-500 font-bold">পরিমাণ</th>
                            <th className="text-right py-2 text-sm text-gray-500 font-bold">দাম</th>
                            <th className="text-right py-2 text-sm text-gray-500 font-bold">মোট</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tx.items.map((item, i) => (
                            <tr key={i} className="border-b border-gray-100">
                              <td className="py-2 text-gray-700 font-medium">{item.variantId}</td>
                              <td className="py-2 text-right text-gray-700">{item.quantity}</td>
                              <td className="py-2 text-right text-gray-700">{formatCurrency(item.rateApplied)}</td>
                              <td className="py-2 text-right font-bold text-gray-800">
                                {formatCurrency(item.rateApplied * item.quantity)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    <div className="flex flex-wrap gap-4 text-sm pt-1">
                      {role !== 'MANAGER' && (
                        <div>
                          <span className="text-gray-500">মোট: </span>
                          <span className="text-green-600 font-bold">{formatCurrency(tx.financials.totalBill)}</span>
                        </div>
                      )}
                      {tx.financials.cashPaid > 0 && (
                        <div>
                          <span className="text-gray-500">নগদ পেয়েছি: </span>
                          <span className="text-blue-600 font-bold">{formatCurrency(tx.financials.cashPaid)}</span>
                        </div>
                      )}
                      {tx.financials.amountAddedToKhata > 0 && (
                        <div>
                          <span className="text-gray-500">বাকিতে: </span>
                          <span className="text-amber-600 font-bold">{formatCurrency(tx.financials.amountAddedToKhata)}</span>
                        </div>
                      )}
                    </div>

                    {/* Void button */}
                    {canVoid && (
                      <div className="pt-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setVoidTarget(tx); setVoidMode('void'); setVoidReason(''); setCorrCashPaid('') }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
                        >
                          <Undo2 className="w-4 h-4" />
                          ভুল সংশোধন / বাতিল
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Void / Correct Modal ───────────────────────────────────────────── */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-black text-gray-800">লেনদেন সংশোধন</h2>
            </div>

            {/* Original tx summary */}
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm space-y-1">
              <p className="font-bold text-gray-700">{TYPE_BN[voidTarget.transactionType] ?? voidTarget.transactionType} — {formatCurrency(voidTarget.financials.totalBill)}</p>
              <p className="text-gray-500">{voidTarget.invoiceId} · {voidTarget.customerId?.name ?? 'সাধারণ কাস্টমার'}</p>
              <p className="text-gray-400 text-xs">{voidTarget.items.map(i => `${i.variantId}: ${i.quantity}`).join(', ')}</p>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">বাতিলের কারণ <span className="text-red-500">*</span></label>
              <input
                className="w-full border-2 border-gray-300 rounded-xl px-3 py-2 text-base focus:outline-none focus:border-red-400"
                placeholder="যেমন: ভুল পেমেন্ট টাইপ, ভুল পরিমাণ..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
              />
            </div>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setVoidMode('void')}
                className={`py-2 rounded-xl text-sm font-bold border-2 transition-colors ${
                  voidMode === 'void' ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500'
                }`}
              >
                শুধু বাতিল
              </button>
              <button
                onClick={() => setVoidMode('correct')}
                className={`py-2 rounded-xl text-sm font-bold border-2 transition-colors ${
                  voidMode === 'correct' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'
                }`}
              >
                বাতিল + সংশোধন
              </button>
            </div>

            {/* Correction options */}
            {voidMode === 'correct' && (
              <div className="space-y-3 bg-blue-50 rounded-xl p-3">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">নতুন পেমেন্ট ধরন</label>
                  <select
                    value={corrType}
                    onChange={(e) => setCorrType(e.target.value)}
                    className="w-full border-2 border-gray-300 rounded-xl px-3 py-2 text-base text-gray-800 bg-white focus:outline-none focus:border-blue-400"
                  >
                    <option value="Cash Sale">নগদ বিক্রি</option>
                    <option value="Credit Sale">বাকিতে বিক্রি</option>
                    <option value="Partial Payment">আংশিক নগদ</option>
                  </select>
                </div>
                {corrType === 'Partial Payment' && (
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">নগদ পরিমাণ (৳)</label>
                    <input
                      type="number"
                      min={0}
                      className="w-full border-2 border-gray-300 rounded-xl px-3 py-2 text-base text-gray-800 focus:outline-none focus:border-blue-400"
                      placeholder="০"
                      value={corrCashPaid}
                      onChange={(e) => setCorrCashPaid(e.target.value)}
                    />
                  </div>
                )}
                <p className="text-xs text-blue-600">পণ্য ও পরিমাণ আগেরটাই থাকবে, শুধু পেমেন্ট পরিবর্তন হবে।</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setVoidTarget(null); setVoidReason(''); setCorrCashPaid('') }}
                disabled={voidSubmitting}
                className="flex-1 py-2.5 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                বাতিল
              </button>
              <button
                onClick={submitVoid}
                disabled={voidSubmitting || !voidReason.trim()}
                className="flex-1 py-2.5 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {voidSubmitting ? 'হচ্ছে...' : voidMode === 'correct' ? 'সংশোধন করুন' : 'বাতিল করুন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
