'use client'

import { useState, useEffect } from 'react'
import { X, Search, User } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency } from '@/lib/utils'

interface CartItem {
  productId: string
  variantId: string
  productName: string
  quantity: number
  rateApplied: number
}

interface Customer {
  _id: string
  name: string
  phone: string
  customerType: string
  khata: { currentDue: number }
}

interface Props {
  branchId: string
  cart: CartItem[]
  cartTotal: number
  onClose: () => void
  onSuccess: () => void
}

type PaymentMode = 'Cash Sale' | 'Credit Sale' | 'Partial Payment'

export default function CheckoutModal({ branchId, cart, cartTotal, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<PaymentMode>('Cash Sale')
  const [cashPaid, setCashPaid] = useState(cartTotal)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (customerSearch.length < 2) {
      setCustomers([])
      return
    }
    const t = setTimeout(() => {
      fetch(`/api/customers?search=${customerSearch}`)
        .then((r) => r.json())
        .then(setCustomers)
    }, 300)
    return () => clearTimeout(t)
  }, [customerSearch])

  const change = cashPaid - cartTotal
  const addedToKhata = mode === 'Cash Sale' ? 0 : cartTotal - (mode === 'Partial Payment' ? cashPaid : 0)

  async function handleCheckout() {
    if (mode !== 'Cash Sale' && !selectedCustomer) {
      toast.error('Select a customer for credit/partial payment')
      return
    }

    setSubmitting(true)

    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId,
        customerId: selectedCustomer?._id ?? null,
        transactionType: mode,
        items: cart.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          rateApplied: i.rateApplied
        })),
        cashPaid: mode === 'Credit Sale' ? 0 : cashPaid
      })
    })

    setSubmitting(false)

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Checkout failed')
      return
    }

    onSuccess()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">Checkout</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Order summary */}
          <div className="bg-slate-800/50 rounded-lg p-3 space-y-1.5">
            {cart.map((i) => (
              <div key={`${i.productId}:${i.variantId}`} className="flex justify-between text-sm">
                <span className="text-slate-400">
                  {i.productName} × {i.quantity}
                </span>
                <span className="text-slate-300">{formatCurrency(i.rateApplied * i.quantity)}</span>
              </div>
            ))}
            <div className="pt-1.5 border-t border-slate-700 flex justify-between font-bold">
              <span className="text-slate-100">Total</span>
              <span className="text-emerald-400">{formatCurrency(cartTotal)}</span>
            </div>
          </div>

          {/* Payment mode */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Payment Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Cash Sale', 'Credit Sale', 'Partial Payment'] as PaymentMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m)
                    if (m === 'Cash Sale') setCashPaid(cartTotal)
                    if (m === 'Credit Sale') setCashPaid(0)
                  }}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors border ${
                    mode === m
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Cash paid */}
          {mode !== 'Credit Sale' && (
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">Cash Received</label>
              <input
                type="number"
                className="input-base"
                value={cashPaid}
                onChange={(e) => setCashPaid(Number(e.target.value))}
                min={0}
              />
              {mode === 'Cash Sale' && change > 0 && (
                <p className="text-xs text-emerald-400 mt-1">Change: {formatCurrency(change)}</p>
              )}
            </div>
          )}

          {/* Due to khata */}
          {addedToKhata > 0 && (
            <p className="text-xs text-amber-400 bg-amber-900/20 rounded-lg px-3 py-2 border border-amber-800/30">
              {formatCurrency(addedToKhata)} will be added to customer khata
            </p>
          )}

          {/* Customer select (for credit/partial) */}
          {mode !== 'Cash Sale' && (
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">Customer</label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm text-slate-100">{selectedCustomer.name}</p>
                    <p className="text-xs text-slate-500">
                      Due: {formatCurrency(selectedCustomer.khata.currentDue)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    className="text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    className="input-base pl-8"
                    placeholder="Search by name or phone…"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                  />
                  {customers.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 card z-10 max-h-40 overflow-y-auto">
                      {customers.map((c) => (
                        <button
                          key={c._id}
                          onClick={() => {
                            setSelectedCustomer(c)
                            setCustomerSearch('')
                            setCustomers([])
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors"
                        >
                          <p className="text-sm text-slate-100">{c.name}</p>
                          <p className="text-xs text-slate-500">
                            {c.phone} · Due: {formatCurrency(c.khata.currentDue)}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={handleCheckout}
            disabled={submitting}
            className="btn-primary flex-1"
          >
            {submitting ? 'Processing…' : 'Confirm Sale'}
          </button>
        </div>
      </div>
    </div>
  )
}
