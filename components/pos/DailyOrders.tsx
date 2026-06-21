'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { ClipboardList, RefreshCw } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

type PaymentType = 'cash' | 'partial' | 'credit'

interface FixedRate {
  productId: string
  variantId: string
  lockedRate: number
  dailyQty: number
}

interface Customer {
  _id: string
  name: string
  phone: string
  customerType: 'Retail' | 'Paikari'
  paikariConfig: { fixedProductRates: FixedRate[] }
  khata: { currentDue: number }
}

interface OrderLog {
  _id: string
  customerId: Customer
  status: 'pending' | 'taken' | 'skipped'
  stockOk: boolean
  stockIssues: string[]
}

interface Props {
  branchId: string
  date: string
  onTaken?: () => void
}

export default function DailyOrders({ branchId, date, onTaken }: Props) {
  const [logs, setLogs] = useState<OrderLog[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<Record<string, boolean>>({})
  // For partial only: track the cash amount being entered
  const [partialInput, setPartialInput] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/daily-orders?branchId=${branchId}&date=${date}`)
      .then((r) => r.json())
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .catch(() => toast.error('নিয়মিত অর্ডার লোড হয়নি'))
      .finally(() => setLoading(false))
  }, [branchId, date])

  useEffect(() => { load() }, [load])

  async function act(customerId: string, status: 'taken' | 'skipped', paymentType?: PaymentType, cashPaid?: number) {
    setActing((p) => ({ ...p, [customerId]: true }))

    const res = await fetch('/api/daily-orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId, date, customerId, status, paymentType, cashPaid }),
    })

    setActing((p) => ({ ...p, [customerId]: false }))

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'হয়নি')
      return
    }

    setLogs((prev) =>
      prev.map((l) => l.customerId._id === customerId ? { ...l, status } : l)
    )

    if (status === 'taken') {
      const label = paymentType === 'cash' ? 'নগদ' : paymentType === 'partial' ? 'আংশিক' : 'বাকি'
      toast.success(`দেওয়া হয়েছে — ${label}`)
      setPartialInput((p) => { const n = { ...p }; delete n[customerId]; return n })
      onTaken?.()
    }
  }

  async function confirmPartial(customerId: string, dailyTotal: number) {
    const amt = Number(partialInput[customerId] ?? '')
    if (!amt || amt <= 0) { toast.error('নগদ পরিমাণ দিন'); return }
    await act(customerId, 'taken', 'partial', amt)
  }

  if (loading) return <div className="text-base text-gray-400 py-3">নিয়মিত অর্ডার লোড হচ্ছে...</div>
  if (logs.length === 0) return null

  const pending = logs.filter((l) => l.status === 'pending').length
  const taken = logs.filter((l) => l.status === 'taken').length
  const skipped = logs.filter((l) => l.status === 'skipped').length

  return (
    <div className="mb-6 lcard overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <ClipboardList className="w-5 h-5 text-blue-600" />
        <span className="text-base font-black text-gray-800">নিয়মিত অর্ডার</span>
        <div className="flex items-center gap-3 ml-auto text-sm font-bold">
          {pending > 0 && <span className="text-amber-600">{pending} বাকি</span>}
          {taken > 0 && <span className="text-green-600">{taken} দেওয়া হয়েছে</span>}
          {skipped > 0 && <span className="text-gray-400">{skipped} দেওয়া হয়নি</span>}
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-xl">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {logs.map((log) => {
          const c = log.customerId
          const rates = c.paikariConfig?.fixedProductRates ?? []
          const dailyTotal = rates.reduce((s, r) => s + r.lockedRate * (r.dailyQty || 1), 0)
          const busy = acting[c._id]
          const isPending = log.status === 'pending'
          const showingPartial = partialInput[c._id] !== undefined

          return (
            <div
              key={log._id}
              className={`px-4 py-4 space-y-3 transition-colors ${
                log.status === 'taken' ? 'bg-green-50' :
                log.status === 'skipped' ? 'opacity-50 bg-gray-50' : ''
              }`}
            >
              {/* Customer info row */}
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  log.status === 'taken' ? 'bg-green-500' :
                  log.status === 'skipped' ? 'bg-gray-300' :
                  !log.stockOk ? 'bg-red-500' : 'bg-amber-400 animate-pulse'
                }`} />
                <div className="flex-1 min-w-0">
                  <span className="text-base font-black text-gray-800">{c.name}</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-lg font-bold ${
                    c.customerType === 'Paikari' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {c.customerType === 'Paikari' ? 'পাইকারি' : 'খুচরা'}
                  </span>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {rates.length} পণ্য · <span className="font-bold text-gray-700">{formatCurrency(dailyTotal)}/দিন</span>
                    {c.khata.currentDue > 0 && (
                      <span className="text-red-500 font-bold ml-2">বাকি: {formatCurrency(c.khata.currentDue)}</span>
                    )}
                  </p>
                </div>
                {!isPending && (
                  <span className={`text-sm font-bold flex-shrink-0 ${
                    log.status === 'taken' ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    {log.status === 'taken' ? 'দেওয়া হয়েছে ✓' : 'দেওয়া হয়নি'}
                  </span>
                )}
              </div>

              {/* Stock warning */}
              {isPending && !log.stockOk && (
                <div className="flex flex-wrap gap-2 pl-5">
                  {log.stockIssues.map((issue, i) => (
                    <span key={i} className="text-sm font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-lg">
                      ⚠ {issue}
                    </span>
                  ))}
                </div>
              )}

              {/* Payment buttons — shown directly for pending rows */}
              {isPending && (
                <div className="pl-5 space-y-2">
                  {!showingPartial ? (
                    /* Direct payment buttons — one click to submit */
                    <div className="flex gap-2 flex-wrap">
                      <button
                        disabled={busy || !log.stockOk}
                        onClick={() => act(c._id, 'taken', 'cash')}
                        className="flex-1 min-w-[70px] py-2.5 text-base font-bold rounded-xl bg-green-500 text-white hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        নগদ ✓
                      </button>
                      <button
                        disabled={busy || !log.stockOk}
                        onClick={() => act(c._id, 'taken', 'credit')}
                        className="flex-1 min-w-[70px] py-2.5 text-base font-bold rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        বাকি
                      </button>
                      <button
                        disabled={busy || !log.stockOk}
                        onClick={() => setPartialInput((p) => ({ ...p, [c._id]: '' }))}
                        className="flex-1 min-w-[70px] py-2.5 text-base font-bold rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        আংশিক
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => act(c._id, 'skipped')}
                        className="flex-1 min-w-[70px] py-2.5 text-base font-bold rounded-xl bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-40 transition-colors"
                      >
                        দেওয়া হয়নি
                      </button>
                    </div>
                  ) : (
                    /* Partial amount input — appears only when আংশিক clicked */
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-gray-600">
                        এখন নগদ পাচ্ছেন (মোট: {formatCurrency(dailyTotal)})
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="1"
                          max={dailyTotal}
                          className="flex-1 border-2 border-gray-300 rounded-xl px-4 py-2.5 text-base font-bold text-gray-800 bg-white focus:outline-none focus:border-blue-400"
                          placeholder="০"
                          value={partialInput[c._id]}
                          onChange={(e) => setPartialInput((p) => ({ ...p, [c._id]: e.target.value }))}
                          autoFocus
                        />
                        <button
                          onClick={() => confirmPartial(c._id, dailyTotal)}
                          disabled={busy}
                          className="px-4 py-2.5 bg-green-500 text-white font-bold rounded-xl hover:bg-green-600 disabled:opacity-40 transition-colors"
                        >
                          {busy ? '...' : 'নিশ্চিত'}
                        </button>
                        <button
                          onClick={() => setPartialInput((p) => { const n = { ...p }; delete n[c._id]; return n })}
                          className="px-3 py-2.5 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                        >
                          ফিরে যান
                        </button>
                      </div>
                      {partialInput[c._id] && Number(partialInput[c._id]) < dailyTotal && (
                        <p className="text-base font-bold text-amber-600">
                          {formatCurrency(dailyTotal - Number(partialInput[c._id]))} বাকিতে যাবে
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
