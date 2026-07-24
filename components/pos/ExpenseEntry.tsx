'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Home, Zap, Fuel, Coffee, Package, Users, Truck, Wrench, FileQuestion, Plus, Check, Loader2, Wallet, UserRound
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { ExpenseCategory, ExpenseFundingSource } from '@/types'

interface Props {
  branchId: string
  userName: string
}

const CATEGORY_MAP: Record<ExpenseCategory, { label: string; icon: any; color: string }> = {
  'Rent': { label: 'ভাড়া', icon: Home, color: 'bg-emerald-100 text-emerald-600 border-emerald-200' },
  'Utilities': { label: 'ইউটিলিটি', icon: Zap, color: 'bg-amber-100 text-amber-600 border-amber-200' },
  'Fuel': { label: 'জ্বালানি', icon: Fuel, color: 'bg-orange-100 text-orange-600 border-orange-200' },
  'Food': { label: 'চা/নাস্তা', icon: Coffee, color: 'bg-rose-100 text-rose-600 border-rose-200' },
  'Supplies': { label: 'সাপ্লাই', icon: Package, color: 'bg-blue-100 text-blue-600 border-blue-200' },
  'Salary': { label: 'বেতন', icon: Users, color: 'bg-purple-100 text-purple-600 border-purple-200' },
  'Transport': { label: 'পরিবহন', icon: Truck, color: 'bg-cyan-100 text-cyan-600 border-cyan-200' },
  'Maintenance': { label: 'মেরামত', icon: Wrench, color: 'bg-stone-100 text-stone-600 border-stone-200' },
  'Other': { label: 'অন্যান্য', icon: FileQuestion, color: 'bg-gray-100 text-gray-600 border-gray-200' }
}

const CATEGORIES = Object.keys(CATEGORY_MAP) as ExpenseCategory[]

