'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { TrendingUp, TrendingDown, Check, MessageSquare } from 'lucide-react'
import { formatCurrency, today } from '@/lib/utils'

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

interface StockReason {
  productId: string
  variantId: string
  reason: string
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

interface Product {
  _id: string
  name: string
  unitType: string
  variants: Variant[]
}

const CASH_REASON_THRESHOLD = 30   // ৳30
const STOCK_REASON_THRESHOLD = 1   // 1 unit (L / kg / pcs)

export default function ZReport({ branchId }: { branchId: string }) {
  const [systemTotals, setSystemTotals] = useState<SystemTotals | null>(null)
  const [savedNightCash, setSavedNightCash] = useState<number | null>(null)
  const [savedPhysicalStock, setSavedPhysicalStock] = useState<PhysicalStockEntry[]>([])
  const [savedPreOrders, setSavedPreOrders] = useState<PreOrderEntry[]>([])
  const [yesterdayPreOrders, setYesterdayPreOrders] = useState<PreOrderEntry[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  // Night cash
  const [nightCash, setNightCash] = useState('')
  const [savingCash, setSavingCash] = useState(false)

  // Cash reason (shown when |gap| > ৳30)
  const [cashReason, setCashReason] = useState('')
  const [savedCashReason, setSavedCashReason] = useState<string | null>(null)
  const [savingCashReason, setSavingCashReason] = useState(false)

  // Physical stock: productId:variantId → qty string
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({})
  const [savingStock, setSavingStock] = useState(false)

  // Stock reasons per key: productId:variantId → reason string
  const [stockReasons, setStockReasons] = useState<Record<string, string>>({})
  const [savedStockReasons, setSavedStockReasons] = useState<Record<string, string>>({})
  const [savingStockReason, setSavingStockReason] = useState<Record<string, boolean>>({})

  // Pre-orders
  const [preOrderInputs, setPreOrderInputs] = useState<Record<string, string>>({})
  const [savingPreOrders, setSavingPreOrders] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/daily-closing?branchId=${branchId}&date=${today()}`).then((r) => r.json()),
      fetch(`/api/products?branchId=${branchId}`).then((r) => r.json()),
    ])
      .then(([closing, prods]) => {
        setSystemTotals(closing?.mathematicalSystemTotals ?? null)

        if (closing?.nightCashCounted != null) {
          setSavedNightCash(closing.nightCashCounted)
          setNightCash(String(closing.nightCashCounted))
        }

        if (closing?.cashCheckReason) {
          setSavedCashReason(closing.cashCheckReason)
          setCashReason(closing.cashCheckReason)
        }

        const physStock: PhysicalStockEntry[] = closing?.physicalStock ?? []
        setSavedPhysicalStock(physStock)
        const stockInit: Record<string, string> = {}
        physStock.forEach((e) => { stockInit[`${e.productId}:${e.variantId}`] = String(e.physicalQty) })
        setStockInputs(stockInit)

        const stockReasonInit: Record<string, string> = {}
        const stockReasonSavedInit: Record<string, string> = {}
        const reasons: StockReason[] = closing?.stockCheckReasons ?? []
        reasons.forEach((r) => {
          const k = `${r.productId}:${r.variantId}`
          stockReasonInit[k] = r.reason
          stockReasonSavedInit[k] = r.reason
        })
        setStockReasons(stockReasonInit)
        setSavedStockReasons(stockReasonSavedInit)

        const preOrders: PreOrderEntry[] = closing?.tomorrowPreOrders ?? []
        setSavedPreOrders(preOrders)
        const preInit: Record<string, string> = {}
        preOrders.forEach((e) => { preInit[`${e.productId}:${e.variantId}`] = String(e.quantity) })
        setPreOrderInputs(preInit)

        setYesterdayPreOrders(closing?.yesterdayPreOrders ?? [])

        if (Array.isArray(prods)) setProducts(prods)
      })
      .catch(() => toast.error('হিসাব লোড হয়নি'))
      .finally(() => setLoading(false))
  }, [branchId])

  // ── Night cash ──
  async function saveNightCash() {
    const val = Number(nightCash)
    if (isNaN(val) || val < 0) { toast.error('সঠিক পরিমাণ দিন'); return }
    setSavingCash(true)
    const res = await fetch('/api/daily-closing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId, date: today(), action: 'nightCash', nightCash: val }),
    })
    setSavingCash(false)
    if (res.ok) { setSavedNightCash(val); toast.success('রাতের ক্যাশ সেভ হয়েছে ✓') }
    else toast.error('সেভ হয়নি')
  }

  // ── Cash reason ──
  async function saveCashReason() {
    setSavingCashReason(true)
    const res = await fetch('/api/daily-closing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId, date: today(), action: 'cashReason', reason: cashReason }),
    })
    setSavingCashReason(false)
    if (res.ok) { setSavedCashReason(cashReason || null); toast.success('কারণ সেভ হয়েছে ✓') }
    else toast.error('সেভ হয়নি')
  }

  // ── Physical stock ──
  function getSystemStock(product: Product, variantId: string) {
    const v = product.variants.find((x) => x.variantId === variantId)
    const bd = v?.branchDetails.find((b) => b.branchId === branchId)
    return bd?.stockLevel ?? 0
  }

  async function savePhysicalStock() {
    const entries: PhysicalStockEntry[] = []
    for (const product of products) {
      for (const variant of product.variants) {
        const key = `${product._id}:${variant.variantId}`
        const raw = stockInputs[key]
        if (raw === undefined || raw === '') continue
        entries.push({
          productId: product._id,
          variantId: variant.variantId,
          physicalQty: Number(raw),
          systemQty: getSystemStock(product, variant.variantId),
        })
      }
    }
    setSavingStock(true)
    const res = await fetch('/api/daily-closing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId, date: today(), action: 'physicalStock', physicalStock: entries }),
    })
    setSavingStock(false)
    if (res.ok) { setSavedPhysicalStock(entries); toast.success('স্টক চেক সেভ হয়েছে ✓') }
    else toast.error('সেভ হয়নি')
  }

  // ── Stock reason ──
  async function saveStockReason(productId: string, variantId: string) {
    const key = `${productId}:${variantId}`
    setSavingStockReason((p) => ({ ...p, [key]: true }))
    const res = await fetch('/api/daily-closing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId, date: today(), action: 'stockReason',
        productId, variantId, reason: stockReasons[key] ?? '',
      }),
    })
    setSavingStockReason((p) => ({ ...p, [key]: false }))
    if (res.ok) {
      setSavedStockReasons((p) => ({ ...p, [key]: stockReasons[key] ?? '' }))
      toast.success('কারণ সেভ হয়েছে ✓')
    } else {
      toast.error('সেভ হয়নি')
    }
  }

  // ── Pre-orders ──
  const milkProducts = products.filter((p) => p.name.toLowerCase().includes('milk'))

  async function savePreOrders() {
    const entries: PreOrderEntry[] = []
    for (const product of milkProducts) {
      for (const variant of product.variants) {
        const key = `${product._id}:${variant.variantId}`
        const raw = preOrderInputs[key]
        if (!raw || Number(raw) <= 0) continue
        entries.push({
          productId: product._id,
          variantId: variant.variantId,
          productName: `${product.name}${variant.sizeLabel ? ' ' + variant.sizeLabel : ''}`,
          quantity: Number(raw),
        })
      }
    }
    setSavingPreOrders(true)
    const res = await fetch('/api/daily-closing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId, date: today(), action: 'preOrders', preOrders: entries }),
    })
    setSavingPreOrders(false)
    if (res.ok) { setSavedPreOrders(entries); toast.success('অর্ডার সেভ হয়েছে ✓') }
    else toast.error('সেভ হয়নি')
  }

  const expected = systemTotals?.expectedDrawerCash ?? 0
  const nightCashNum = savedNightCash
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

  return (
    <div className="space-y-6 max-w-3xl">

      {/* ── Section 1: রাতের ক্যাশ চেক ── */}
      <div className="lcard overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <p className="text-lg font-black text-gray-800">রাতের ক্যাশ চেক</p>
          <p className="text-sm text-gray-500">রাতে বন্ধ করার আগে ড্রয়ারে কত টাকা আছে গুনুন</p>
        </div>

        <div className="p-5 space-y-4">
          {/* System summary */}
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

          {/* Night cash input */}
          <div>
            <label className="text-base font-black text-gray-700 block mb-2">
              রাতে ক্যাশে কত টাকা আছে? (৳)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                className="flex-1 border-2 border-gray-300 rounded-xl px-4 py-3 text-2xl font-black text-gray-800 bg-white focus:outline-none focus:border-blue-400"
                placeholder="০"
                value={nightCash}
                onChange={(e) => setNightCash(e.target.value)}
              />
              <button
                onClick={saveNightCash}
                disabled={savingCash}
                className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition-colors disabled:opacity-40"
              >
                <Check className="w-5 h-5" />
                {savingCash ? 'সেভ...' : 'সেভ'}
              </button>
            </div>
          </div>

          {/* Comparison result */}
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

          {/* Cash reason box — only when |gap| > ৳30 */}
          {showCashReason && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-orange-500" />
                <p className="text-sm font-black text-orange-700">
                  কারণ কি? (ঐচ্ছিক)
                </p>
                <span className="text-xs text-orange-500 ml-auto">
                  {Math.abs(cashDiff!).toFixed(0)} টাকার পার্থক্য আছে
                </span>
              </div>
              <textarea
                rows={2}
                className="w-full border-2 border-orange-200 rounded-xl px-4 py-2.5 text-base text-gray-800 bg-white focus:outline-none focus:border-orange-400 resize-none placeholder-gray-400"
                placeholder="কেন টাকা কম বা বেশি হলো? লিখুন..."
                value={cashReason}
                onChange={(e) => setCashReason(e.target.value)}
              />
              <div className="flex items-center justify-between">
                {savedCashReason && (
                  <p className="text-xs text-green-600 font-bold">✓ কারণ সেভ আছে</p>
                )}
                <button
                  onClick={saveCashReason}
                  disabled={savingCashReason}
                  className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm transition-colors disabled:opacity-40"
                >
                  <Check className="w-4 h-4" />
                  {savingCashReason ? 'সেভ...' : 'কারণ সেভ করুন'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: স্টক চেক ── */}
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

              {products.map((product) =>
                product.variants.map((variant) => {
                  const key = `${product._id}:${variant.variantId}`
                  const sysQty = getSystemStock(product, variant.variantId)
                  const physRaw = stockInputs[key]
                  const physQty = physRaw !== undefined && physRaw !== '' ? Number(physRaw) : null
                  const gap = physQty !== null ? physQty - sysQty : null
                  const u = unit(product)
                  const showReasonBox = gap !== null && Math.abs(gap) > STOCK_REASON_THRESHOLD

                  return (
                    <div key={key} className="space-y-2">
                      <div className="grid grid-cols-3 gap-2 items-center bg-gray-50 rounded-xl p-3">
                        <div>
                          <p className="text-sm font-black text-gray-800">{product.name}</p>
                          {variant.sizeLabel && <p className="text-xs text-gray-500">{variant.sizeLabel}</p>}
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
                            onChange={(e) => setStockInputs((p) => ({ ...p, [key]: e.target.value }))}
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

                      {/* Stock reason box — only when |gap| > 1 unit */}
                      {showReasonBox && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 ml-2 space-y-2">
                          <div className="flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-orange-500" />
                            <p className="text-sm font-black text-orange-700">কারণ কি? (ঐচ্ছিক)</p>
                            {savedStockReasons[key] && (
                              <span className="text-xs text-green-600 font-bold ml-auto">✓ সেভ আছে</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              className="flex-1 border border-orange-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-orange-400 placeholder-gray-400"
                              placeholder="কেন পার্থক্য হলো? লিখুন..."
                              value={stockReasons[key] ?? ''}
                              onChange={(e) => setStockReasons((p) => ({ ...p, [key]: e.target.value }))}
                            />
                            <button
                              onClick={() => saveStockReason(product._id, variant.variantId)}
                              disabled={!!savingStockReason[key]}
                              className="flex items-center gap-1 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-40 whitespace-nowrap"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {savingStockReason[key] ? '...' : 'সেভ'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}

              <button
                onClick={savePhysicalStock}
                disabled={savingStock}
                className="lbtn-success w-full flex items-center justify-center gap-2 mt-2"
              >
                <Check className="w-5 h-5" />
                {savingStock ? 'সেভ হচ্ছে...' : 'স্টক চেক সেভ করুন'}
              </button>

              {savedPhysicalStock.length > 0 && (
                <p className="text-sm text-green-600 font-bold text-center">
                  ✓ সর্বশেষ চেক সেভ হয়েছে
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Section 3: সরবরাহকারীকে কালকের অর্ডার ── */}
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
              {milkProducts.map((product) =>
                product.variants.map((variant) => {
                  const key = `${product._id}:${variant.variantId}`
                  const label = `${product.name}${variant.sizeLabel ? ' ' + variant.sizeLabel : ''}`
                  const ordered = Number(preOrderInputs[key] || 0)

                  return (
                    <div key={key} className="bg-gray-50 rounded-2xl p-4 space-y-2">
                      <p className="text-base font-black text-gray-800">{label}</p>
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
                          value={preOrderInputs[key] ?? ''}
                          onChange={(e) => setPreOrderInputs((p) => ({ ...p, [key]: e.target.value }))}
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
              )}
            </div>

            {totalPreOrders > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3 flex items-center justify-between">
                <span className="text-base font-bold text-blue-700">কাল মোট অর্ডার</span>
                <span className="text-2xl font-black text-blue-700">{totalPreOrders.toFixed(1)} L</span>
              </div>
            )}

            <button
              onClick={savePreOrders}
              disabled={savingPreOrders}
              className="lbtn-primary w-full flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              {savingPreOrders ? 'সেভ হচ্ছে...' : 'অর্ডার সেভ করুন'}
            </button>

            {savedPreOrders.length > 0 && (
              <p className="text-sm text-green-600 font-bold text-center">
                ✓ অর্ডার সেভ হয়েছে
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
