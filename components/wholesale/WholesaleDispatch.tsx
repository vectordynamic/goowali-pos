'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Truck, Check, X, ChevronDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface FixedRate {
  productId: string
  variantId: string
  lockedRate: number
}

interface Customer {
  _id: string
  name: string
  phone: string
  location?: string
  paikariConfig: {
    deliveryMethod: 'Pickup' | 'Send'
    dailyRequirementLiters: number
    fixedProductRates: FixedRate[]
  }
  khata: { currentDue: number }
}

interface DispatchItem {
  productId: string
  variantId: string
  quantity: number
  rateApplied: number
  skipped: boolean
  productName: string
}

export default function WholesaleDispatch({ branchId }: { branchId: string }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [dispatching, setDispatching] = useState<Record<string, boolean>>({})
  const [items, setItems] = useState<Record<string, DispatchItem[]>>({})

  useEffect(() => {
    fetch('/api/customers?type=Paikari')
      .then((r) => r.json())
      .then((data: Customer[]) => {
        setCustomers(data)
        // Pre-fill dispatch items from paikariConfig
        const init: Record<string, DispatchItem[]> = {}
        for (const c of data) {
          init[c._id] = c.paikariConfig.fixedProductRates.map((r) => ({
            productId: r.productId,
            variantId: r.variantId,
            quantity: c.paikariConfig.dailyRequirementLiters,
            rateApplied: r.lockedRate,
            skipped: false,
            productName: `Product ${r.productId.slice(-4)}`
          }))
        }
        setItems(init)
      })
      .catch(() => toast.error('Failed to load wholesale customers'))
      .finally(() => setLoading(false))
  }, [])

  function toggleSkip(customerId: string, idx: number) {
    setItems((prev) => ({
      ...prev,
      [customerId]: prev[customerId].map((item, i) =>
        i === idx ? { ...item, skipped: !item.skipped } : item
      )
    }))
  }

  function updateQty(customerId: string, idx: number, qty: number) {
    setItems((prev) => ({
      ...prev,
      [customerId]: prev[customerId].map((item, i) =>
        i === idx ? { ...item, quantity: Math.max(0, qty) } : item
      )
    }))
  }

  async function handleDispatch(customer: Customer) {
    const customerItems = items[customer._id]
    if (!customerItems || customerItems.every((i) => i.skipped)) {
      toast('All items skipped — nothing to dispatch')
      return
    }

    setDispatching((p) => ({ ...p, [customer._id]: true }))

    const res = await fetch(`/api/customers/${customer._id}?action=dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId, items: customerItems })
    })

    setDispatching((p) => ({ ...p, [customer._id]: false }))

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Dispatch failed')
      return
    }

    const data = await res.json()
    toast.success(`Dispatched to ${customer.name}`)

    // Update customer's due in UI
    setCustomers((prev) =>
      prev.map((c) =>
        c._id === customer._id
          ? { ...c, khata: data.customer.khata }
          : c
      )
    )
  }

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>

  if (customers.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <Truck className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No wholesale customers registered</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 max-w-4xl">
      {customers.map((customer) => {
        const customerItems = items[customer._id] ?? []
        const subtotal = customerItems
          .filter((i) => !i.skipped)
          .reduce((s, i) => s + i.quantity * i.rateApplied, 0)

        return (
          <div key={customer._id} className="card overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-slate-800/50 flex items-center justify-between border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-100">{customer.name}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    customer.paikariConfig.deliveryMethod === 'Send'
                      ? 'bg-blue-900/50 text-blue-400'
                      : 'bg-slate-700 text-slate-400'
                  }`}>
                    {customer.paikariConfig.deliveryMethod}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {customer.phone}
                  {customer.location && ` · ${customer.location}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Current Due</p>
                <p className={`text-sm font-bold ${
                  customer.khata.currentDue > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  {formatCurrency(customer.khata.currentDue)}
                </p>
              </div>
            </div>

            {/* Items */}
            <div className="p-4 space-y-2">
              {customerItems.length === 0 ? (
                <p className="text-xs text-slate-500">No fixed rates configured</p>
              ) : (
                customerItems.map((item, idx) => (
                  <div key={idx} className={`flex items-center gap-3 rounded-lg p-2.5 ${
                    item.skipped ? 'opacity-40' : 'bg-slate-800/30'
                  }`}>
                    <button
                      onClick={() => toggleSkip(customer._id, idx)}
                      className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
                        item.skipped
                          ? 'border-slate-600 bg-transparent'
                          : 'bg-emerald-600 border-emerald-600'
                      }`}
                    >
                      {!item.skipped && <Check className="w-3 h-3 text-white" />}
                    </button>

                    <span className="text-sm text-slate-300 flex-1">{item.productName}</span>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateQty(customer._id, idx, Number(e.target.value))}
                        disabled={item.skipped}
                        className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-center text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-500">L</span>
                      <span className="text-xs text-slate-400 w-16 text-right">
                        @৳{item.rateApplied}
                      </span>
                      <span className="text-xs font-medium text-slate-200 w-16 text-right">
                        {formatCurrency(item.quantity * item.rateApplied)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 pb-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Dispatch Total</p>
                <p className="text-base font-bold text-slate-100">{formatCurrency(subtotal)}</p>
              </div>
              <button
                onClick={() => handleDispatch(customer)}
                disabled={dispatching[customer._id]}
                className="btn-primary flex items-center gap-1.5"
              >
                <Truck className="w-3.5 h-3.5" />
                {dispatching[customer._id] ? 'Dispatching…' : 'Dispatch'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