export default function ExpenseEntry({ branchId, userName }: Props) {
  const queryClient = useQueryClient()
  
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory | null>(null)
  const [fundingSource, setFundingSource] = useState<ExpenseFundingSource>('Shop Cash')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  // Fetch today's expenses
  const today = new Date().toISOString().split('T')[0]
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', branchId, today],
    queryFn: async () => {
      const res = await fetch(`/api/expenses?branchId=${branchId}&from=${today}&to=${today}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    }
  })

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId,
          amount: Number(amount),
          category,
          fundingSource,
          description
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to log expense')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', branchId] })
      setAmount('')
      setCategory(null)
      setDescription('')
      setError('')
    },
    onError: (err: any) => {
      setError(err.message)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) {
      setError('সঠিক পরিমাণ লিখুন')
      return
    }
    if (!category) {
      setError('খরচের খাত নির্বাচন করুন')
      return
    }
    if (!description.trim()) {
      setError('খরচের বিবরণ লিখুন')
      return
    }
    mutate()
  }

  const todayTotal = expenses.reduce((sum: number, exp: any) => sum + exp.financials.totalBill, 0)

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 md:p-6 bg-gray-50 min-h-[calc(100vh-64px)] overflow-y-auto">
      
      {/* Left side: Form */}
      <div className="w-full lg:w-7/12 xl:w-1/2 space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-blue-600 px-6 py-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Plus className="w-6 h-6" />
              নতুন খরচ এন্ট্রি
            </h2>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100 font-medium">
                {error}
              </div>
            )}
            
            {/* Amount */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">পরিমাণ (টাকা)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-400">৳</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full pl-10 pr-4 py-4 text-3xl font-bold rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                  min="1"
                  step="any"
                />
              </div>
            </div>

            {/* Category Grid */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">খরচের খাত</label>
              <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
                {CATEGORIES.map(cat => {
                  const conf = CATEGORY_MAP[cat]
                  const isActive = category === cat
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={cn(
                        'flex flex-col items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all min-h-[80px]',
                        isActive
                          ? 'border-blue-600 bg-blue-50 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      <div className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center border',
                        isActive ? 'bg-blue-600 text-white border-blue-600' : conf.color
                      )}>
                        <conf.icon className="w-5 h-5" />
                      </div>
                      <span className={cn(
                        'text-xs font-bold text-center leading-tight',
                        isActive ? 'text-blue-700' : 'text-gray-600'
                      )}>
                        {conf.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Funding Source Toggle */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-sm font-bold text-gray-700">টাকা কোথা থেকে দেওয়া হয়েছে?</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFundingSource('Shop Cash')}
                  className={cn(
                    'flex items-center justify-center gap-2 px-4 py-3 border-2 rounded-xl text-sm font-bold transition-all min-h-[44px]',
                    fundingSource === 'Shop Cash'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                  )}
                >
                  <Wallet className="w-5 h-5" />
                  দোকানের ক্যাশ থেকে
                </button>
                <button
                  type="button"
                  onClick={() => setFundingSource('Owner Funded')}
                  className={cn(
                    'flex items-center justify-center gap-2 px-4 py-3 border-2 rounded-xl text-sm font-bold transition-all min-h-[44px]',
                    fundingSource === 'Owner Funded'
                      ? 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                  )}
                >
                  <UserRound className="w-5 h-5" />
                  মালিক দিয়েছেন
                </button>
              </div>
              <p className="text-[11px] text-gray-500 font-medium px-1 mt-1.5">
                {fundingSource === 'Shop Cash' 
                  ? '* হিসাব মেলানোর সময় এই টাকা ক্যাশ বাক্স থেকে কমবে।' 
                  : '* এই টাকা ক্যাশ বাক্স থেকে কমবে না, তবে লাভের হিসাব থেকে বাদ যাবে।'}
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-sm font-bold text-gray-700">বিবরণ</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="যেমন: ১ বস্তা চিনি পরিবহন খরচ"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-lg py-4 rounded-xl transition-all shadow-sm active:scale-[0.99] min-h-[56px]"
            >
              {isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : <Check className="w-6 h-6" />}
              {isPending ? 'যোগ হচ্ছে...' : 'খরচ যোগ করুন'}
            </button>
          </form>
        </div>
      </div>

      {/* Right side: Today's list */}
      <div className="w-full lg:w-5/12 xl:w-1/2 space-y-4">
        {/* Total Card */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white shadow-sm flex flex-col justify-between overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Wallet className="w-32 h-32" />
          </div>
          <div className="relative z-10 space-y-1">
            <p className="text-gray-400 font-medium text-sm">আজকের মোট খরচ</p>
            <p className="text-4xl font-black">{formatCurrency(todayTotal)}</p>
          </div>
          <div className="relative z-10 mt-6 flex items-center justify-between text-sm text-gray-300">
            <span>{expenses.length} টি এন্ট্রি</span>
            <span className="bg-gray-800/50 px-3 py-1 rounded-lg backdrop-blur-sm border border-gray-700">
              {new Date().toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>

        {/* List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-800">আজকের খরচের তালিকা</h3>
          </div>
          <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
            {isLoading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : expenses.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <p>আজ কোনো খরচ নেই</p>
              </div>
            ) : (
              expenses.map((exp: any) => {
                const conf = CATEGORY_MAP[exp.expenseCategory as ExpenseCategory] || CATEGORY_MAP['Other']
                const isOwner = exp.expenseFundingSource === 'Owner Funded'
                return (
                  <div key={exp._id} className="p-4 hover:bg-gray-50 transition-colors flex items-center gap-4">
                    <div className={cn('w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 border', conf.color)}>
                      <conf.icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-gray-900 truncate">
                          {exp.notes?.split('\n')[0] || conf.label}
                        </p>
                        <p className="font-bold text-gray-900 flex-shrink-0">
                          {formatCurrency(exp.financials.totalBill)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap', conf.color)}>
                          {conf.label}
                        </span>
                        {isOwner ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 whitespace-nowrap">
                            👤 মালিক দিয়েছেন
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">
                            💵 ক্যাশ থেকে
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400 truncate hidden sm:block">
                          • {new Date(exp.createdAt).toLocaleTimeString('bn-BD')}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
