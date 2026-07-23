'use client'

import { useState, useEffect, useCallback, memo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts'
import {
  TrendingUp, DollarSign, Wallet, GitBranch, RefreshCw,
  TrendingDown, Droplets
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Role } from '@/types'

interface Props { role: Role }
interface Branch { _id: string; name: string }

interface Summary {
  salesRevenue: number
  cogs: number
  grossProfit: number
  procurementCost: number
  expenses: number
  netProfit: number
  cashIn: number
  cashOut: number
  khataAdded: number
  khataCollected: number
  salesCount: number
  procurementCount: number
  txCount: number
  liquidSold: number
  weightSold: number
  liquidProcured: number
  weightProcured: number
}

interface ProductBreakdown {
  productId: string
  variantId: string
  productName: string
  sizeLabel?: string
  unitType: string
  qtySold: number
  revenue: number
  grossProfit: number
  txCount: number
}

interface TrendPoint {
  date: string
  salesRevenue: number
  grossProfit: number
  netProfit: number
  expenses: number
  procurementCost: number
  cashIn: number
}

interface BranchBreakdown {
  branchId: string
  branchName: string
  salesRevenue: number
  grossProfit: number
  netProfit: number
  procurementCost: number
  txCount: number
}

interface Analytics {
  summary: Summary
  trend: TrendPoint[]
  byBranch: BranchBreakdown[]
  byProduct: ProductBreakdown[]
  totalOutstandingKhata: number
  visibleBranches: Branch[]
}

type Preset = 'today' | 'week' | 'month' | 'custom'

function getPresetRange(preset: Preset): { from: string; to: string } {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  if (preset === 'today') { const t = fmt(now); return { from: t, to: t } }
  if (preset === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - 6)
    return { from: fmt(start), to: fmt(now) }
  }
  if (preset === 'month') {
    return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) }
  }
  return { from: '', to: '' }
}

const StatCard = memo(function StatCard({
  label, value, sub, icon: Icon, color, bg
}: {
  label: string; value: string; sub?: string
  icon: React.ElementType; color: string; bg: string
}) {
  return (
    <div className="stat-card">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
    </div>
  )
})

