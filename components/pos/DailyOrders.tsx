'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Check, X, ClipboardList, RefreshCw, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

type PaymentType = 'cash' | 'partial' | 'credit'

interface TakenForm {
  customerId: string
  paymentType: PaymentType
  cashPaid: string
}

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
  transactionId?: string
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
  const [takenForm, setTakenForm] = useState<TakenForm | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/daily-orders?branchId=${branchId}&date=${date}`)
      .then((r) => r.json())
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Failed to load regular orders'))
      .finally(() => setLoading(false))
  }, [branchId, date])

  useEffect(() => { load() }, [load])

  function openTakenForm(customerId: string) {
    setTakenForm({ customerId, paymentType: 'credit', cashPaid: '' })
  }

  async function act(customerId: string, status: 'taken' | 'skipped', paymentType?: PaymentType, cashPaid?: number) {
    setActing((p) => ({ ...p, [customerId]: true }))

    const res = await fetch('/api/daily-orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId, date, customerId, status, paymentType, cashPaid })
    })

    setActing((p) => ({ ...p, [customerId]: false }))

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Failed')
      return
    }

    setLogs((prev) =>
      prev.map((l) => l.customerId._id === customerId ? { ...l, status } : l)
    )

    if (status === 'taken') {
      const label = paymentType === 'cash' ? 'Cash sale' : paymentType === 'partial' ? 'Partial payment' : 'Credit sale'
      toast.success(`Taken — ${label} recorded`)
      setTakenForm(null)
      onTaken?.()
    }
  }

  async function confirmTaken() {
    if (!takenForm) return
    const { customerId, paymentType, cashPaid } = takenForm
    if (paymentType === 'partial') {
      const amt = Number(cashPaid)
      if (!amt || amt <= 0) { toast.error('Enter cash amount received'); return }
      await act(customerId, 'taken', paymentType, amt)
    } else {
      await act(customerId, 'taken', paymentType)
    }
  }

  if (loading) {
    return <div className="text-xs text-slate-500 py-3">Loading regular orders…</div>
  }

  if (logs.length === 0) return null

  const pending = logs.filter((l) => l.status === 'pending').length
  const taken = logs.filter((l) => l.status === 'taken').length
  const skipped = logs.filter((l) => l.status === 'skipped').length

  return (
    <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
        <ClipboardList className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-semibold text-slate-200">Regular Orders</span>
        <div className="flex items-center gap-3 ml-auto text-xs">
          {pending > 0 && (
            <span className="text-amber-400 font-medium">{pending} pending</span>
          )}
          {taken > 0 && <span className="text-emerald-400">{taken} taken</span>}
          {skipped > 0 && <span className="text-slate-500">{skipped} skipped</span>}
          <button
            onClick={load}
            className="p-1 text-slate-600 hover:text-slate-300 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-slate-800/60">
        {logs.map((log) => {
          const c = log.customerId
          const rates = c.paikariConfig?.fixedProductRates ?? []
          const dailyTotal = rates.reduce((s, r) => s + r.lockedRate * (r.dailyQty || 1), 0)
          const busy = acting[c._id]

          return (
            <div
              key={log._id}
              className={`flex flex-col gap-1 px-4 py-3 transition-colors ${
                log.status === 'taken' ? 'bg-emerald-900/10' :
                log.status === 'skipped' ? 'opacity-40' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Status pulse */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  log.status === 'taken' ? 'bg-emerald-500' :
                  log.status === 'skipped' ? 'bg-slate-600' :
                  !log.stockOk ? 'bg-rose-500' :
                  'bg-amber-400 animate-pulse'
                }`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-100 truncate">{c.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      c.customerType === 'Paikari'
                        ? 'bg-amber-900/30 text-amber-400'
                        : 'bg-blue-900/30 text-blue-400'
                    }`}>
                      {c.customerType}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {rates.length} item{rates.length !== 1 ? 's' : ''} ·{' '}
                    <span className="text-slate-300 font-medium">{formatCurrency(dailyTotal)}/day</span>
                    {c.khata.currentDue > 0 && (
                      <span className="text-rose-400 ml-2">
                        due {formatCurrency(c.khata.currentDue)}
                      </span>
                    )}
                  </p>
                </div>

                {/* Action / resolved state */}
                {log.status === 'pending' ? (
                  takenForm?.customerId === c._id ? (
                    <button
                      onClick={() => setTakenForm(null)}
                      className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        disabled={busy}
                        onClick={() => act(c._id, 'skipped')}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-400 bg-slate-800 border border-slate-700 rounded-md hover:text-rose-400 hover:border-rose-800/60 transition-colors disabled:opacity-40"
                      >
                        <X className="w-3 h-3" />
                        Not Taken
                      </button>
                      <button
                        disabled={busy || !log.stockOk}
                        onClick={() => openTakenForm(c._id)}
                        title={!log.stockOk ? 'Not enough stock' : undefined}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                          log.stockOk
                            ? 'text-white bg-emerald-600 border-emerald-500 hover:bg-emerald-500 disabled:opacity-40'
                            : 'text-slate-500 bg-slate-800 border-slate-700 cursor-not-allowed opacity-50'
                        }`}
                      >
                        Taken
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  )
                ) : (
                  <span className={`text-xs font-medium flex-shrink-0 ${
                    log.status === 'taken' ? 'text-emerald-400' : 'text-slate-600'
                  }`}>
                    {log.status === 'taken' ? 'Taken ✓' : 'Not taken'}
                  </span>
                )}
              </div>

              {/* Stock warning */}
              {log.status === 'pending' && !log.stockOk && (
                <div className="ml-5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {log.stockIssues.map((issue, i) => (
                    <span key={i} className="text-xs text-rose-400">
                      ⚠ {issue}
                    </span>
                  ))}
                </div>
              )}

              {/* Payment selector — appears when manager taps Taken */}
              {log.status === 'pending' && takenForm?.customerId === c._id && (
                <div className="ml-5 mt-1 p-3 rounded-lg bg-slate-800/60 border border-slate-700/60 space-y-3">
                  <p className="text-xs text-slate-400 font-medium">How is {c.name} paying?</p>

                  {/* Payment type toggle */}
                  <div className="flex gap-2">
                    {([
                      { key: 'cash', label: 'Cash' },
                      { key: 'partial', label: 'Partial' },
                      { key: 'credit', label: 'Credit' },
                    ] as { key: PaymentType; label: string }[]).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setTakenForm({ ...takenForm, paymentType: key, cashPaid: '' })}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                          takenForm.paymentType === key
                            ? key === 'cash'
                              ? 'bg-emerald-600 border-emerald-500 text-white'
                              : key === 'partial'
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'bg-slate-600 border-slate-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Partial amount input */}
                  {takenForm.paymentType === 'partial' && (
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Cash received now (total: {formatCurrency(dailyTotal)})
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={dailyTotal}
                        className="input-base"
                        placeholder="0"
                        value={takenForm.cashPaid}
                        onChange={(e) => setTakenForm({ ...takenForm, cashPaid: e.target.value })}
                        autoFocus
                      />
                      {takenForm.cashPaid && Number(takenForm.cashPaid) < dailyTotal && (
                        <p className="text-xs text-amber-400 mt-1">
                          {formatCurrency(dailyTotal - Number(takenForm.cashPaid))} goes to due
                        </p>
                      )}
                    </div>
                  )}

                  {takenForm.paymentType === 'credit' && (
                    <p className="text-xs text-slate-500">
                      Full {formatCurrency(dailyTotal)} added to {c.name}'s due
                    </p>
                  )}
                  {takenForm.paymentType === 'cash' && (
                    <p className="text-xs text-slate-500">
                      {formatCurrency(dailyTotal)} collected as cash — no due added
                    </p>
                  )}

                  <button
                    onClick={confirmTaken}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-white bg-emerald-600 border border-emerald-500 rounded-md hover:bg-emerald-500 transition-colors disabled:opacity-40"
                  >
                    <Check className="w-3 h-3" />
                    {busy ? 'Recording…' : 'Confirm Taken'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
