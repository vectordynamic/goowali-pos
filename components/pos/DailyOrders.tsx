'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ClipboardList, RefreshCw, Minus, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useProducts } from '@/lib/queries/useProducts'

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
  location?: string
  customerType: 'Retail' | 'Paikari'
  paikariConfig: {
    deliveryMethod?: 'Pickup' | 'Send'
    deliveryTime?: string
    fixedProductRates: FixedRate[]
  }
  khata: { currentDue: number }
}

interface DispatchedItem {
  productId: string
  variantId: string
  quantity: number
  rateApplied: number
}

interface ConfirmedItem {
  productId: string
  variantId: string
  quantity: number
}

interface StockInfo {
  productId: string
  variantId: string
  name: string
  available: number
  found?: boolean
}

interface OrderLog {
  _id: string
  customerId: Customer
  status: 'pending' | 'taken' | 'skipped'
  stockOk: boolean
  stockIssues: string[]
  stockInfo?: StockInfo[]
  confirmedItems?: ConfirmedItem[]
  isTemporary?: boolean
  callStatus?: 'not_called' | 'called' | 'no_answer' | 'skipped'
  overrideDeliveryTime?: string
  transactionId?: { items: DispatchedItem[]; financials: { totalBill: number } } | null
}

interface ProductLite {
  _id: string
  name: string
  variants: Array<{ variantId: string; sizeLabel?: string; portionSize?: number }>
}

interface Props {
  branchId: string
  date: string
  onTaken?: () => void
}

