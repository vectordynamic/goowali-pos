'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Receipt, Wallet, UserRound, Filter, Calendar, Search, Home, Zap, Fuel, Coffee, Package, Users, Truck, Wrench, FileQuestion, ChevronDown
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell
} from 'recharts'
import { cn, formatCurrency } from '@/lib/utils'
import type { ExpenseCategory, ExpenseFundingSource, Role } from '@/types'

interface Branch { _id: string; name: string }
interface Props {
  role: Role
  branches: Branch[]
}

const CATEGORY_MAP: Record<ExpenseCategory, { label: string; icon: any; color: string; hex: string }> = {
  'Rent': { label: 'Rent', icon: Home, color: 'bg-emerald-100 text-emerald-600', hex: '#10b981' },
  'Utilities': { label: 'Utilities', icon: Zap, color: 'bg-amber-100 text-amber-600', hex: '#f59e0b' },
  'Fuel': { label: 'Fuel', icon: Fuel, color: 'bg-orange-100 text-orange-600', hex: '#f97316' },
  'Food': { label: 'Food/Tea', icon: Coffee, color: 'bg-rose-100 text-rose-600', hex: '#f43f5e' },
  'Supplies': { label: 'Supplies', icon: Package, color: 'bg-blue-100 text-blue-600', hex: '#3b82f6' },
  'Salary': { label: 'Salary', icon: Users, color: 'bg-purple-100 text-purple-600', hex: '#a855f7' },
  'Transport': { label: 'Transport', icon: Truck, color: 'bg-cyan-100 text-cyan-600', hex: '#06b6d4' },
  'Maintenance': { label: 'Maintenance', icon: Wrench, color: 'bg-stone-100 text-stone-600', hex: '#78716c' },
  'Other': { label: 'Other', icon: FileQuestion, color: 'bg-gray-100 text-gray-600', hex: '#6b7280' }
}
const CATEGORIES = Object.keys(CATEGORY_MAP) as ExpenseCategory[]

export default function ExpenseManager({ role, branches }: Props) {
  const [selectedBranch, setSelectedBranch] = useState<string>(branches.length === 1 ? branches[0]._id : '')
  
  const todayDate = new Date().toISOString().split('T')[0]
  const [fromDate, setFromDate] = useState(todayDate)
  const [toDate, setToDate] = useState(todayDate)
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | 'All'>('All')

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['admin-expenses', selectedBranch, fromDate, toDate],
    queryFn: async () => {
      if (role === 'SUPER_ADMIN' && !selectedBranch) return []
      const res = await fetch(`/api/expenses?branchId=${selectedBranch}&from=${fromDate}&to=${toDate}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!selectedBranch
  })

  // Client-side category filtering
  const filteredExpenses = useMemo(() => {
    if (selectedCategory === 'All') return expenses
    return expenses.filter((e: any) => e.expenseCategory === selectedCategory)
  }, [expenses, selectedCategory])

  // Summaries
  const summaries = useMemo(() => {
    let total = 0, shopCash = 0, ownerFunded = 0
    const catBreakdown: Record<string, number> = {}
    
    CATEGORIES.forEach(c => catBreakdown[c] = 0)

    filteredExpenses.forEach((e: any) => {
      const amt = e.financials.totalBill
      total += amt
      if (e.expenseFundingSource === 'Shop Cash') shopCash += amt
      if (e.expenseFundingSource === 'Owner Funded') ownerFunded += amt
      
      const cat = e.expenseCategory as string
      if (catBreakdown[cat] !== undefined) {
        catBreakdown[cat] += amt
      }
    })

    const chartData = CATEGORIES.map(cat => ({
      name: CATEGORY_MAP[cat].label,
      value: catBreakdown[cat],
      hex: CATEGORY_MAP[cat].hex
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value)

    return { total, shopCash, ownerFunded, chartData }
  }, [filteredExpenses])

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end justify-between bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Expenses</h1>
            <p className="text-sm text-gray-500">Track and manage operational costs</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {role === 'SUPER_ADMIN' && branches.length > 1 && (
            <div className="flex-1 sm:flex-none">
              <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
              >
                <option value="">Select Branch...</option>
                {branches.map((b) => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex-1 sm:flex-none">
            <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
            />
          </div>
          <div className="flex-1 sm:flex-none">
            <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
            />
          </div>
          <div className="flex-1 sm:flex-none">
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as any)}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
            >
              <option value="All">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_MAP[c].label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!selectedBranch ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Filter className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Select a Branch</h3>
          <p className="text-gray-500">Please select a branch to view expenses.</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                <Receipt className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Total Expenses</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(summaries.total)}</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Wallet className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Shop Cash</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(summaries.shopCash)}</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                <UserRound className="w-6 h-6 text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Owner Funded</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(summaries.ownerFunded)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart */}
            <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-6">Expense by Category</h3>
              {summaries.chartData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summaries.chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f1f5f9" />
                      <XAxis type="number" tickFormatter={(v) => `৳${v/1000}k`} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} stroke="#94a3b8" width={80} />
                      <RechartsTooltip 
                        formatter={(value: any) => [formatCurrency(Number(value) || 0), 'Amount']}
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {summaries.chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.hex} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-gray-400">
                  No data to display
                </div>
              )}
            </div>

            {/* List */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[400px]">
              <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-gray-900">Expense Log</h3>
                <span className="text-sm text-gray-500">{filteredExpenses.length} entries</span>
              </div>
              <div className="flex-1 overflow-y-auto p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-gray-400">Loading...</div>
                ) : filteredExpenses.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">No expenses found for this period.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredExpenses.map((exp: any) => {
                      const conf = CATEGORY_MAP[exp.expenseCategory as ExpenseCategory] || CATEGORY_MAP['Other']
                      const isOwner = exp.expenseFundingSource === 'Owner Funded'
                      return (
                        <div key={exp._id} className="p-4 hover:bg-gray-50 transition-colors flex items-center gap-4">
                          <div className={cn('w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0', conf.color)}>
                            <conf.icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-bold text-gray-900 truncate">{conf.label}</p>
                                <p className="text-sm text-gray-500 truncate">{exp.notes?.split('\n')[0]}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="font-bold text-gray-900">{formatCurrency(exp.financials.totalBill)}</p>
                                <p className="text-xs text-gray-400">
                                  {new Date(exp.createdAt).toLocaleDateString()} {new Date(exp.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              {isOwner ? (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 whitespace-nowrap">
                                  👤 Owner Funded
                                </span>
                              ) : (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 whitespace-nowrap">
                                  💵 Shop Cash
                                </span>
                              )}
                              <span className="text-xs text-gray-500 ml-auto">
                                Recorded by {exp.recordedBy?.name}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