export default function AnalyticsDashboard({ role }: Props) {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('month')
  const [dateRange, setDateRange] = useState(getPresetRange('month'))
  const [selectedBranch, setSelectedBranch] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (dateRange.from) p.set('from', dateRange.from)
    if (dateRange.to) p.set('to', dateRange.to)
    if (selectedBranch) p.set('branchId', selectedBranch)

    fetch(`/api/analytics?${p}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dateRange.from, dateRange.to, selectedBranch])

  useEffect(() => { load() }, [load])

  function applyPreset(p: Preset) {
    setPreset(p)
    if (p !== 'custom') setDateRange(getPresetRange(p))
  }

  const s = data?.summary
  const visibleBranches = data?.visibleBranches ?? []
  const margin = s && s.salesRevenue > 0
    ? Math.round((s.netProfit / s.salesRevenue) * 100) : null

  const presets: Array<{ key: Preset; label: string }> = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Last 7 days' },
    { key: 'month', label: 'This month' },
    { key: 'custom', label: 'Custom' }
  ]

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {role === 'SUPER_ADMIN' && visibleBranches.length > 1 && (
          <div className="flex items-center gap-2">
            <GitBranch className="w-3.5 h-3.5 text-slate-500" />
            <select
              className="input-base w-44"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
            >
              <option value="">All branches</option>
              {visibleBranches.map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                preset === p.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <>
            <input type="date" className="input-base w-auto" value={dateRange.from}
              onChange={(e) => setDateRange((p) => ({ ...p, from: e.target.value }))} />
            <span className="text-slate-500 text-sm">to</span>
            <input type="date" className="input-base w-auto" value={dateRange.to}
              onChange={(e) => setDateRange((p) => ({ ...p, to: e.target.value }))} />
          </>
        )}

        <button onClick={load}
          className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors ml-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {role === 'SUPER_ADMIN' && (
        <p className="text-xs text-slate-600">
          Showing: <span className="text-slate-500">
            {selectedBranch
              ? visibleBranches.find((b) => b._id === selectedBranch)?.name ?? 'Branch'
              : 'All branches'}
          </span>
          {dateRange.from && <> · {dateRange.from}{dateRange.to !== dateRange.from && ` → ${dateRange.to}`}</>}
        </p>
      )}

      {loading ? (
        <div className="text-slate-500 text-sm py-8 text-center">Loading analytics…</div>
      ) : (
        <>
          {/* ── Row 1: Revenue & Profit ── */}
          {/* ── Row 1: Revenue & Profit ── */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">Sales Performance</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                label="Total Sales Revenue"
                value={formatCurrency(s?.salesRevenue ?? 0)}
                sub={`${s?.salesCount ?? 0} sale transactions`}
                icon={DollarSign} color="text-emerald-400" bg="bg-emerald-900/20"
              />
              <StatCard
                label="Cost of Goods Sold"
                value={formatCurrency(s?.cogs ?? 0)}
                sub="buying cost of sold stock"
                icon={TrendingDown} color="text-orange-400" bg="bg-orange-900/20"
              />
              <StatCard
                label="Gross Profit"
                value={formatCurrency(s?.grossProfit ?? 0)}
                sub={`Revenue − COGS`}
                icon={TrendingUp}
                color={(s?.grossProfit ?? 0) >= 0 ? 'text-blue-400' : 'text-red-400'}
                bg={(s?.grossProfit ?? 0) >= 0 ? 'bg-blue-900/20' : 'bg-red-900/20'}
              />
              <StatCard
                label="Net Profit"
                value={formatCurrency(s?.netProfit ?? 0)}
                sub={margin !== null ? `${margin}% margin · Expenses ${formatCurrency(s?.expenses ?? 0)}` : '—'}
                icon={TrendingUp}
                color={(s?.netProfit ?? 0) >= 0 ? 'text-violet-400' : 'text-red-400'}
                bg={(s?.netProfit ?? 0) >= 0 ? 'bg-violet-900/20' : 'bg-red-900/20'}
              />
            </div>
          </div>

          {/* ── Row 2: Stock & Due ── */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">Stock & Due</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <StatCard
                label="Litres Sold / Procured"
                value={`${(s?.liquidSold ?? 0).toFixed(1)} L sold`}
                sub={`Procured: ${(s?.liquidProcured ?? 0).toFixed(1)} L · Net stock change: ${((s?.liquidProcured ?? 0) - (s?.liquidSold ?? 0)).toFixed(1)} L`}
                icon={Droplets} color="text-cyan-400" bg="bg-cyan-900/20"
              />
              <StatCard
                label="Outstanding Due"
                value={formatCurrency(data?.totalOutstandingKhata ?? 0)}
                sub={`${formatCurrency(s?.khataAdded ?? 0)} credit given · ${formatCurrency(s?.khataCollected ?? 0)} collected`}
                icon={Wallet} color="text-red-400" bg="bg-red-900/20"
              />
            </div>
          </div>

          {/* ── Trend Chart ── */}
          {data && data.trend.length > 0 && (
            <div className="card p-4 overflow-hidden">
              <p className="text-sm font-medium text-slate-100 mb-4">Revenue & Profit Trend</p>
              <div className="w-full overflow-x-auto no-scrollbar">
                <div className="min-w-[480px]">
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={data.trend}>
                      <defs>
                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34d399" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#818cf8" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2230" />
                      <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false}
                        tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{ background: '#16191f', border: '1px solid #334155', borderRadius: '8px' }}
                        labelStyle={{ color: '#94a3b8' }}
                        formatter={(v) => formatCurrency(Number(v))}
                      />
                      <Area type="monotone" dataKey="salesRevenue" stroke="#34d399" strokeWidth={2} fill="url(#revGrad)" name="Revenue" />
                      <Area type="monotone" dataKey="netProfit" stroke="#818cf8" strokeWidth={2} fill="url(#profGrad)" name="Net Profit" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* ── Branch Comparison ── */}
          {role === 'SUPER_ADMIN' && data && data.byBranch.length > 1 && !selectedBranch && (
            <div className="card p-4 overflow-hidden">
              <p className="text-sm font-medium text-slate-100 mb-4">Branch Comparison</p>
              <div className="w-full overflow-x-auto no-scrollbar">
                <div className="min-w-[480px]">
                  <ResponsiveContainer width="100%" height={Math.max(160, data.byBranch.length * 55)}>
                    <BarChart data={data.byBranch} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2230" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false}
                        tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="branchName" tick={{ fill: '#94a3b8', fontSize: 12 }}
                        tickLine={false} axisLine={false} width={110} />
                      <Tooltip
                        contentStyle={{ background: '#16191f', border: '1px solid #334155', borderRadius: '8px' }}
                        formatter={(v) => formatCurrency(Number(v))}
                      />
                      <Legend />
                      <Bar dataKey="salesRevenue" fill="#34d399" name="Revenue" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="netProfit" fill="#818cf8" name="Net Profit" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left py-2 text-xs text-slate-500 font-medium whitespace-nowrap">Branch</th>
                      <th className="text-right py-2 text-xs text-slate-500 font-medium whitespace-nowrap">Revenue</th>
                      <th className="text-right py-2 text-xs text-slate-500 font-medium whitespace-nowrap">Gross Profit</th>
                      <th className="text-right py-2 text-xs text-slate-500 font-medium whitespace-nowrap">Net Profit</th>
                      <th className="text-right py-2 text-xs text-slate-500 font-medium whitespace-nowrap">Procurement</th>
                      <th className="text-right py-2 text-xs text-slate-500 font-medium whitespace-nowrap">Txns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byBranch.map((b) => (
                      <tr key={b.branchId} className="border-b border-slate-800/50">
                        <td className="py-2 text-slate-300 whitespace-nowrap">{b.branchName}</td>
                        <td className="py-2 text-right text-emerald-400 whitespace-nowrap">{formatCurrency(b.salesRevenue)}</td>
                        <td className="py-2 text-right text-blue-400 whitespace-nowrap">{formatCurrency(b.grossProfit)}</td>
                        <td className={`py-2 text-right font-bold whitespace-nowrap ${b.netProfit >= 0 ? 'text-violet-400' : 'text-red-400'}`}>
                          {formatCurrency(b.netProfit)}
                        </td>
                        <td className="py-2 text-right text-amber-400 whitespace-nowrap">{formatCurrency(b.procurementCost)}</td>
                        <td className="py-2 text-right text-slate-400 whitespace-nowrap">{b.txCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* ── Product-wise Breakdown ── */}
          {data && data.byProduct.length > 0 && (
            <div className="card p-4">
              <p className="text-sm font-medium text-slate-100 mb-3">Product-wise Sales</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left py-2 px-3 text-xs text-slate-500 font-medium">Product</th>
                      <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Qty Sold</th>
                      <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Revenue</th>
                      <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Gross Profit</th>
                      <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Margin</th>
                      <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Transactions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byProduct.map((p) => {
                      const unit = p.unitType === 'Liquid' ? 'L' : p.unitType === 'Weight' ? 'kg' : 'pcs'
                      const margin = p.revenue > 0 ? Math.round((p.grossProfit / p.revenue) * 100) : 0
                      return (
                        <tr key={`${p.productId}:${p.variantId}`} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                          <td className="py-2.5 px-3 text-slate-200 font-medium">
                            {p.productName}
                            {p.sizeLabel && <span className="text-slate-500 text-xs ml-1.5">{p.sizeLabel}</span>}
                          </td>
                          <td className="py-2.5 px-3 text-right text-cyan-400 font-bold">
                            {p.qtySold.toFixed(p.unitType === 'Fixed' ? 0 : 1)} {unit}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                            {formatCurrency(p.revenue)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-bold ${p.grossProfit >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                            {formatCurrency(p.grossProfit)}
                          </td>
                          <td className={`py-2.5 px-3 text-right text-sm ${margin >= 0 ? 'text-slate-400' : 'text-red-400'}`}>
                            {margin}%
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-500">{p.txCount}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-700 bg-slate-800/30">
                      <td className="py-2 px-3 text-xs text-slate-400 font-medium">Total</td>
                      <td className="py-2 px-3 text-right text-cyan-400 font-bold text-xs">—</td>
                      <td className="py-2 px-3 text-right text-emerald-400 font-bold text-xs">
                        {formatCurrency(data.byProduct.reduce((s, p) => s + p.revenue, 0))}
                      </td>
                      <td className="py-2 px-3 text-right text-blue-400 font-bold text-xs">
                        {formatCurrency(data.byProduct.reduce((s, p) => s + p.grossProfit, 0))}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
