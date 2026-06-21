'use client'

import { useState } from 'react'
import { X, UserPlus, User } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency } from '@/lib/utils'
import type { CustomerSuggestion, PendingCustomer } from './POSTerminal'

interface CartItem {
  productId: string
  variantId: string
  productName: string
  quantity: number
  rateApplied: number
}

interface Props {
  branchId: string
  cart: CartItem[]
  cartTotal: number
  selectedCustomer: CustomerSuggestion | null
  pendingCustomer: PendingCustomer | null
  onClose: () => void
  onSuccess: () => void
}

type PaymentMode = 'Cash Sale' | 'Credit Sale' | 'Partial Payment'

export default function CheckoutModal({
  branchId,
  cart,
  cartTotal,
  selectedCustomer,
  pendingCustomer,
  onClose,
  onSuccess,
}: Props) {
  const [mode, setMode] = useState<PaymentMode>('Cash Sale')
  const [cashPaid, setCashPaid] = useState(cartTotal)
  const [submitting, setSubmitting] = useState(false)

  const hasCustomer = selectedCustomer || pendingCustomer
  const change = cashPaid - cartTotal
  const addedToKhata = mode === 'Cash Sale' ? 0 : cartTotal - (mode === 'Partial Payment' ? cashPaid : 0)

  async function handleCheckout() {
    if (mode !== 'Cash Sale' && !hasCustomer) {
      toast.error('Enter a customer phone number for credit/partial payment')
      return
    }

    setSubmitting(true)

    let customerId: string | null = selectedCustomer?._id ?? null

    // Auto-create customer when phone was entered but no existing customer selected
    if (!customerId && pendingCustomer) {
      const createRes = await fetch('/api/customers?quick=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pendingCustomer.name || pendingCustomer.phone,
          phone: pendingCustomer.phone,
          customerType: pendingCustomer.customerType,
        }),
      })

      if (!createRes.ok) {
        const err = await createRes.json()
        // If phone conflict — existing customer somehow — just proceed without customer
        if (createRes.status === 409 && err.existing?._id) {
          customerId = err.existing._id
        } else {
          toast.error(err.error ?? 'Failed to create customer account')
          setSubmitting(false)
          return
        }
      } else {
        const newCustomer = await createRes.json()
        customerId = newCustomer._id
      }
    }

    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId,
        customerId,
        transactionType: mode,
        items: cart.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          rateApplied: i.rateApplied,
        })),
        cashPaid: mode === 'Credit Sale' ? 0 : cashPaid,
      }),
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
          {/* Customer */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Customer</label>
            {selectedCustomer ? (
              <div className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-2">
                <User className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-100 truncate">{selectedCustomer.name}</p>
                  <p className="text-xs text-slate-500">
                    {selectedCustomer.phone}
                    {selectedCustomer.khata.currentDue > 0 && (
                      <span className="ml-2 text-amber-400">Due: {formatCurrency(selectedCustomer.khata.currentDue)}</span>
                    )}
                  </p>
                </div>
              </div>
            ) : pendingCustomer ? (
              <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-800/30 rounded-lg px-3 py-2">
                <UserPlus className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-emerald-400 mb-0.5">New account will be created</p>
                  <p className="text-sm text-slate-100 truncate">
                    {pendingCustomer.name || pendingCustomer.phone}
                  </p>
                  {pendingCustomer.name && (
                    <p className="text-xs text-slate-500">{pendingCustomer.phone}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic px-1">Anonymous sale — no customer linked</p>
            )}
          </div>

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