export default function DailyOrders({ branchId, date, onTaken }: Props) {
  const queryClient = useQueryClient()
  const ordersKey = ['daily-orders', branchId, date]

  const [acting, setActing] = useState<Record<string, boolean>>({})
  const [showSkipped, setShowSkipped] = useState(false)
  // For partial only: track the cash amount being entered
  const [partialInput, setPartialInput] = useState<Record<string, string>>({})
  // Today's quantity can differ from the configured daily default — keyed `${customerId}:${idx}`
  const [qtyOverride, setQtyOverride] = useState<Record<string, number>>({})

  const { data: logsData, isLoading: logsLoading, isError: logsErrored } = useQuery({
    queryKey: ordersKey,
    queryFn: async () => {
      const res = await fetch(`/api/daily-orders?branchId=${branchId}&date=${date}`)
      if (!res.ok) throw new Error('নিয়মিত অর্ডার লোড হয়নি')
      return res.json()
    },
    enabled: !!branchId && !!date,
  })
  const logs: OrderLog[] = logsData ?? []

  // Shared cache with POSTerminal/ZReport/StockManager — see lib/queries/useProducts.
  const { data: productsData, isLoading: productsLoading } = useProducts(branchId)
  const products: ProductLite[] = productsData ?? []

  const loading = logsLoading || productsLoading

  useEffect(() => {
    if (logsErrored) toast.error('নিয়মিত অর্ডার লোড হয়নি')
  }, [logsErrored])

  function load() {
    queryClient.invalidateQueries({ queryKey: ordersKey })
  }

  function productName(productId: string) {
    return products.find((p) => p._id === productId)?.name ?? 'পণ্য'
  }

  function getQty(customerId: string, idx: number, fallback: number) {
    const key = `${customerId}:${idx}`
    return qtyOverride[key] ?? fallback
  }

  function setQty(customerId: string, idx: number, value: number) {
    const key = `${customerId}:${idx}`
    setQtyOverride((prev) => ({ ...prev, [key]: Math.max(0, Math.round(value * 10) / 10) }))
  }

  // Standing default for a line = what the customer confirmed on last night's call, if any,
  // else the configured daily quantity.
  function confirmedQty(log: OrderLog, rate: FixedRate) {
    const conf = log.confirmedItems?.find(
      (ci) => ci.productId === rate.productId && ci.variantId === rate.variantId
    )
    return conf ? conf.quantity : (rate.dailyQty || 1)
  }

  async function act(customerId: string, status: 'taken' | 'skipped', paymentType?: PaymentType, cashPaid?: number, items?: { productId: string; variantId: string; quantity: number }[]) {
    setActing((p) => ({ ...p, [customerId]: true }))

    const res = await fetch('/api/daily-orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId, date, customerId, status, paymentType, cashPaid, items }),
    })

    setActing((p) => ({ ...p, [customerId]: false }))

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'হয়নি')
      return
    }

    if (status === 'taken') {
      const label = paymentType === 'cash' ? 'নগদ' : paymentType === 'partial' ? 'আংশিক' : 'বাকি'
      toast.success(`দেওয়া হয়েছে — ${label}`)
      setPartialInput((p) => { const n = { ...p }; delete n[customerId]; return n })
      // A dispatch deducted stock and created a transaction — refresh the shared product
      // catalog and today's daily-closing totals so POSTerminal/ZReport/StockManager don't
      // show stale numbers, in addition to SalesLog's own transactions list via onTaken.
      queryClient.invalidateQueries({ queryKey: ['products', branchId, null] })
      queryClient.invalidateQueries({ queryKey: ['daily-closing', branchId, date] })
      onTaken?.()
    }

    load()
  }

  function takeOrder(log: OrderLog, paymentType: PaymentType, cashPaid?: number) {
    const c = log.customerId
    const rates = c.paikariConfig?.fixedProductRates ?? []
    const items = rates
      .map((r, idx) => ({
        productId: r.productId,
        variantId: r.variantId,
        quantity: getQty(c._id, idx, confirmedQty(log, r))
      }))
      .filter((i) => i.quantity > 0)

    if (items.length === 0) {
      toast.error('কমপক্ষে ১টি পণ্যের পরিমাণ দিন')
      return
    }
    act(c._id, 'taken', paymentType, cashPaid, items)
  }

  async function confirmPartial(log: OrderLog, dailyTotal: number) {
    const amt = Number(partialInput[log.customerId._id] ?? '')
    if (!amt || amt <= 0) { toast.error('নগদ পরিমাণ দিন'); return }
    takeOrder(log, 'partial', amt)
  }

  if (loading) return <div className="text-base text-gray-400 py-3">নিয়মিত অর্ডার লোড হচ্ছে...</div>
  if (logs.length === 0) return null

  const pending = logs.filter((l) => l.status === 'pending').length
  const taken = logs.filter((l) => l.status === 'taken').length
  const skipped = logs.filter((l) => l.status === 'skipped').length

  // Effective time = the per-day call override, else the customer's standing delivery time.
  const effTime = (log: OrderLog) =>
    log.overrideDeliveryTime ?? log.customerId.paikariConfig?.deliveryTime ?? ''
  const toMin = (t: string) => {
    if (!t) return 9999
    const [h, m] = t.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  const byTime = (a: OrderLog, b: OrderLog) => toMin(effTime(a)) - toMin(effTime(b))

  // Delivery worklist: Send round first (time-sorted), then Pickup, then done, then a
  // collapsed "won't take / skipped" bucket.
  const sendPending = logs.filter((l) => l.status === 'pending' && l.customerId.paikariConfig?.deliveryMethod === 'Send').sort(byTime)
  const pickupPending = logs.filter((l) => l.status === 'pending' && l.customerId.paikariConfig?.deliveryMethod !== 'Send').sort(byTime)
  const doneLogs = logs.filter((l) => l.status === 'taken')
  const skippedLogs = logs.filter((l) => l.status === 'skipped')

  type RowItem = { type: 'head'; label: string } | { type: 'toggle'; label: string } | { type: 'row'; log: OrderLog }
  const items: RowItem[] = []
  if (sendPending.length) { items.push({ type: 'head', label: `🚚 পৌঁছে দিতে হবে (${sendPending.length})` }); sendPending.forEach((l) => items.push({ type: 'row', log: l })) }
  if (pickupPending.length) { items.push({ type: 'head', label: `🏪 দোকানে আসবে (${pickupPending.length})` }); pickupPending.forEach((l) => items.push({ type: 'row', log: l })) }
  if (doneLogs.length) { items.push({ type: 'head', label: `✅ সম্পন্ন (${doneLogs.length})` }); doneLogs.forEach((l) => items.push({ type: 'row', log: l })) }
  if (skippedLogs.length) { items.push({ type: 'toggle', label: `নেবে না / দেওয়া হয়নি (${skippedLogs.length})` }); if (showSkipped) skippedLogs.forEach((l) => items.push({ type: 'row', log: l })) }

  // ── Totals in weight/volume (kg / L) ──────────────────────────────────────────
  // portionSize converts a variant unit to real weight: 1kg→1, 500gm→0.5. Falls back to 1
  // for products with no portion (piece-counted), so those add as whole units.
  function portionOf(productId: string, variantId: string) {
    const v = products.find((p) => p._id === productId)?.variants.find((x) => x.variantId === variantId)
    return v?.portionSize && v.portionSize > 0 ? v.portionSize : 1
  }
  function logVolume(log: OrderLog) {
    if (log.status === 'taken' && log.transactionId) {
      return log.transactionId.items.reduce((s, it) => s + it.quantity * portionOf(it.productId, it.variantId), 0)
    }
    const rates = log.customerId.paikariConfig?.fixedProductRates ?? []
    return rates.reduce((s, r, idx) => s + getQty(log.customerId._id, idx, confirmedQty(log, r)) * portionOf(r.productId, r.variantId), 0)
  }
  const activeLogs = logs.filter((l) => l.status !== 'skipped')     // real orders for the day
  const totalDaily = activeLogs.reduce((s, l) => s + logVolume(l), 0)
  const totalConfirmed = activeLogs
    .filter((l) => l.callStatus === 'called' && (l.confirmedItems?.length ?? 0) > 0)
    .reduce((s, l) => s + logVolume(l), 0)
  const totalDelivery = activeLogs
    .filter((l) => l.customerId.paikariConfig?.deliveryMethod === 'Send')
    .reduce((s, l) => s + logVolume(l), 0)
  const totalRemaining = logs.filter((l) => l.status === 'pending').reduce((s, l) => s + logVolume(l), 0)
  const kg = (n: number) => `${Math.round(n * 100) / 100} কেজি`

  return (
    <div className="mb-6 lcard overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <ClipboardList className="w-5 h-5 text-blue-600" />
        <span className="text-base font-black text-gray-800">নিয়মিত অর্ডার</span>
        <div className="flex items-center gap-3 ml-auto text-sm font-bold">
          {pending > 0 && <span className="text-amber-600">{pending} বাকি</span>}
          {taken > 0 && <span className="text-green-600">{taken} দেওয়া হয়েছে</span>}
          {skipped > 0 && <span className="text-gray-400">{skipped} বাদ</span>}
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-xl">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weight totals for the day */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border-b border-gray-100">
        <div className="bg-white px-4 py-2.5">
          <p className="text-xs font-bold text-gray-400">মোট অর্ডার</p>
          <p className="text-lg font-black text-gray-800">{kg(totalDaily)}</p>
        </div>
        <div className="bg-white px-4 py-2.5">
          <p className="text-xs font-bold text-gray-400">কনফার্ম</p>
          <p className="text-lg font-black text-green-600">{kg(totalConfirmed)}</p>
        </div>
        <div className="bg-white px-4 py-2.5">
          <p className="text-xs font-bold text-gray-400">🚚 ডেলিভারি</p>
          <p className="text-lg font-black text-blue-600">{kg(totalDelivery)}</p>
        </div>
        <div className="bg-white px-4 py-2.5">
          <p className="text-xs font-bold text-gray-400">বাকি</p>
          <p className="text-lg font-black text-amber-600">{kg(totalRemaining)}</p>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {items.map((it, i) => {
          if (it.type === 'head') {
            return (
              <div key={`h${i}`} className="px-4 py-2 bg-gray-50 text-sm font-black text-gray-500">
                {it.label}
              </div>
            )
          }
          if (it.type === 'toggle') {
            return (
              <button
                key={`t${i}`}
                onClick={() => setShowSkipped((s) => !s)}
                className="w-full flex items-center gap-1.5 px-4 py-2.5 bg-gray-50 text-sm font-black text-gray-500 hover:text-gray-700"
              >
                {showSkipped ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {it.label}
              </button>
            )
          }
          const log = it.log
          const c = log.customerId
          const rates = c.paikariConfig?.fixedProductRates ?? []
          const defaultTotal = rates.reduce((s, r) => s + r.lockedRate * (r.dailyQty || 1), 0)
          const busy = acting[c._id]
          const isPending = log.status === 'pending'
          const showingPartial = partialInput[c._id] !== undefined
          const time = effTime(log)
          const isSend = c.paikariConfig?.deliveryMethod === 'Send'
          const confirmedOnCall = log.callStatus === 'called' && (log.confirmedItems?.length ?? 0) > 0

          const liveTotal = isPending
            ? rates.reduce((s, r, idx) => s + r.lockedRate * getQty(c._id, idx, confirmedQty(log, r)), 0)
            : log.status === 'taken' && log.transactionId
            ? log.transactionId.financials.totalBill
            : defaultTotal

          const overLimit = isPending && rates.some((r, idx) => {
            const available = log.stockInfo?.[idx]?.available ?? Infinity
            return getQty(c._id, idx, confirmedQty(log, r)) > available
          })

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
                  overLimit ? 'bg-red-500' : 'bg-amber-400 animate-pulse'
                }`} />
                <div className="flex-1 min-w-0">
                  <span className="text-base font-black text-gray-800">{c.name}</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-lg font-bold ${
                    c.customerType === 'Paikari' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {c.customerType === 'Paikari' ? 'পাইকারি' : 'খুচরা'}
                  </span>
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-lg font-bold bg-gray-100 text-gray-600">
                    {isSend ? '🚚' : '🏪'} {time || '—'}
                  </span>
                  {log.isTemporary ? (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-lg font-bold bg-purple-100 text-purple-700">
                      🆕 নতুন
                    </span>
                  ) : isPending ? (
                    confirmedOnCall ? (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-lg font-bold bg-green-100 text-green-700">
                        📞 কনফার্ম
                      </span>
                    ) : (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-lg font-bold bg-amber-100 text-amber-700">
                        ❗কনফার্ম হয়নি
                      </span>
                    )
                  ) : null}
                  <p className="text-sm text-gray-500 mt-0.5">
                    {rates.length} পণ্য · <span className="font-bold text-gray-700">{formatCurrency(liveTotal)}/দিন</span>
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

              {/* Actual dispatched breakdown for resolved orders */}
              {log.status === 'taken' && log.transactionId && (
                <div className="pl-5 flex flex-wrap gap-2">
                  {log.transactionId.items.map((it, i) => (
                    <span key={i} className="text-sm font-bold text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-lg">
                      {productName(it.productId)}: {it.quantity} × ৳{it.rateApplied}
                    </span>
                  ))}
                </div>
              )}

              {/* Editable quantity rows — today's amount can differ from the standing order */}
              {isPending && (
                <div className="pl-5 space-y-2">
                  {rates.map((rate, idx) => {
                    const qty = getQty(c._id, idx, confirmedQty(log, rate))
                    const info = log.stockInfo?.[idx]
                    const available = info?.available ?? Infinity
                    const missing = info?.found === false
                    const short = missing || qty > available
                    return (
                      <div key={idx} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${short ? 'bg-red-50' : 'bg-gray-50'}`}>
                        <span className="flex-1 min-w-0 text-base font-bold text-gray-800 truncate">
                          {productName(rate.productId)}
                          <span className="text-gray-500 font-medium"> · ৳{rate.lockedRate}/একক</span>
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setQty(c._id, idx, qty - 0.5)}
                          className="w-10 h-10 flex items-center justify-center rounded-lg bg-white border-2 border-gray-300 text-gray-900 disabled:opacity-40 flex-shrink-0"
                        >
                          <Minus className="w-4 h-4" strokeWidth={3} />
                        </button>
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          disabled={busy}
                          value={qty}
                          onChange={(e) => setQty(c._id, idx, Number(e.target.value))}
                          className="w-16 text-center text-xl font-black text-gray-900 border-2 border-gray-300 rounded-lg py-1 bg-white flex-shrink-0"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setQty(c._id, idx, qty + 0.5)}
                          className="w-10 h-10 flex items-center justify-center rounded-lg bg-white border-2 border-gray-300 text-gray-900 disabled:opacity-40 flex-shrink-0"
                        >
                          <Plus className="w-4 h-4" strokeWidth={3} />
                        </button>
                        {missing ? (
                          <span className="text-xs font-bold text-red-500 flex-shrink-0">⚠️ পণ্য নেই — অর্ডার ঠিক করুন</span>
                        ) : short && (
                          <span className="text-xs font-bold text-red-500 flex-shrink-0">মাত্র {available} আছে</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Payment buttons — shown directly for pending rows */}
              {isPending && (
                <div className="pl-5 space-y-2">
                  {!showingPartial ? (
                    /* Direct payment buttons — one click to submit */
                    <div className="flex gap-2 flex-wrap">
                      <button
                        disabled={busy || overLimit}
                        onClick={() => takeOrder(log, 'cash')}
                        className="flex-1 min-w-[70px] py-2.5 text-base font-bold rounded-xl bg-green-500 text-white hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        নগদ ✓
                      </button>
                      <button
                        disabled={busy || overLimit}
                        onClick={() => takeOrder(log, 'credit')}
                        className="flex-1 min-w-[70px] py-2.5 text-base font-bold rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        বাকি
                      </button>
                      <button
                        disabled={busy || overLimit}
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
                        এখন নগদ পাচ্ছেন (মোট: {formatCurrency(liveTotal)})
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="1"
                          max={liveTotal}
                          className="flex-1 border-2 border-gray-300 rounded-xl px-4 py-2.5 text-base font-bold text-gray-800 bg-white focus:outline-none focus:border-blue-400"
                          placeholder="০"
                          value={partialInput[c._id]}
                          onChange={(e) => setPartialInput((p) => ({ ...p, [c._id]: e.target.value }))}
                          autoFocus
                        />
                        <button
                          onClick={() => confirmPartial(log, liveTotal)}
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
                      {partialInput[c._id] && Number(partialInput[c._id]) < liveTotal && (
                        <p className="text-base font-bold text-amber-600">
                          {formatCurrency(liveTotal - Number(partialInput[c._id]))} বাকিতে যাবে
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
