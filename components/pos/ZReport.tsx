'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { TrendingUp, TrendingDown, CheckCircle2, MessageSquare, Lock } from 'lucide-react'
import { formatCurrency, today } from '@/lib/utils'
import { useProducts } from '@/lib/queries/useProducts'
import { useDailyClosing, useActiveClosingDate } from '@/lib/queries/useDailyClosing'

interface SystemTotals {
  openingCash: number
  cashSales: number
  dueCollections: number
  expensesLogged: number
  expectedDrawerCash: number
}

interface PhysicalStockEntry {
  productId: string
  variantId: string
  physicalQty: number
  systemQty: number
}

interface PreOrderEntry {
  productId: string
  variantId: string
  productName: string
  quantity: number
}

interface BranchDetail {
  branchId: string
  stockLevel: number
}

interface Variant {
  variantId: string
  sizeLabel?: string
  branchDetails: BranchDetail[]
}

interface PooledStock {
  branchId: string
  stockQty: number
}

interface Product {
  _id: string
  name: string
  productCode?: string
  unitType: string
  isPooled?: boolean
  pooledStock?: PooledStock[]
  variants: Variant[]
}

const CASH_REASON_THRESHOLD = 30   // ৳30
const STOCK_REASON_THRESHOLD = 1   // 1 unit (L / kg / pcs)

