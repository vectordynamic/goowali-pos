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
  procurementCost: number
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
interface PooledStockEntry { branchId: string; stockQty: number }
interface Product {
  _id: string
  name: string
  unitType: string
  isPooled?: boolean
  pooledStock?: PooledStockEntry[]
  variants: Variant[]
}

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
  defaultBranchId?: string
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

export default function BranchReport({ role, branches, assignedBranches, defaultBranchId }: Props) {
  const defaultBranch = defaultBranchId ?? branches[0]?._id ?? ''
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
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [branchId, date])

  useEffect(() => { load() }, [load])

  const getSystemStock = (productId: string, variantId: string) => {
    const p = products.find((x) => x._id === productId)
    if (!p) return 0
    // Pooled product: pull from pooledStock tank
    if (p.isPooled && variantId === 'pooled') {
      return p.pooledStock?.find((b) => b.branchId === branchId)?.stockQty ?? 0
    }
    const v = p.variants.find((x) => x.variantId === variantId)
    return v?.branchDetails.find((b) => b.branchId === branchId)?.stockLevel ?? 0
  }

  const unit = (p: Product) =>
    p.unitType === 'Liquid' ? 'L' : p.unitType === 'Weight' ? 'kg' : 'pcs'

  const st = closing?.mathematicalSystemTotals
  const isPending = !closing || closing.status === 'Pending'
  const nightCash = closing?.nightCashCounted ?? null
  const cashGap = nightCash != null && st ? nightCash - st.expectedDrawerCash : null
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
    return <div className="p-8 text-slate-400">No branches found.</div>
  }

  return (
    <div className="p-6 space-y-6 w-full">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-100">
            {role === 'BRANCH_ADMIN' ? 'Daily Report' : 'Branch Report'}
          </h1>
          <p className="text-sm text-slate-400">Daily summary — sales, cash gap, stock & dues</p>
        </div>
        <div className="flex items-center gap-3">
          {role === 'SUPER_ADMIN' && (
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
        <div className="text-center py-20 text-slate-400">Loading…</div>
      ) : (
        <>
          {/* ── Section 1: Day Status Banner (only when Pending) ── */}
          {isPending && (
            <section>
              <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-amber-400 font-bold text-sm">
                    {isToday ? 'Day has not been started yet' : 'No record for this date'}
                  </p>
                  <p className="text-slate-500 text-xs">
                    {isToday
                      ? 'The manager has not clicked "Start Day" on the POS terminal. Sales are blocked.'
                      : `No DailyClosing record found for ${date}.`}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* ── Section 2: Today's Sales ── */}
          {!isPending && (
          <section>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">
              {isToday ? "Today's Sales" : `${date} — Sales`}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="Cash Sales"
                value={formatCurrency(st?.cashSales ?? 0)}
                color="green"
              />
              <StatCard
                label="Credit Given (Khata)"
                value={formatCurrency(creditGiven)}
                color="amber"
              />
              <StatCard
                label="Due Collected"
                value={formatCurrency(st?.dueCollections ?? 0)}
                color="blue"
              />
              <StatCard
                label="Expenses"
                value={formatCurrency(st?.expensesLogged ?? 0)}
                color="red"
              />
            </div>
          </section>
          )}

          {/* ── Section 3: Cash Check ── */}
          {!isPending && (
          <section>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">Cash Check</p>
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5">
              {/* Cash breakdown chips */}
              <div className="flex flex-wrap items-center gap-2 mb-5 text-sm">
                <div className="flex flex-col items-center bg-slate-700/40 rounded-lg px-3 py-2 min-w-[80px]">
                  <span className="text-xs text-slate-500 mb-0.5">Opening</span>
                  <span className="font-bold text-slate-200">{formatCurrency(st?.openingCash ?? 0)}</span>
                </div>
                <span className="text-slate-500 font-bold">+</span>
                <div className="flex flex-col items-center bg-green-900/30 rounded-lg px-3 py-2 min-w-[80px]">
                  <span className="text-xs text-green-500 mb-0.5">Cash Sales</span>
                  <span className="font-bold text-green-400">{formatCurrency(st?.cashSales ?? 0)}</span>
                </div>
                <span className="text-slate-500 font-bold">+</span>
                <div className="flex flex-col items-center bg-blue-900/30 rounded-lg px-3 py-2 min-w-[80px]">
                  <span className="text-xs text-blue-500 mb-0.5">Collections</span>
                  <span className="font-bold text-blue-400">{formatCurrency(st?.dueCollections ?? 0)}</span>
                </div>
                {(st?.expensesLogged ?? 0) > 0 && (
                  <>
                    <span className="text-slate-500 font-bold">−</span>
                    <div className="flex flex-col items-center bg-red-900/30 rounded-lg px-3 py-2 min-w-[80px]">
                      <span className="text-xs text-red-500 mb-0.5">Expenses</span>
                      <span className="font-bold text-red-400">{formatCurrency(st?.expensesLogged ?? 0)}</span>
                    </div>
                  </>
                )}
                {(st?.procurementCost ?? 0) > 0 && (
                  <>
                    <span className="text-slate-500 font-bold">−</span>
                    <div className="flex flex-col items-center bg-amber-900/30 rounded-lg px-3 py-2 min-w-[80px]">
                      <span className="text-xs text-amber-500 mb-0.5">Stock Bought</span>
                      <span className="font-bold text-amber-400">{formatCurrency(st?.procurementCost ?? 0)}</span>
                    </div>
                  </>
                )}
                <span className="text-slate-500 font-bold">=</span>
                <div className="flex flex-col items-center bg-slate-600/40 rounded-lg px-3 py-2 min-w-[80px] ring-1 ring-slate-500">
                  <span className="text-xs text-slate-400 mb-0.5">Expected</span>
                  <span className="font-black text-slate-100">{formatCurrency(st?.expectedDrawerCash ?? 0)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">Expected in Drawer</p>
                  <p className="text-2xl font-black text-slate-100">{formatCurrency(st?.expectedDrawerCash ?? 0)}</p>
                </div>

                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">Manager Night Count</p>
                  {nightCash !== null ? (
                    <p className="text-2xl font-black text-slate-100">{formatCurrency(nightCash)}</p>
                  ) : (
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <Clock className="w-4 h-4 text-slate-500" />
                      <span className="text-sm text-slate-500">Not submitted yet</span>
                    </div>
                  )}
                </div>

                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">Gap</p>
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
                          {isBalanced ? 'Balanced' : `${isShort ? '−' : '+'}${formatCurrency(cashGapAbs!)}`}
                        </span>
                      </div>
                      <p className={`text-xs mt-1 ${isBalanced ? 'text-green-500' : isShort ? 'text-red-500' : 'text-amber-500'}`}>
                        {isBalanced ? 'All balanced' : isShort ? 'Cash short' : 'Cash over'}
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
                    <p className="text-xs text-orange-400 font-bold mb-0.5">Manager's Note</p>
                    <p className="text-sm text-slate-300">{closing.cashCheckReason}</p>
                  </div>
                </div>
              )}
            </div>
          </section>
          )}

          {/* ── Section 4: Stock Status ── */}
          {!isPending && (
          <section>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">Stock Status</p>
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 overflow-hidden">
              {products.length === 0 ? (
                <p className="p-5 text-slate-500">No products</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/60">
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Product</th>
                      <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">System</th>
                      <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">Counted</th>
                      <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">Gap</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.flatMap((product) => {
                      // Pooled products are stored as a single 'pooled' variantId
                      const rows = product.isPooled
                        ? [{ variantId: 'pooled', sizeLabel: 'Total Volume' }]
                        : product.variants.map((v) => ({ variantId: v.variantId, sizeLabel: v.sizeLabel }))

                      return rows.map((row) => {
                        const sysQty = getSystemStock(product._id, row.variantId)
                        const u = unit(product)
                        const physEntry = closing?.physicalStock?.find(
                          (e) => e.productId === product._id && e.variantId === row.variantId
                        )
                        const gap = physEntry ? physEntry.physicalQty - physEntry.systemQty : null
                        const reasonEntry = closing?.stockCheckReasons?.find(
                          (r) => r.productId === product._id && r.variantId === row.variantId
                        )

                        return (
                          <tr key={`${product._id}:${row.variantId}`} className="border-b border-slate-800 hover:bg-slate-800/30">
                            <td className="px-4 py-3 text-slate-200 font-medium">
                              {product.name}
                              {row.sizeLabel && <span className="text-slate-500 text-xs ml-1">{row.sizeLabel}</span>}
                              {product.isPooled && <span className="ml-2 text-[10px] bg-amber-900/40 text-amber-400 border border-amber-800/40 px-1.5 py-0.5 rounded uppercase font-bold">Pool</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-200 font-bold">
                              {sysQty} {u}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {physEntry ? (
                                <span className="text-slate-200 font-bold">{physEntry.physicalQty} {u}</span>
                              ) : (
                                <span className="text-slate-600 text-xs">—</span>
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
                                <span className="text-xs text-slate-600 italic">No reason given</span>
                              ) : (
                                <span className="text-slate-700">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
          )}

          {/* ── Section 4: Supplier Orders ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Today's supplier orders (from yesterday) */}
            <section>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">
                Today's Supplier Orders (placed yesterday)
              </p>
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                {supplierOrders.length === 0 ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                    <Package className="w-4 h-4" />
                    No orders placed yesterday
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
                            <p className="text-slate-500 text-xs">Ordered: {o.quantity} L</p>
                          </div>
                          {received !== null && (
                            <div className="text-right">
                              <p className="text-slate-300 font-bold text-sm">Current stock: {received} L</p>
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
                Tomorrow's Supplier Orders (placed today)
              </p>
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                {tomorrowOrders.length === 0 ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                    <Clock className="w-4 h-4" />
                    Manager has not placed orders yet
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
                      <span className="text-slate-400 text-sm">Total</span>
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
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Outstanding Dues</p>
              {totalDue > 0 && (
                <span className="bg-red-900/40 border border-red-800/40 text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">
                  Total {formatCurrency(totalDue)}
                </span>
              )}
            </div>

            {customers.length === 0 ? (
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 flex items-center gap-2 text-green-400">
                <CheckCircle className="w-5 h-5" />
                <span className="font-bold">No outstanding dues — all clear!</span>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/60">
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Customer</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Phone</th>
                      <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">Due</th>
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
                          +{customers.length - 5} more customers with outstanding dues
                        </td>
                        <td className="px-4 py-2 text-right text-slate-400 font-bold text-sm">
                          Total {formatCurrency(totalDue)}
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
              Last {history.length} Days History
            </p>
            {history.length === 0 ? (
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 text-slate-500 text-sm">
                No history available
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-slate-800/40 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[850px]">
                    <thead>
                      <tr className="border-b border-slate-700 bg-slate-800/60">
                        <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Date</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">Cash Sales</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">Due Collected</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">Expenses</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">Cash Gap</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Cash Note</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">Stock Gap</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-400 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => {
                        const hSt = h.mathematicalSystemTotals
                        const hNight = h.nightCashCounted
                        const hGap = hNight != null ? hNight - hSt.expectedDrawerCash : null
                        const hStockGap = (h.physicalStock ?? []).reduce(
                          (s, e) => s + (e.physicalQty - e.systemQty), 0
                        )
                        const hasStockCount = (h.physicalStock ?? []).length > 0

                        return (
                          <tr key={h._id} className="border-b border-slate-800 hover:bg-slate-800/30">
                            <td className="px-4 py-3 text-slate-300 font-medium">
                              {h.date}
                              {h.date === today() && (
                                <span className="ml-2 text-xs bg-blue-900/40 text-blue-400 border border-blue-800/40 px-1.5 py-0.5 rounded">Today</span>
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
                                  {hGap === 0 ? 'Balanced' : `${hGap < 0 ? '−' : '+'}${formatCurrency(Math.abs(hGap))}`}
                                </span>
                              ) : (
                                <span className="text-slate-600 text-xs">Not submitted</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {(h as any).cashCheckReason ? (
                                <div className="flex items-start gap-1">
                                  <MessageSquare className="w-3 h-3 text-orange-400 mt-0.5 flex-shrink-0" />
                                  <span className="text-xs text-slate-400 line-clamp-1">{(h as any).cashCheckReason}</span>
                                </div>
                              ) : hGap !== null && Math.abs(hGap) > 30 ? (
                                <span className="text-xs text-slate-600 italic">No note</span>
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
                                <span className="text-slate-600 text-xs">Not counted</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {h.status === 'Locked' ? (
                                <span className="text-xs bg-green-900/40 border border-green-800/40 text-green-400 px-2 py-0.5 rounded-full font-medium">
                                  Locked
                                </span>
                              ) : h.status === 'Pending' ? (
                                <span className="text-xs bg-slate-800 border border-slate-700 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                                  Pending
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
