'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, Receipt, User, ChevronDown } from 'lucide-react'
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
      .catch(() => toast.error('লোড হয়নি'))
      .finally(() => setLoading(false))
  }, [branchId, date, typeFilter])

  useEffect(() => { load() }, [load])

  const { saleCount, cashTotal, khataTotal, total, procurementTotal } = useMemo(() => {
    let saleCount = 0, cashTotal = 0, khataTotal = 0, total = 0, procurementTotal = 0
    for (const t of transactions) {
      const isSale = SALE_TYPES.includes(t.transactionType)
      if (isSale) { saleCount++; total += t.financials.totalBill }
      if (CASH_IN_TYPES.includes(t.transactionType)) cashTotal += t.financials.cashPaid
      if (t.transactionType === 'Procurement') procurementTotal += t.financials.cashPaid
      khataTotal += t.financials.amountAddedToKhata
    }
    return { saleCount, cashTotal, khataTotal, total, procurementTotal }
  }, [transactions])

  const isToday = date === todayDate()

  return (
    <div className="space-y-4">
      {isToday && (
        <DailyOrders branchId={branchId} date={date} onTaken={load} />
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-2xl p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <label className="text-sm font-bold text-gray-600">তারিখ</label>
          <input
            type="date"
            className="border-2 border-gray-300 rounded-xl px-3 py-2 text-base text-gray-800 bg-white focus:outline-none focus:border-blue-400"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <select
          className="border-2 border-gray-300 rounded-xl px-3 py-2 text-base text-gray-800 bg-white focus:outline-none focus:border-blue-400"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">সব ধরন</option>
          <option value="Cash Sale">নগদ বিক্রি</option>
          <option value="Credit Sale">বাকিতে বিক্রি</option>
          <option value="Partial Payment">আংশিক নগদ</option>
          <option value="Due Collection">বাকি আদায়</option>
        </select>

        <button
          onClick={load}
          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
          title="রিফ্রেশ"
        >
          <RefreshCw className="w-5 h-5" />
        </button>

        <button
          onClick={() => setDate(todayDate())}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-colors"
        >
          আজকের
        </button>
      </div>

      {/* Summary */}
      {!loading && transactions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="lcard px-4 py-3">
            <p className="text-sm text-gray-500 mb-1">মোট বিক্রি</p>
            <p className="text-2xl font-black text-gray-800">{saleCount}</p>
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
            return (
              <div key={tx._id} className="lcard overflow-hidden">
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
                    TYPE_COLORS[tx.transactionType] ?? 'bg-gray-100 text-gray-600'
                  }`}>
                    {TYPE_BN[tx.transactionType] ?? tx.transactionType}
                  </span>

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
