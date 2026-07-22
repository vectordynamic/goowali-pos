'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { BellRing, RefreshCw, Check, X, MapPin, Phone } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Role } from '@/types'
import { useAllProducts } from '@/lib/queries/useProducts'

interface FixedRate {
  productId: string
  variantId: string
  lockedRate: number
  dailyQty: number
}

interface PendingCustomer {
  _id: string
  name: string
  phone?: string
  location?: string
  approvalNote?: string
  approvalRequestedBy?: { name: string } | null
  registeredBranch?: { _id: string; name: string } | null
  paikariConfig: {
    deliveryMethod: 'Pickup' | 'Send'
    deliveryTime: string
    fixedProductRates: FixedRate[]
  }
}

interface Product {
  _id: string
  name: string
}

interface Props {
  role: Role
  assignedBranches: string[]
}

export default function CustomerApprovalManager({ role }: Props) {
  const { data: productsData } = useAllProducts()
  const products: Product[] = productsData ?? []

  const [customers, setCustomers] = useState<PendingCustomer[]>([])
  const [loading, setLoading] = useState(true)
  // Local, per-customer editable copy of rates/delivery admins can tweak before approving.
  const [drafts, setDrafts] = useState<Record<string, { rates: FixedRate[]; deliveryTime: string; deliveryMethod: 'Pickup' | 'Send' }>>({})
  const [acting, setActing] = useState<Record<string, boolean>>({})

  const productName = (id: string) => products.find((p) => p._id === id)?.name ?? id.slice(-6)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/customer-approvals')
      const data = await res.json()
      const list: PendingCustomer[] = Array.isArray(data) ? data : []
      setCustomers(list)
      setDrafts(
        Object.fromEntries(list.map((c) => [c._id, {
          rates: (c.paikariConfig?.fixedProductRates ?? []).map((r) => ({ ...r })),
          deliveryTime: c.paikariConfig?.deliveryTime ?? '06:00',
          deliveryMethod: c.paikariConfig?.deliveryMethod ?? 'Pickup'
        }]))
      )
    } catch {
      toast.error('Failed to load requests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function updateRate(customerId: string, idx: number, patch: Partial<FixedRate>) {
    setDrafts((prev) => ({
      ...prev,
      [customerId]: {
        ...prev[customerId],
        rates: prev[customerId].rates.map((r, i) => i === idx ? { ...r, ...patch } : r)
      }
    }))
  }
  function updateDelivery(customerId: string, patch: Partial<{ deliveryTime: string; deliveryMethod: 'Pickup' | 'Send' }>) {
    setDrafts((prev) => ({ ...prev, [customerId]: { ...prev[customerId], ...patch } }))
  }

  async function act(customerId: string, action: 'approve' | 'reject') {
    setActing((p) => ({ ...p, [customerId]: true }))
    const draft = drafts[customerId]
    const res = await fetch('/api/customer-approvals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId,
        action,
        ...(action === 'approve' ? {
          deliveryTime: draft.deliveryTime,
          deliveryMethod: draft.deliveryMethod,
          fixedProductRates: draft.rates.map((r) => ({
            productId: r.productId, variantId: r.variantId,
            lockedRate: Number(r.lockedRate), dailyQty: Number(r.dailyQty)
          }))
        } : {})
      }),
    })
    setActing((p) => ({ ...p, [customerId]: false }))
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Action failed')
      return
    }
    toast.success(action === 'approve' ? 'Approved & made permanent' : 'Request rejected')
    setCustomers((prev) => prev.filter((c) => c._id !== customerId))
  }

  if (loading) return <div className="text-center text-slate-500 py-12 text-sm">Loading requests…</div>

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-slate-400">
          {customers.length} pending {customers.length === 1 ? 'request' : 'requests'}
        </span>
        <button onClick={load} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {customers.length === 0 ? (
        <div className="text-center py-16">
          <BellRing className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No pending requests</p>
          <p className="text-slate-600 text-sm mt-1">Approval requests from managers will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {customers.map((c) => {
            const draft = drafts[c._id]
            if (!draft) return null
            const busy = acting[c._id]
            const total = draft.rates.reduce((s, r) => s + Number(r.lockedRate) * Number(r.dailyQty), 0)
            return (
              <div key={c._id} className="card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-100">{c.name}</p>
                      {c.registeredBranch?.name && (
                        <span className="text-xs text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">{c.registeredBranch.name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                      {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                      {c.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.location}</span>}
                      {c.approvalRequestedBy?.name && <span>Requested by: {c.approvalRequestedBy.name}</span>}
                    </div>
                  </div>
                </div>

                {c.approvalNote && (
                  <p className="text-xs text-amber-400/90 italic mt-2 bg-amber-900/10 border border-amber-900/30 rounded-md px-2 py-1.5">
                    “{c.approvalNote}”
                  </p>
                )}

                {/* Editable proposed order */}
                <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Proposed daily order</p>
                  {draft.rates.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-slate-300 flex-1 min-w-[120px]">{productName(r.productId)}</span>
                      <label className="text-xs text-slate-500">Qty
                        <input type="number" min={0} step={0.1} value={r.dailyQty}
                          onChange={(e) => updateRate(c._id, idx, { dailyQty: Number(e.target.value) })}
                          className="input-base w-20 ml-1 inline-block text-sm" />
                      </label>
                      <label className="text-xs text-slate-500">Rate ৳
                        <input type="number" min={0} value={r.lockedRate}
                          onChange={(e) => updateRate(c._id, idx, { lockedRate: Number(e.target.value) })}
                          className="input-base w-20 ml-1 inline-block text-sm" />
                      </label>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 flex-wrap pt-1">
                    <label className="text-xs text-slate-500">Delivery
                      <select value={draft.deliveryMethod}
                        onChange={(e) => updateDelivery(c._id, { deliveryMethod: e.target.value as 'Pickup' | 'Send' })}
                        className="input-base w-24 ml-1 inline-block text-sm">
                        <option value="Pickup">Pickup</option>
                        <option value="Send">Send</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-500">Time
                      <input type="time" value={draft.deliveryTime}
                        onChange={(e) => updateDelivery(c._id, { deliveryTime: e.target.value })}
                        className="input-base w-28 ml-1 inline-block text-sm" />
                    </label>
                    <span className="text-sm text-slate-300 font-medium ml-auto">
                      {formatCurrency(total)}/day
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button disabled={busy} onClick={() => act(c._id, 'approve')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 rounded-md hover:bg-emerald-600/30 disabled:opacity-40 transition-colors">
                    <Check className="w-4 h-4" /> Approve & Make Permanent
                  </button>
                  <button disabled={busy} onClick={() => act(c._id, 'reject')}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-rose-600/20 text-rose-400 border border-rose-600/30 rounded-md hover:bg-rose-600/30 disabled:opacity-40 transition-colors">
                    <X className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
