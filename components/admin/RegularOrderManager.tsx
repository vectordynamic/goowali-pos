'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import {
  Plus, X, Pencil, ClipboardList, RefreshCw, Trash2
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Role } from '@/types'

interface Branch {
  _id: string
  name: string
}

interface Product {
  _id: string
  name: string
  category?: string
  variants: Array<{
    variantId: string
    sizeLabel?: string
  }>
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
  location?: string
  customerType: 'Retail' | 'Paikari'
  registeredBranch?: string
  paikariConfig: {
    deliveryMethod: 'Pickup' | 'Send'
    dailyRequirementLiters: number
    fixedProductRates: FixedRate[]
  }
}

interface Props {
  role: Role
  assignedBranches: string[]
}

export default function RegularOrderManager({ role, assignedBranches }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [branchFilter, setBranchFilter] = useState(
    role !== 'SUPER_ADMIN' && assignedBranches.length === 1 ? assignedBranches[0] : ''
  )
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<Customer | null>(null)

  function load() {
    setLoading(true)
    // Fetch ALL customer types — both Retail and Paikari can have regular orders
    const params = new URLSearchParams()
    if (branchFilter) params.set('branchId', branchFilter)

    Promise.all([
      fetch(`/api/customers?${params}`).then((r) => r.json()),
      fetch('/api/branches').then((r) => r.json()),
      fetch('/api/products?all=1').then((r) => r.json())
    ])
      .then(([c, b, p]) => {
        setCustomers(Array.isArray(c) ? c : [])
        setBranches(Array.isArray(b) ? b : [])
        setProducts(Array.isArray(p) ? p : [])
      })
      .catch(() => toast.error('Failed to load data'))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [branchFilter])

  const branchName = (id?: string) =>
    branches.find((b) => b._id === id)?.name ?? id?.slice(-6) ?? '—'

  const productName = (id: string) =>
    products.find((p) => p._id === id)?.name ?? id.slice(-6)

  const showBranchFilter = role === 'SUPER_ADMIN'

  // Show all customers; those with orders appear at top
  const withOrders = customers.filter((c) => c.paikariConfig?.fixedProductRates?.length > 0)
  const withoutOrders = customers.filter((c) => !c.paikariConfig?.fixedProductRates?.length)
  const sorted = [...withOrders, ...withoutOrders]

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {showBranchFilter && branches.length > 1 && (
          <select
            className="input-base w-48"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b._id} value={b._id}>{b.name}</option>
            ))}
          </select>
        )}

        <button
          onClick={load}
          className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        <span className="text-sm text-slate-500 ml-1">
          {withOrders.length} with orders · {withoutOrders.length} without
        </span>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12 text-sm">Loading customers…</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No customers</p>
          <p className="text-slate-600 text-sm mt-1">
            Add customers from the Customers page first
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((c) => {
            const hasOrder = c.paikariConfig?.fixedProductRates?.length > 0
            return (
              <div key={c._id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-100">{c.name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        c.customerType === 'Paikari'
                          ? 'bg-amber-900/30 text-amber-400'
                          : 'bg-blue-900/30 text-blue-400'
                      }`}>
                        {c.customerType}
                      </span>
                      {role === 'SUPER_ADMIN' && (
                        <span className="text-xs text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">
                          {branchName(c.registeredBranch)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{c.phone}</p>
                    {c.location && (
                      <p className="text-xs text-slate-600 mt-0.5">{c.location}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setEditTarget(c)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-md hover:bg-blue-600/30 transition-colors flex-shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {hasOrder ? 'Edit Order' : 'Set Order'}
                  </button>
                </div>

                {hasOrder ? (
                  <div className="mt-3 pt-3 border-t border-slate-800">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">
                      Daily Order
                    </p>
                    <div className="space-y-1">
                      {c.paikariConfig.fixedProductRates.map((rate, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">
                            {productName(rate.productId)}
                            {rate.variantId && (
                              <span className="text-slate-500 ml-1">({rate.variantId})</span>
                            )}
                          </span>
                          <span className="text-slate-400">
                            {rate.dailyQty}
                            {rate.dailyQty === 1 ? ' unit' : ' units'} ×{' '}
                            <span className="text-emerald-400">৳{rate.lockedRate}</span>
                            {' = '}
                            <span className="text-slate-300 font-medium">
                              {formatCurrency(rate.dailyQty * rate.lockedRate)}/day
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5">
                      Delivery: {c.paikariConfig.deliveryMethod}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 mt-2 italic">No regular order configured</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editTarget && (
        <RegularOrderModal
          customer={editTarget}
          products={products}
          branches={branches}
          role={role}
          assignedBranches={assignedBranches}
          onClose={() => setEditTarget(null)}
          onSave={() => { setEditTarget(null); load() }}
        />
      )}
    </div>
  )
}

function RegularOrderModal({
  customer,
  products,
  branches,
  role,
  assignedBranches,
  onClose,
  onSave
}: {
  customer: Customer
  products: Product[]
  branches: Branch[]
  role: Role
  assignedBranches: string[]
  onClose: () => void
  onSave: () => void
}) {
  function normalizeRates(raw: FixedRate[]): FixedRate[] {
    return raw.map((r) => ({
      ...r,
      variantId: r.variantId || products.find((p) => p._id === r.productId)?.variants[0]?.variantId || '',
      dailyQty: r.dailyQty ?? 1
    }))
  }

  const defaultProduct =
    products.find((p) => p.name.toLowerCase().includes('milk')) ?? products[0]

  const [rates, setRates] = useState<FixedRate[]>(
    customer.paikariConfig?.fixedProductRates?.length > 0
      ? normalizeRates(customer.paikariConfig.fixedProductRates)
      : [{
          productId: defaultProduct?._id ?? '',
          variantId: defaultProduct?.variants[0]?.variantId ?? '',
          lockedRate: 0,
          dailyQty: 1
        }]
  )
  const [deliveryMethod, setDeliveryMethod] = useState<'Pickup' | 'Send'>(
    customer.paikariConfig?.deliveryMethod ?? 'Pickup'
  )
  const [submitting, setSubmitting] = useState(false)

  function addRow() {
    const p = products[0]
    setRates((prev) => [...prev, {
      productId: p?._id ?? '',
      variantId: p?.variants[0]?.variantId ?? '',
      lockedRate: 0,
      dailyQty: 1
    }])
  }

  function removeRow(idx: number) {
    setRates((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateRow(idx: number, patch: Partial<FixedRate>) {
    setRates((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  function getVariants(productId: string) {
    return products.find((p) => p._id === productId)?.variants ?? []
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Resolve variantId early — fallback to first variant of the product
    const resolved = rates.map((r) => ({
      ...r,
      variantId: r.variantId || (getVariants(r.productId)[0]?.variantId ?? '')
    }))

    const validRates = resolved.filter((r) => r.productId && r.lockedRate > 0 && r.dailyQty > 0)
    if (validRates.length === 0) {
      toast.error('Add at least one product with qty and price')
      return
    }

    const missingVariant = validRates.find((r) => !r.variantId)
    if (missingVariant) {
      const name = products.find((p) => p._id === missingVariant.productId)?.name ?? 'a product'
      toast.error(`"${name}" has no variant set up — edit the product first and add a variant`)
      return
    }

    setSubmitting(true)
    const res = await fetch(`/api/customers/${customer._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paikariConfig: {
          deliveryMethod,
          dailyRequirementLiters: validRates.reduce((s, r) => s + r.dailyQty, 0),
          fixedProductRates: validRates.map((r) => ({
            productId: r.productId,
            variantId: r.variantId,
            lockedRate: r.lockedRate,
            dailyQty: r.dailyQty
          }))
        }
      })
    })

    setSubmitting(false)
    if (!res.ok) {
      const err = await res.json()
      console.error('[RegularOrder] save failed:', err)
      const detail = err.errors?.[0] ? `${err.errors[0].field}: ${err.errors[0].message}` : (err.error ?? 'Failed to save order')
      toast.error(detail)
      return
    }
    toast.success(`Regular order updated for ${customer.name}`)
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Regular Order</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-slate-500">{customer.name}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                customer.customerType === 'Paikari'
                  ? 'bg-amber-900/30 text-amber-400'
                  : 'bg-blue-900/30 text-blue-400'
              }`}>
                {customer.customerType}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form id="regular-order-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Delivery method */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Delivery Method</label>
            <div className="flex gap-2">
              {(['Pickup', 'Send'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDeliveryMethod(m)}
                  className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${
                    deliveryMethod === m
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Product rows */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-400">Daily Products</label>
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add product
              </button>
            </div>

            <div className="space-y-3">
              {rates.map((rate, idx) => {
                const variants = getVariants(rate.productId)
                return (
                  <div key={idx} className="bg-slate-800/40 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        className="input-base flex-1 text-sm"
                        value={rate.productId}
                        onChange={(e) => {
                          const p = products.find((p) => p._id === e.target.value)
                          updateRow(idx, {
                            productId: e.target.value,
                            variantId: p?.variants[0]?.variantId ?? ''
                          })
                        }}
                      >
                        <option value="">Select product…</option>
                        {products.map((p) => (
                          <option key={p._id} value={p._id}>{p.name}</option>
                        ))}
                      </select>
                      {rates.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-slate-600 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {variants.length > 1 && (
                      <select
                        className="input-base text-sm"
                        value={rate.variantId}
                        onChange={(e) => updateRow(idx, { variantId: e.target.value })}
                      >
                        {variants.map((v) => (
                          <option key={v.variantId} value={v.variantId}>
                            {v.sizeLabel || v.variantId}
                          </option>
                        ))}
                      </select>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Daily Qty</label>
                        <input
                          type="number"
                          className="input-base text-sm"
                          value={rate.dailyQty}
                          onChange={(e) => updateRow(idx, { dailyQty: Number(e.target.value) })}
                          min={0.1}
                          step={0.1}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Price per unit ৳</label>
                        <input
                          type="number"
                          className="input-base text-sm"
                          value={rate.lockedRate || ''}
                          onChange={(e) => updateRow(idx, { lockedRate: Number(e.target.value) })}
                          min={0}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    {rate.lockedRate > 0 && rate.dailyQty > 0 && (
                      <p className="text-xs text-slate-500">
                        Daily total:{' '}
                        <span className="text-emerald-400 font-medium">
                          {formatCurrency(rate.lockedRate * rate.dailyQty)}
                        </span>
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </form>

        <div className="p-4 border-t border-slate-800 flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            type="submit"
            form="regular-order-form"
            disabled={submitting}
            className="btn-primary flex-1"
          >
            {submitting ? 'Saving…' : 'Save Order'}
          </button>
        </div>
      </div>
    </div>
  )
}
