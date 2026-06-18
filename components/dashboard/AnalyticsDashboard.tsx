'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts'
import { TrendingUp, DollarSign, Wallet, Receipt, GitBranch, RefreshCw } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Role } from '@/types'

interface Props {
  role: Role
}

interface Branch {
  _id: string
  name: string
}

interface Summary {
  totalRevenue: number
  totalCashCollected: number
  totalNetProfit: number
  totalKhataAdded: number
  txCount: number
}

interface TrendPoint {
  _id: string
  revenue: number
  profit: number
  count: number
}

interface TypeBreakdown {
  _id: string
  total: number
  count: number
}

interface BranchBreakdown {
  branchId: string
  branchName: string
  revenue: number
  profit: number
  txCount: number
}

interface Analytics {
  summary: Summary
  trend: TrendPoint[]
  byType: TypeBreakdown[]
  byBranch: BranchBreakdown[]
  overrides: unknown[]
  totalOutstandingKhata: number
  visibleBranches: Branch[]
}

type Preset = 'today' | 'week' | 'month' | 'custom'

function getPresetRange(preset: Preset): { from: string; to: string } {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  if (preset === 'today') {
    const t = fmt(now)
    return { from: t, to: t }
  }
  if (preset === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - 6)
    return { from: fmt(start), to: fmt(now) }
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: fmt(start), to: fmt(now) }
  }
  return { from: '', to: '' }
}

