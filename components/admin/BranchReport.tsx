'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  TrendingDown, TrendingUp, Package,
  RefreshCw, CheckCircle, Clock, MessageSquare
} from 'lucide-react'
import { formatCurrency, today } from '@/lib/utils'
import type { Role } from '@/types'

interface Branch { _id: string; name: string }

interface SystemTotals {
  openingCash: number
  cashSales: number
  dueCollections: number
  expensesLogged: number
  expectedDrawerCash: number
}

interface PhysicalStock {
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

interface StockReason {
  productId: string
  variantId: string
  reason: string
}

interface ClosingRecord {
  _id: string
  date: string
  status: string
  mathematicalSystemTotals: SystemTotals
  nightCashCounted: number | null
  cashCheckReason: string | null
  physicalStock: PhysicalStock[]
  stockCheckReasons: StockReason[]
  tomorrowPreOrders: PreOrderEntry[]
  discrepancies: { cashShortage: number; stockMismatch: number }
  yesterdayPreOrders?: PreOrderEntry[]
}

interface BranchDetail { branchId: string; stockLevel: number }
interface Variant { variantId: string; sizeLabel?: string; branchDetails: BranchDetail[] }
interface Product { _id: string; name: string; unitType: string; variants: Variant[] }

interface CustomerDue {
  _id: string
  name: string
  phone?: string
  khata: { currentDue: number }
}

interface Props {
  role: Role
  branches: Branch[]
  assignedBranches: string[]
}

function StatCard({ label, value, sub, color = 'gray' }: {
  label: string; value: string; sub?: string; color?: 'green' | 'red' | 'blue' | 'amber' | 'gray'
}) {
  const colors = {
    green: 'border-green-800/40 bg-green-950/30',
    red: 'border-red-800/40 bg-red-950/30',
    blue: 'border-blue-800/40 bg-blue-950/30',
    amber: 'border-amber-800/40 bg-amber-950/30',
    gray: 'border-slate-700 bg-slate-800/40',
  }
  const textColors = {
    green: 'text-green-400', red: 'text-red-400', blue: 'text-blue-400',
    amber: 'text-amber-400', gray: 'text-slate-200',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs text-slate-400 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-black ${textColors[color]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function BranchReport({ role, branches, assignedBranches }: Props) {
  const defaultBranch = branches[0]?._id ?? ''
  const [branchId, setBranchId] = useState(defaultBranch)
  const [date, setDate] = useState(today())
  const [loading, setLoading] = useState(true)

  const [closing, setClosing] = useState<ClosingRecord | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<CustomerDue[]>([])
  const [history, setHistory] = useState<ClosingRecord[]>([])
  const [creditGiven, setCreditGiven] = useState(0)

  const branchName = (id: string) => branches.find((b) => b._id === id)?.name ?? id

  const load = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    try {
      const [closingRes, productsRes, customersRes, historyRes, txRes] = await Promise.all([
        fetch(`/api/daily-closing?branchId=${branchId}&date=${date}`),
        fetch(`/api/products?branchId=${branchId}`),
        fetch(`/api/customers?branchId=${branchId}&due=1`),
        fetch(`/api/daily-closing/history?branchId=${branchId}&days=7&endDate=${date}`),
        fetch(`/api/transactions?branchId=${branchId}&date=${date}`),
      ])

      const [closingData, productsData, customersData, historyData, txData] = await Promise.all([
        closingRes.json(), productsRes.json(), customersRes.json(), historyRes.json(), txRes.json(),
      ])

      setClosing(closingData)
      setProducts(Array.isArray(productsData) ? productsData : [])
      setCustomers(Array.isArray(customersData) ? customersData : [])
      setHistory(Array.isArray(historyData) ? historyData : [])

      // Compute total credit added to khata today
      const txs: any[] = Array.isArray(txData) ? txData : (txData?.transactions ?? [])
      const totalCredit = txs
        .filter((t) => ['Credit Sale', 'Partial Payment'].includes(t.transactionType))
        .reduce((s: number, t: any) => s + (t.financials?.amountAddedToKhata ?? 0), 0)
      setCreditGiven(totalCredit)
    } catch {
      toast.error('ডেটা লোড হয়নি')
    } finally {
      setLoading(false)
    }
  }, [branchId, date])

  useEffect(() => { load() }, [load])

  const getSystemStock = (productId: string, variantId: string) => {
    const p = products.find((x) => x._id === productId)
    const v = p?.variants.find((x) => x.variantId === variantId)
    return v?.branchDetails.find((b) => b.branchId === branchId)?.stockLevel ?? 0
  }

  const unit = (p: Product) =>
    p.unitType === 'Liquid' ? 'L' : p.unitType === 'Weight' ? 'kg' : 'pcs'

  const st = closing?.mathematicalSystemTotals
  const nightCash = closing?.nightCashCounted ?? null
  const cashGap = nightCash !== null && st ? nightCash - st.expectedDrawerCash : null
  const cashGapAbs = cashGap !== null ? Math.abs(cashGap) : null
  const isShort = cashGap !== null && cashGap < 0
  const isBalanced = cashGap !== null && cashGap === 0

  const totalDue = customers.reduce((s, c) => s + (c.khata?.currentDue ?? 0), 0)
  const topDebtors = [...customers].sort((a, b) => (b.khata?.currentDue ?? 0) - (a.khata?.currentDue ?? 0)).slice(0, 5)

  const isToday = date === today()

  // Today's supplier orders (from yesterday's tomorrowPreOrders, returned in closing as yesterdayPreOrders)
  const supplierOrders: PreOrderEntry[] = closing?.yesterdayPreOrders ?? []

  // Tomorrow's supplier orders (closing.tomorrowPreOrders — what manager saved for tomorrow)
  const tomorrowOrders: PreOrderEntry[] = closing?.tomorrowPreOrders ?? []

  const totalStockGap = (closing?.physicalStock ?? []).reduce((s, e) => s + (e.physicalQty - e.systemQty), 0)

  if (!branches.length) {
    return <div className="p-8 text-slate-400">কোনো শাখা নেই।</div>
  }

  return (
    <div className="p-6 space-y-6 w-full">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-100">Branch Report</h1>
          <p className="text-sm text-slate-400">Daily summary — sales, cash gap, stock & dues</p>
        </div>
        <div className="flex items-center gap-3">
          {(role === 'SUPER_ADMIN' || branches.length > 1) && (
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {branches.map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
          )}
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">লোড হচ্ছে...</div>
      ) : (
        <>
          {/* ── Section 1: Today's Sales ── */}
          <section>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">
              {isToday ? "আজকের বিক্রি" : `${date} — বিক্রির হিসাব`}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="নগদ বিক্রি"
                value={formatCurrency(st?.cashSales ?? 0)}
                color="green"
              />
              <StatCard
                label="বাকিতে দিলাম (খাতায়)"
                value={formatCurrency(creditGiven)}
                color="amber"
              />
              <StatCard
                label="বাকি আদায়"
                value={formatCurrency(st?.dueCollections ?? 0)}
                color="blue"
              />
              <StatCard
                label="খরচ"
                value={formatCurrency(st?.expensesLogged ?? 0)}
                color="red"
              />
            </div>
          </section>

          {/* ── Section 2: Cash Gap ── */}
          <section>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">ক্যাশ চেক</p>
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">সিস্টেমে থাকার কথা</p>
                  <p className="text-2xl font-black text-slate-100">{formatCurrency(st?.expectedDrawerCash ?? 0)}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    ওপেনিং {formatCurrency(st?.openingCash ?? 0)} + বিক্রি {formatCurrency(st?.cashSales ?? 0)} + আদায় {formatCurrency(st?.dueCollections ?? 0)} − খরচ {formatCurrency(st?.expensesLogged ?? 0)}
                  </p>
                </div>

                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">ম্যানেজার রাতে গুনেছে</p>
                  {nightCash !== null ? (
                    <p className="text-2xl font-black text-slate-100">{formatCurrency(nightCash)}</p>
                  ) : (
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <Clock className="w-4 h-4 text-slate-500" />
                      <span className="text-sm text-slate-500">এখনো জমা দেয়নি</span>
                    </div>
                  )}
                </div>

                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">গ্যাপ</p>
                  {cashGap !== null ? (
                    <>
                      <div className={`flex items-center justify-center gap-2 ${isBalanced ? 'text-green-400' : isShort ? 'text-red-400' : 'text-amber-400'}`}>
                        {isBalanced ? (
                          <CheckCircle className="w-5 h-5" />
                        ) : isShort ? (
                          <TrendingDown className="w-5 h-5" />
                        ) : (
                          <TrendingUp className="w-5 h-5" />
                        )}
                        <span className="text-2xl font-black">
                          {isBalanced ? 'মিলেছে' : `${isShort ? '−' : '+'}${formatCurrency(cashGapAbs!)}`}
                        </span>
                      </div>
                      <p className={`text-xs mt-1 ${isBalanced ? 'text-green-500' : isShort ? 'text-red-500' : 'text-amber-500'}`}>
                        {isBalanced ? 'সব ঠিক আছে' : isShort ? 'টাকা কম পাওয়া গেছে' : 'টাকা বেশি পাওয়া গেছে'}
                      </p>
                    </>
                  ) : (
                    <span className="text-sm text-slate-500">—</span>
                  )}
                </div>
              </div>

              {/* Cash reason — shown when manager wrote one */}
              {closing?.cashCheckReason && (
                <div className="mt-4 pt-4 border-t border-slate-700 flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-orange-400 font-bold mb-0.5">ম্যানেজারের ব্যাখ্যা</p>
                    <p className="text-sm text-slate-300">{closing.cashCheckReason}</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ── Section 3: Stock Status ── */}
          <section>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">স্টক স্ট্যাটাস</p>
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 overflow-hidden">
              {products.length === 0 ? (
                <p className="p-5 text-slate-500">কোনো পণ্য নেই</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/60">
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">পণ্য</th>
                      <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">সিস্টেম</th>
                      <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">গণনা</th>
                      <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">গ্যাপ</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">কারণ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) =>
                      product.variants.map((variant) => {
                        const sysQty = getSystemStock(product._id, variant.variantId)
                        const u = unit(product)
                        const physEntry = closing?.physicalStock?.find(
                          (e) => e.productId === product._id && e.variantId === variant.variantId
                        )
                        const gap = physEntry ? physEntry.physicalQty - physEntry.systemQty : null
                        const reasonEntry = closing?.stockCheckReasons?.find(
                          (r) => r.productId === product._id && r.variantId === variant.variantId
                        )

                        return (
                          <tr key={`${product._id}:${variant.variantId}`} className="border-b border-slate-800 hover:bg-slate-800/30">
                            <td className="px-4 py-3 text-slate-200 font-medium">
                              {product.name}
                              {variant.sizeLabel && <span className="text-slate-500 text-xs ml-1">{variant.sizeLabel}</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-200 font-bold">
                              {sysQty} {u}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {physEntry ? (
                                <span className="text-slate-200 font-bold">{physEntry.physicalQty} {u}</span>
                              ) : (
                                <span className="text-slate-600 text-xs">হয়নি</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {gap !== null ? (
                                <span className={`font-bold text-sm ${gap === 0 ? 'text-green-400' : gap < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                                  {gap > 0 ? '+' : ''}{gap.toFixed(2)} {u}
                                </span>
                              ) : (
                                <span className="text-slate-700">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {reasonEntry ? (
                                <div className="flex items-start gap-1.5">
                                  <MessageSquare className="w-3.5 h-3.5 text-orange-400 mt-0.5 flex-shrink-0" />
                                  <span className="text-xs text-slate-300">{reasonEntry.reason}</span>
                                </div>
                              ) : gap !== null && Math.abs(gap) > 1 ? (
                                <span className="text-xs text-slate-600 italic">কারণ দেওয়া হয়নি</span>
                              ) : (
                                <span className="text-slate-700">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* ── Section 4: Supplier Orders ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Today's supplier orders (from yesterday) */}
            <section>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">
                আজকের সাপ্লায়ার অর্ডার (গতকাল দেওয়া)
              </p>
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                {supplierOrders.length === 0 ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                    <Package className="w-4 h-4" />
                    গতকাল কোনো অর্ডার দেওয়া হয়নি
                  </div>
                ) : (
                  <div className="space-y-3">
                    {supplierOrders.map((o, i) => {
                      const p = products.find((x) => x._id === o.productId)
                      const sysNow = p ? getSystemStock(o.productId, o.variantId) : null
                      const received = sysNow !== null ? sysNow : null
                      return (
                        <div key={i} className="flex items-center justify-between">
                          <div>
                            <p className="text-slate-200 font-bold text-sm">{o.productName}</p>
                            <p className="text-slate-500 text-xs">অর্ডার করা ছিল: {o.quantity} L</p>
                          </div>
                          {received !== null && (
                            <div className="text-right">
                              <p className="text-slate-300 font-bold text-sm">এখন স্টকে: {received} L</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* Tomorrow's supplier orders */}
            <section>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">
                কালকের সাপ্লায়ার অর্ডার (আজ দেওয়া)
              </p>
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                {tomorrowOrders.length === 0 ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                    <Clock className="w-4 h-4" />
                    ম্যানেজার এখনো অর্ডার দেয়নি
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tomorrowOrders.map((o, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <p className="text-slate-200 font-bold text-sm">{o.productName}</p>
                        <span className="text-blue-400 font-black">{o.quantity} L</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-slate-700 flex justify-between">
                      <span className="text-slate-400 text-sm">মোট</span>
                      <span className="text-blue-400 font-black">
                        {tomorrowOrders.reduce((s, o) => s + o.quantity, 0)} L
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ── Section 5: Due Summary ── */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">বাকির হিসাব</p>
              {totalDue > 0 && (
                <span className="bg-red-900/40 border border-red-800/40 text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">
                  মোট {formatCurrency(totalDue)}
                </span>
              )}
            </div>

            {customers.length === 0 ? (
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 flex items-center gap-2 text-green-400">
                <CheckCircle className="w-5 h-5" />
                <span className="font-bold">কোনো বাকি নেই — সব পরিষ্কার!</span>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/60">
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">কাস্টমার</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">ফোন</th>
                      <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">বাকি</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDebtors.map((c) => (
                      <tr key={c._id} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-slate-200 font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-slate-400">{c.phone ?? '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-black ${(c.khata?.currentDue ?? 0) > 1000 ? 'text-red-400' : 'text-amber-400'}`}>
                            {formatCurrency(c.khata?.currentDue ?? 0)}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {customers.length > 5 && (
                      <tr className="border-t border-slate-700">
                        <td colSpan={2} className="px-4 py-2 text-slate-500 text-xs">
                          আরও {customers.length - 5} জনের বাকি আছে
                        </td>
                        <td className="px-4 py-2 text-right text-slate-400 font-bold text-sm">
                          মোট {formatCurrency(totalDue)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Section 6: 7-Day History ── */}
          <section>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">
              সর্বশেষ {history.length} দিনের ইতিহাস
            </p>
            {history.length === 0 ? (
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 text-slate-500 text-sm">
                কোনো পূর্ববর্তী তথ্য নেই
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[850px]">
                    <thead>
                      <tr className="border-b border-slate-700 bg-slate-800/60">
                        <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">তারিখ</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">নগদ বিক্রি</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">বাকি আদায়</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">খরচ</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">ক্যাশ গ্যাপ</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">ক্যাশ কারণ</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">স্টক গ্যাপ</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-400 font-medium">স্ট্যাটাস</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => {
                        const hSt = h.mathematicalSystemTotals
                        const hNight = h.nightCashCounted
                        const hGap = hNight !== null ? hNight - hSt.expectedDrawerCash : null
                        const hStockGap = (h.physicalStock ?? []).reduce(
                          (s, e) => s + (e.physicalQty - e.systemQty), 0
                        )
                        const hasStockCount = (h.physicalStock ?? []).length > 0
                        const isLocked = h.status === 'Locked'

                        return (
                          <tr key={h._id} className="border-b border-slate-800 hover:bg-slate-800/30">
                            <td className="px-4 py-3 text-slate-300 font-medium">
                              {h.date}
                              {h.date === today() && (
                                <span className="ml-2 text-xs bg-blue-900/40 text-blue-400 border border-blue-800/40 px-1.5 py-0.5 rounded">আজ</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-green-400 font-bold">
                              {formatCurrency(hSt.cashSales)}
                            </td>
                            <td className="px-4 py-3 text-right text-blue-400 font-bold">
                              {formatCurrency(hSt.dueCollections)}
                            </td>
                            <td className="px-4 py-3 text-right text-red-400 font-bold">
                              {formatCurrency(hSt.expensesLogged)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {hGap !== null ? (
                                <span className={`font-black ${hGap === 0 ? 'text-green-400' : hGap < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                                  {hGap === 0 ? 'মিলেছে' : `${hGap < 0 ? '−' : '+'}${formatCurrency(Math.abs(hGap))}`}
                                </span>
                              ) : (
                                <span className="text-slate-600 text-xs">জমা হয়নি</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {(h as any).cashCheckReason ? (
                                <div className="flex items-start gap-1">
                                  <MessageSquare className="w-3 h-3 text-orange-400 mt-0.5 flex-shrink-0" />
                                  <span className="text-xs text-slate-400 line-clamp-1">{(h as any).cashCheckReason}</span>
                                </div>
                              ) : hGap !== null && Math.abs(hGap) > 30 ? (
                                <span className="text-xs text-slate-600 italic">কারণ নেই</span>
                              ) : (
                                <span className="text-slate-700">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {hasStockCount ? (
                                <span className={`font-bold ${hStockGap === 0 ? 'text-green-400' : hStockGap < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                                  {hStockGap > 0 ? '+' : ''}{hStockGap.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-slate-600 text-xs">গণনা হয়নি</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isLocked ? (
                                <span className="text-xs bg-green-900/40 border border-green-800/40 text-green-400 px-2 py-0.5 rounded-full font-medium">
                                  Locked
                                </span>
                              ) : (
                                <span className="text-xs bg-amber-900/40 border border-amber-800/40 text-amber-400 px-2 py-0.5 rounded-full font-medium">
                                  Open
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