export default function ZReport({ branchId }: { branchId: string }) {
  const queryClient = useQueryClient()
  const todayDate = today()

  // The day to close may be an earlier still-Open day (must be force-closed before a new day
  // can start), not necessarily today. Resolve it, then drive the whole report off that date.
  const { data: resolvedDate, isLoading: activeLoading } = useActiveClosingDate(branchId)
  const activeDate = resolvedDate ?? todayDate
  const isStaleDay = activeDate < todayDate
  const closingKey = ['daily-closing', branchId, activeDate]

  const [justFinished, setJustFinished] = useState(false)

  // Everything below is just a local draft — nothing is sent to the server
  // until the one "দিন শেষ করুন" button at the bottom is pressed.
  const [nightCash, setNightCash] = useState('')
  const [cashReason, setCashReason] = useState('')
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({})
  const [stockReasons, setStockReasons] = useState<Record<string, string>>({})
  const [preOrderInputs, setPreOrderInputs] = useState<Record<string, string>>({})
  // Tracks which branch's data the draft fields above were last seeded from.
  const [seededFor, setSeededFor] = useState<string | null>(null)

  const [finishing, setFinishing] = useState(false)

  // ── Shared cache with POSTerminal (same branch+date) and StockManager/DailyOrders
  // (product catalog) — see lib/queries/*.
  const { data: closingData, isLoading: closingLoading, isError: closingErrored } = useDailyClosing(branchId, activeDate)
  const { data: productsData, isLoading: productsLoading } = useProducts(branchId)
  const products: Product[] = productsData ?? []
  const loading = activeLoading || closingLoading || productsLoading

  const dayStatus: string | null = closingLoading ? null : (closingData?.status ?? 'Pending').toLowerCase()
  const systemTotals: SystemTotals | null = closingData?.mathematicalSystemTotals ?? null
  const yesterdayPreOrders: PreOrderEntry[] = closingData?.yesterdayPreOrders ?? []

  useEffect(() => {
    if (closingErrored) toast.error('হিসাব লোড হয়নি')
  }, [closingErrored])

  // Seed the local draft fields from the server exactly once per branch+day — never again
  // automatically, so a background refetch (window refocus, or this same cache key getting
  // invalidated by a sale on POSTerminal) can't silently overwrite a manager's in-progress,
  // unsaved Z-Report edits.
  useEffect(() => {
    if (!closingData || seededFor === branchId) return

    if (closingData.nightCashCounted != null) setNightCash(String(closingData.nightCashCounted))
    if (closingData.cashCheckReason) setCashReason(closingData.cashCheckReason)

    const physStock: PhysicalStockEntry[] = closingData.physicalStock ?? []
    const stockInit: Record<string, string> = {}
    physStock.forEach((e) => { stockInit[`${e.productId}:${e.variantId}`] = String(e.physicalQty) })
    setStockInputs(stockInit)

    const reasonInit: Record<string, string> = {}
    const reasons: { productId: string; variantId: string; reason: string }[] = closingData.stockCheckReasons ?? []
    reasons.forEach((r) => { reasonInit[`${r.productId}:${r.variantId}`] = r.reason })
    setStockReasons(reasonInit)

    const preOrders: PreOrderEntry[] = closingData.tomorrowPreOrders ?? []
    const preInit: Record<string, string> = {}
    preOrders.forEach((e) => { preInit[`${e.productId}:${e.variantId}`] = String(e.quantity) })
    setPreOrderInputs(preInit)

    setSeededFor(branchId)
  }, [closingData, seededFor, branchId])

  function getSystemStock(product: Product, variantId: string) {
    if (product.isPooled && variantId === 'pooled') {
      const ps = product.pooledStock?.find((b) => b.branchId === branchId)
      return ps?.stockQty ?? 0
    }
    const v = product.variants.find((x) => x.variantId === variantId)
    const bd = v?.branchDetails.find((b) => b.branchId === branchId)
    return bd?.stockLevel ?? 0
  }

  const milkProducts = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes('milk') || p.productCode?.toLowerCase() === 'milk'),
    [products]
  )

  // ── The one button: save everything as a single action, then lock the day ──
  async function finishDay() {
    if (nightCash === '' || isNaN(Number(nightCash)) || Number(nightCash) < 0) {
      toast.error('রাতে ক্যাশে কত টাকা আছে লিখুন')
      return
    }

    setFinishing(true)

    const physicalStock: PhysicalStockEntry[] = []
    for (const product of products) {
      const items = product.isPooled
        ? [{ key: `${product._id}:pooled`, variantId: 'pooled' }]
        : product.variants.map((v) => ({ key: `${product._id}:${v.variantId}`, variantId: v.variantId }))
      for (const item of items) {
        const raw = stockInputs[item.key]
        if (raw === undefined || raw === '') continue
        physicalStock.push({
          productId: product._id,
          variantId: item.variantId,
          physicalQty: Number(raw),
          systemQty: getSystemStock(product, item.variantId),
        })
      }
    }

    const preOrders: PreOrderEntry[] = []
    for (const product of milkProducts) {
      const items = product.isPooled
        ? [{ key: `${product._id}:pooled`, variantId: 'pooled' }]
        : product.variants.map((v) => ({ key: `${product._id}:${v.variantId}`, variantId: v.variantId, sizeLabel: v.sizeLabel }))
      for (const item of items) {
        const raw = preOrderInputs[item.key]
        if (!raw || Number(raw) <= 0) continue
        const sizeLabel = 'sizeLabel' in item ? item.sizeLabel : undefined
        preOrders.push({
          productId: product._id,
          variantId: item.variantId,
          productName: `${product.name}${sizeLabel ? ' ' + sizeLabel : ''}`,
          quantity: Number(raw),
        })
      }
    }

    const remainingMilkStock = physicalStock
      .filter((e) => milkProducts.some((p) => p._id === e.productId))
      .reduce((s, e) => s + e.physicalQty, 0)

    try {
      // Fire every draft field as one batch, then lock the day.
      await Promise.all([
        fetch('/api/daily-closing', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId, date: activeDate, action: 'nightCash', nightCash: Number(nightCash) }),
        }),
        cashReason
          ? fetch('/api/daily-closing', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ branchId, date: activeDate, action: 'cashReason', reason: cashReason }),
            })
          : Promise.resolve(),
        physicalStock.length > 0
          ? fetch('/api/daily-closing', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ branchId, date: activeDate, action: 'physicalStock', physicalStock }),
            })
          : Promise.resolve(),
        preOrders.length > 0
          ? fetch('/api/daily-closing', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ branchId, date: activeDate, action: 'preOrders', preOrders }),
            })
          : Promise.resolve(),
        Object.entries(stockReasons).some(([, reason]) => reason)
          ? fetch('/api/daily-closing', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                branchId,
                date: activeDate,
                action: 'stockReasons',
                reasons: Object.entries(stockReasons)
                  .filter(([, reason]) => reason)
                  .map(([key, reason]) => {
                    const [productId, variantId] = key.split(':')
                    return { productId, variantId, reason }
                  }),
              }),
            })
          : Promise.resolve(),
      ])

      const lockRes = await fetch('/api/daily-closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId,
          date: activeDate,
          physicalCashCounted: Number(nightCash),
          remainingMilkStock,
        }),
      })

      if (!lockRes.ok) {
        const err = await lockRes.json()
        toast.error(err.error ?? 'দিন শেষ করা যায়নি')
        setFinishing(false)
        return
      }

      await queryClient.invalidateQueries({ queryKey: closingKey })
      setJustFinished(true)
      toast.success('দিনের হিসাব শেষ হয়েছে ✓')
    } catch {
      toast.error('হিসাব সেভ করা যায়নি, আবার চেষ্টা করুন')
    } finally {
      setFinishing(false)
    }
  }

  const expected = systemTotals?.expectedDrawerCash ?? 0
  const nightCashNum = nightCash !== '' && !isNaN(Number(nightCash)) ? Number(nightCash) : null
  const cashDiff = nightCashNum !== null ? nightCashNum - expected : null
  const cashShort = cashDiff !== null && cashDiff < 0
  const cashBalanced = cashDiff !== null && cashDiff === 0
  const showCashReason = cashDiff !== null && Math.abs(cashDiff) > CASH_REASON_THRESHOLD

  const unit = (p: Product) =>
    p.unitType === 'Liquid' ? 'L' : p.unitType === 'Weight' ? 'kg' : 'পিস'

  const totalPreOrders = Object.values(preOrderInputs).reduce((s, v) => s + (Number(v) || 0), 0)
  const totalYesterdayPre = yesterdayPreOrders.reduce((s, e) => s + e.quantity, 0)

  if (loading) {
    return <div className="text-center text-gray-400 py-16 text-lg">লোড হচ্ছে...</div>
  }

  // ── Day not started ──
  if (dayStatus === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-black text-gray-700">আজকের দিন এখনো শুরু হয়নি</h2>
        <p className="text-gray-500 text-sm text-center max-w-xs">
          রিপোর্ট দেখতে বা হিসাব বন্ধ করতে প্রথমে বিক্রি পেজ থেকে "দিন শুরু করুন" করুন।
        </p>
        <a
          href={`/${branchId}/pos`}
          className="mt-2 flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
        >
          ← বিক্রি পেজে যান
        </a>
      </div>
    )
  }

  // ── Day already closed ──
  if (dayStatus === 'locked') {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <Lock className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-black text-gray-700">
          {justFinished ? 'আজকের হিসাব শেষ হয়েছে ✓' : 'আজকের হিসাব বন্ধ করা হয়েছে'}
        </h2>
        <p className="text-gray-500 text-sm text-center max-w-xs">
          আগামীকাল আবার "দিন শুরু করুন" করে বিক্রি শুরু করতে পারবেন।
        </p>
        <a
          href={`/${branchId}/pos`}
          className="mt-2 flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
        >
          ← বিক্রি পেজে যান
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-6 w-full pb-4">

      {isStaleDay && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-5 py-4">
          <p className="text-lg font-black text-amber-800">⚠️ গতকালের হিসাব এখনো বন্ধ হয়নি</p>
          <p className="text-sm text-amber-700 mt-1">
            {activeDate} তারিখের স্টক গণনা ও নগদ মিলান করে "দিন শেষ করুন" চাপুন। এই দিনের হিসাব বন্ধ না করলে নতুন দিন শুরু করা যাবে না।
          </p>
        </div>
      )}

      {/* ── রাতের ক্যাশ চেক ── */}
      <div className="lcard overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <p className="text-lg font-black text-gray-800">রাতের ক্যাশ চেক</p>
          <p className="text-sm text-gray-500">রাতে বন্ধ করার আগে ড্রয়ারে কত টাকা আছে গুনুন</p>
        </div>

        <div className="p-5 space-y-4">
          {systemTotals && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-2xl p-3 text-center">
                <p className="text-xs font-bold text-green-700 mb-1">নগদ বিক্রি</p>
                <p className="text-lg font-black text-green-700">{formatCurrency(systemTotals.cashSales)}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 text-center">
                <p className="text-xs font-bold text-blue-700 mb-1">বাকি আদায়</p>
                <p className="text-lg font-black text-blue-700">{formatCurrency(systemTotals.dueCollections)}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-center">
                <p className="text-xs font-bold text-red-700 mb-1">খরচ</p>
                <p className="text-lg font-black text-red-700">{formatCurrency(systemTotals.expensesLogged)}</p>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl px-5 py-3 flex items-center justify-between">
            <span className="text-base font-bold text-blue-700">সিস্টেম হিসাবে থাকার কথা</span>
            <span className="text-2xl font-black text-blue-700">{formatCurrency(expected)}</span>
          </div>

          <div>
            <label className="text-base font-black text-gray-700 block mb-2">
              রাতে ক্যাশে কত টাকা আছে? (৳)
            </label>
            <input
              type="number"
              min="0"
              className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-2xl font-black text-gray-800 bg-white focus:outline-none focus:border-blue-400"
              placeholder="০"
              value={nightCash}
              onChange={(e) => setNightCash(e.target.value)}
            />
          </div>

          {nightCashNum !== null && (
            <div className={`flex items-center justify-between rounded-2xl px-5 py-4 border-2 ${
              cashBalanced ? 'bg-green-50 border-green-200' :
              cashShort ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-center gap-2">
                {cashBalanced ? (
                  <span className="text-xl font-black text-green-600">মিলেছে ✓</span>
                ) : cashShort ? (
                  <>
                    <TrendingDown className="w-6 h-6 text-red-500" />
                    <span className="text-xl font-black text-red-600">কম আছে</span>
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-6 h-6 text-amber-600" />
                    <span className="text-xl font-black text-amber-600">বেশি আছে</span>
                  </>
                )}
              </div>
              {cashDiff !== 0 && cashDiff !== null && (
                <span className={`text-2xl font-black ${cashShort ? 'text-red-600' : 'text-amber-600'}`}>
                  {cashShort ? '-' : '+'}{formatCurrency(Math.abs(cashDiff))}
                </span>
              )}
            </div>
          )}

          {showCashReason && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-orange-500" />
                <p className="text-sm font-black text-orange-700">কারণ কি? (ঐচ্ছিক)</p>
              </div>
              <textarea
                rows={2}
                className="w-full border-2 border-orange-200 rounded-xl px-4 py-2.5 text-base text-gray-800 bg-white focus:outline-none focus:border-orange-400 resize-none placeholder-gray-400"
                placeholder="কেন টাকা কম বা বেশি হলো? লিখুন..."
                value={cashReason}
                onChange={(e) => setCashReason(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── স্টক চেক ── */}
      <div className="lcard overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <p className="text-lg font-black text-gray-800">স্টক চেক</p>
          <p className="text-sm text-gray-500">আসলে কত আছে সেটা গুনে লিখুন — পার্থক্য দেখা যাবে</p>
        </div>

        <div className="p-5 space-y-3">
          {products.length === 0 ? (
            <p className="text-gray-400 text-base">কোনো পণ্য নেই</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 px-1 pb-1">
                <span className="text-xs font-bold text-gray-400">পণ্য</span>
                <span className="text-xs font-bold text-gray-400 text-center">সিস্টেমে আছে</span>
                <span className="text-xs font-bold text-gray-400 text-center">আসলে আছে</span>
              </div>

              {products.flatMap((product) => {
                const items = product.isPooled
                  ? [{ key: `${product._id}:pooled`, variantId: 'pooled', name: product.name, sizeLabel: 'মোট পরিমাণ' }]
                  : product.variants.map((v) => ({
                      key: `${product._id}:${v.variantId}`,
                      variantId: v.variantId,
                      name: product.name,
                      sizeLabel: v.sizeLabel,
                    }))

                return items.map((item) => {
                  const sysQty = getSystemStock(product, item.variantId)
                  const physRaw = stockInputs[item.key]
                  const physQty = physRaw !== undefined && physRaw !== '' ? Number(physRaw) : null
                  const gap = physQty !== null ? physQty - sysQty : null
                  const u = unit(product)
                  const showReasonBox = gap !== null && Math.abs(gap) > STOCK_REASON_THRESHOLD

                  return (
                    <div key={item.key} className="space-y-2">
                      <div className="grid grid-cols-3 gap-2 items-center bg-gray-50 rounded-xl p-3">
                        <div>
                          <p className="text-sm font-black text-gray-800">{item.name}</p>
                          {item.sizeLabel && <p className="text-xs text-gray-500">{item.sizeLabel}</p>}
                        </div>
                        <div className="text-center">
                          <span className="text-lg font-black text-gray-700">{sysQty} {u}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            className="flex-1 border-2 border-gray-300 rounded-xl px-3 py-2 text-base font-bold text-gray-800 bg-white focus:outline-none focus:border-blue-400 text-center"
                            placeholder={String(sysQty)}
                            value={physRaw ?? ''}
                            onChange={(e) => setStockInputs((p) => ({ ...p, [item.key]: e.target.value }))}
                          />
                          {gap !== null && (
                            <span className={`text-sm font-black w-14 text-right ${
                              gap === 0 ? 'text-green-600' : gap < 0 ? 'text-red-500' : 'text-amber-600'
                            }`}>
                              {gap > 0 ? '+' : ''}{gap.toFixed(1)} {u}
                            </span>
                          )}
                        </div>
                      </div>

                      {showReasonBox && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 ml-2 space-y-2">
                          <div className="flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-orange-500" />
                            <p className="text-sm font-black text-orange-700">কারণ কি? (ঐচ্ছিক)</p>
                          </div>
                          <input
                            type="text"
                            className="w-full border border-orange-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-orange-400 placeholder-gray-400"
                            placeholder="কেন পার্থক্য হলো? লিখুন..."
                            value={stockReasons[item.key] ?? ''}
                            onChange={(e) => setStockReasons((p) => ({ ...p, [item.key]: e.target.value }))}
                          />
                        </div>
                      )}
                    </div>
                  )
                })
              })}
            </>
          )}
        </div>
      </div>

      {/* ── সরবরাহকারীকে কালকের অর্ডার ── */}
      {milkProducts.length > 0 && (
        <div className="lcard overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <p className="text-lg font-black text-gray-800">কালকের দুধের অর্ডার</p>
            <p className="text-sm text-gray-500">
              সরবরাহকারীকে (সাপ্লায়ারকে) কালকের জন্য কত লিটার অর্ডার করলেন
            </p>
          </div>

          <div className="p-5 space-y-4">
            {totalYesterdayPre > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                <p className="text-sm font-bold text-amber-700 mb-1">
                  গতকাল অর্ডার দিয়েছিলেন (আজকের জন্য)
                </p>
                <div className="flex flex-wrap gap-3">
                  {yesterdayPreOrders.map((e, i) => (
                    <span key={i} className="text-base font-black text-amber-800">
                      {e.productName}: {e.quantity} L
                    </span>
                  ))}
                </div>
                <p className="text-sm font-bold text-amber-600 mt-1">মোট: {totalYesterdayPre} L</p>
              </div>
            )}

            <div className="space-y-3">
              {milkProducts.flatMap((product) => {
                const items = product.isPooled
                  ? [{ key: `${product._id}:pooled`, label: `${product.name} (মোট পরিমাণ)` }]
                  : product.variants.map((v) => ({
                      key: `${product._id}:${v.variantId}`,
                      label: `${product.name}${v.sizeLabel ? ' ' + v.sizeLabel : ''}`,
                    }))

                return items.map((item) => {
                  const ordered = Number(preOrderInputs[item.key] || 0)

                  return (
                    <div key={item.key} className="bg-gray-50 rounded-2xl p-4 space-y-2">
                      <p className="text-base font-black text-gray-800">{item.label}</p>
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-bold text-gray-600 whitespace-nowrap">
                          কালকের অর্ডার (L)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          className="flex-1 border-2 border-gray-300 rounded-xl px-4 py-2.5 text-xl font-black text-gray-800 bg-white focus:outline-none focus:border-blue-400"
                          placeholder="০"
                          value={preOrderInputs[item.key] ?? ''}
                          onChange={(e) => setPreOrderInputs((p) => ({ ...p, [item.key]: e.target.value }))}
                        />
                      </div>
                      {ordered > 0 && (
                        <p className="text-sm font-bold text-blue-600">
                          সাপ্লায়ারকে {ordered} L অর্ডার দেওয়া হবে
                        </p>
                      )}
                    </div>
                  )
                })
              })}
            </div>

            {totalPreOrders > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3 flex items-center justify-between">
                <span className="text-base font-bold text-blue-700">কাল মোট অর্ডার</span>
                <span className="text-2xl font-black text-blue-700">{totalPreOrders.toFixed(1)} L</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── One button: save everything and close the day ── */}
      <button
        onClick={finishDay}
        disabled={finishing}
        className="w-full py-5 rounded-2xl text-xl font-black text-white transition-all shadow-lg disabled:opacity-50 bg-green-600 hover:bg-green-700 active:scale-95 flex items-center justify-center gap-3"
      >
        {finishing ? (
          <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> সেভ হচ্ছে...</>
        ) : (
          <><CheckCircle2 className="w-6 h-6" /> দিন শেষ করুন</>
        )}
      </button>
    </div>
  )
}