export default function AnalyticsDashboard({ role }: Props) {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('month')
  const [dateRange, setDateRange] = useState(getPresetRange('month'))
  const [selectedBranch, setSelectedBranch] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (dateRange.from) params.set('from', dateRange.from)
    if (dateRange.to) params.set('to', dateRange.to)
    if (selectedBranch) params.set('branchId', selectedBranch)

    fetch(`/api/analytics?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dateRange.from, dateRange.to, selectedBranch])

  useEffect(() => { load() }, [load])

  function applyPreset(p: Preset) {
    setPreset(p)
    if (p !== 'custom') {
      setDateRange(getPresetRange(p))
    }
  }

  const s = data?.summary
  const visibleBranches = data?.visibleBranches ?? []

  const presets: Array<{ key: Preset; label: string }> = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Last 7 days' },
    { key: 'month', label: 'This month' },
    { key: 'custom', label: 'Custom' }
  ]

  const statCards = [
    {
      label: 'Total Revenue',
      value: formatCurrency(s?.totalRevenue ?? 0),
      sub: `${s?.txCount ?? 0} transactions`,
      icon: DollarSign,
      color: 'text-emerald-400',
      bg: 'bg-emerald-900/20'
    },
    {
      label: 'Net Profit',
      value: formatCurrency(s?.totalNetProfit ?? 0),
      sub: s && s.totalRevenue > 0
        ? `${Math.round((s.totalNetProfit / s.totalRevenue) * 100)}% margin`
        : '—',
      icon: TrendingUp,
      color: 'text-blue-400',
      bg: 'bg-blue-900/20'
    },
    {
      label: 'Cash Collected',
      value: formatCurrency(s?.totalCashCollected ?? 0),
      sub: `৳${formatCurrency(s?.totalKhataAdded ?? 0)} added to due`,
      icon: Receipt,
      color: 'text-violet-400',
      bg: 'bg-violet-900/20'
    },
    {
      label: 'Outstanding Due',
      value: formatCurrency(data?.totalOutstandingKhata ?? 0),
      sub: 'Total khata balance',
      icon: Wallet,
      color: 'text-amber-400',
      bg: 'bg-amber-900/20'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Branch selector — SUPER_ADMIN only */}
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

        {/* Preset quick filters */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                preset === p.key
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom date range — only shown when preset=custom */}
        {preset === 'custom' && (
          <>
            <input
              type="date"
              className="input-base w-auto"
              value={dateRange.from}
              onChange={(e) => setDateRange((p) => ({ ...p, from: e.target.value }))}
            />
            <span className="text-slate-500 text-sm">to</span>
            <input
              type="date"
              className="input-base w-auto"
              value={dateRange.to}
              onChange={(e) => setDateRange((p) => ({ ...p, to: e.target.value }))}
            />
          </>
        )}

        <button
          onClick={load}
          className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors ml-auto"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Context label */}
      {role === 'SUPER_ADMIN' && (
        <p className="text-xs text-slate-600">
          Showing:{' '}
          <span className="text-slate-500">
            {selectedBranch
              ? visibleBranches.find((b) => b._id === selectedBranch)?.name ?? 'Selected branch'
              : 'All branches'}
          </span>
          {dateRange.from && (
            <> · {dateRange.from}{dateRange.to !== dateRange.from && ` → ${dateRange.to}`}</>
          )}
        </p>
      )}

      {loading ? (
        <div className="text-slate-500 text-sm py-8 text-center">Loading analytics…</div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((card) => (
              <div key={card.label} className="stat-card">
                <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center mb-2`}>
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
                <p className="text-xs text-slate-500">{card.label}</p>
                <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                {card.sub && <p className="text-xs text-slate-600 mt-0.5">{card.sub}</p>}
              </div>
            ))}
          </div>

          {/* Revenue & profit trend */}
          {data && data.trend.length > 0 && (
            <div className="card p-4">
              <p className="text-sm font-medium text-slate-100 mb-4">Revenue & Profit Trend</p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.trend}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2230" />
                  <XAxis dataKey="_id" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{ background: '#16191f', border: '1px solid #334155', borderRadius: '8px' }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(v) => formatCurrency(Number(v))}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#34d399" strokeWidth={2} fill="url(#revGrad)" name="Revenue" />
                  <Area type="monotone" dataKey="profit" stroke="#60a5fa" strokeWidth={2} fill="url(#profGrad)" name="Profit" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per-branch comparison — SUPER_ADMIN only, multiple branches */}
          {role === 'SUPER_ADMIN' && data && data.byBranch.length > 1 && !selectedBranch && (
            <div className="card p-4">
              <p className="text-sm font-medium text-slate-100 mb-4">Branch Comparison</p>
              <ResponsiveContainer width="100%" height={Math.max(160, data.byBranch.length * 55)}>
                <BarChart data={data.byBranch} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2230" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="branchName"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={{ background: '#16191f', border: '1px solid #334155', borderRadius: '8px' }}
                    formatter={(v) => formatCurrency(Number(v))}
                  />
                  <Legend />
                  <Bar dataKey="revenue" fill="#34d399" name="Revenue" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="profit" fill="#60a5fa" name="Profit" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>

              <table className="w-full mt-4 text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left py-2 text-xs text-slate-500 font-medium">Branch</th>
                    <th className="text-right py-2 text-xs text-slate-500 font-medium">Revenue</th>
                    <th className="text-right py-2 text-xs text-slate-500 font-medium">Profit</th>
                    <th className="text-right py-2 text-xs text-slate-500 font-medium">Margin</th>
                    <th className="text-right py-2 text-xs text-slate-500 font-medium">Txns</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byBranch.map((b) => (
                    <tr key={b.branchId} className="border-b border-slate-800/50">
                      <td className="py-2 text-slate-300">{b.branchName}</td>
                      <td className="py-2 text-right text-emerald-400">{formatCurrency(b.revenue)}</td>
                      <td className="py-2 text-right text-blue-400">{formatCurrency(b.profit)}</td>
                      <td className="py-2 text-right text-slate-400">
                        {b.revenue > 0 ? `${Math.round((b.profit / b.revenue) * 100)}%` : '—'}
                      </td>
                      <td className="py-2 text-right text-slate-400">{b.txCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Transaction type breakdown */}
          {data && data.byType.length > 0 && (
            <div className="card p-4">
              <p className="text-sm font-medium text-slate-100 mb-3">By Transaction Type</p>
              <div className="space-y-2">
                {data.byType
                  .sort((a, b) => b.total - a.total)
                  .map((t) => (
                    <div key={t._id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">{t._id}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-slate-500 text-xs">{t.count} txns</span>
                        <span className="font-medium text-slate-200 w-24 text-right">
                          {formatCurrency(t.total)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
