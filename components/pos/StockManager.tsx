'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Package, Plus, ChevronDown, ChevronUp, Check, X } from 'lucide-react'

interface BranchDetail {
  branchId: string
  stockLevel: number
  buyingPrice: number
}

interface Variant {
  variantId: string
  sizeLabel?: string
  branchDetails: BranchDetail[]
}

interface Product {
  _id: string
  name: string
  unitType: string
  isOpenLoose: boolean
  variants: Variant[]
}

interface AddForm {
  productId: string
  variantId: string
  action: 'add' | 'set'
  quantity: string
  buyingPrice: string
  recordAsPurchase: boolean
  notes: string
}

const emptyForm = (): AddForm => ({
  productId: '',
  variantId: '',
  action: 'add',
  quantity: '',
  buyingPrice: '',
  recordAsPurchase: false,
  notes: ''
})

export default function StockManager({ branchId }: { branchId: string }) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<AddForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(true)

  const loadProducts = useCallback(() => {
    setLoading(true)
    fetch(`/api/products?branchId=${branchId}&context=stock`)
      .then((r) => r.json())
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Failed to load products'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadProducts() }, [loadProducts])

  function getStock(product: Product, variantId: string) {
    const variant = product.variants.find((v) => v.variantId === variantId)
    if (!variant) return { stockLevel: 0, buyingPrice: 0 }
    const bd = variant.branchDetails.find((b) => b.branchId === branchId)
    return { stockLevel: bd?.stockLevel ?? 0, buyingPrice: bd?.buyingPrice ?? 0 }
  }

  function openForm(productId: string, variantId: string, currentBuyingPrice: number) {
    setForm({ ...emptyForm(), productId, variantId, buyingPrice: String(currentBuyingPrice || ''), recordAsPurchase: false })
  }

  async function handleSave() {
    if (!form) return
    const qty = Number(form.quantity)
    if (!qty || qty <= 0) {
      toast.error('Enter a valid quantity')
      return
    }

    const currentStock = getStock(
      products.find((p) => p._id === form.productId)!,
      form.variantId
    )
    if (currentStock.buyingPrice === 0 && form.buyingPrice === '') {
      toast.error('Enter the buying price — this product has no price set yet')
      return
    }

    setSaving(true)
    const res = await fetch('/api/stock-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId,
        productId: form.productId,
        variantId: form.variantId,
        action: form.action,
        quantity: qty,
        buyingPrice: form.buyingPrice !== '' ? Number(form.buyingPrice) : undefined,
        recordAsPurchase: form.recordAsPurchase,
        notes: form.notes || undefined
      })
    })
    setSaving(false)

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to update stock')
      return
    }

    const { stockLevel, procurementId } = await res.json()

    // Update local state so the new stock shows immediately
    setProducts((prev) =>
      prev.map((p) => {
        if (p._id !== form.productId) return p
        return {
          ...p,
          variants: p.variants.map((v) => {
            if (v.variantId !== form.variantId) return v
            const hasBd = v.branchDetails.some((b) => b.branchId === branchId)
            return {
              ...v,
              branchDetails: hasBd
                ? v.branchDetails.map((b) =>
                    b.branchId === branchId
                      ? { ...b, stockLevel, buyingPrice: form.buyingPrice !== '' ? Number(form.buyingPrice) : b.buyingPrice }
                      : b
                  )
                : [...v.branchDetails, { branchId, stockLevel, buyingPrice: Number(form.buyingPrice) || 0 }]
            }
          })
        }
      })
    )

    if (form.recordAsPurchase && procurementId) {
      toast.success(`Stock updated & purchase recorded — now ${stockLevel}`)
    } else {
      toast.success(`Stock updated — now ${stockLevel}`)
    }
    setForm(null)
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-slate-500">Loading stock…</span>
        </div>
      </div>
    )
  }

  if (products.length === 0) return null

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-4 py-3 border-b border-slate-800 hover:bg-slate-800/30 transition-colors"
      >
        <Package className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-semibold text-slate-200">Stock Management</span>
        <span className="ml-auto text-slate-600">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {expanded && (
        <div className="divide-y divide-slate-800/60">
          {products.map((product) =>
            product.variants.map((variant) => {
              const { stockLevel, buyingPrice } = getStock(product, variant.variantId)
              const isEditing = form?.productId === product._id && form?.variantId === variant.variantId
              const label = variant.sizeLabel ? `${variant.sizeLabel}` : variant.variantId

              return (
                <div key={`${product._id}-${variant.variantId}`}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{product.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {label}
                        <span className={`ml-2 font-medium ${stockLevel <= 0 ? 'text-rose-400' : stockLevel < 5 ? 'text-amber-400' : 'text-slate-300'}`}>
                          {stockLevel} {product.unitType === 'Liquid' ? 'L' : product.unitType === 'Weight' ? 'kg' : 'pcs'}
                        </span>
                        {buyingPrice > 0 && (
                          <span className="text-slate-600 ml-2">cost ৳{buyingPrice}</span>
                        )}
                      </p>
                    </div>
                    {isEditing ? (
                      <button
                        onClick={() => setForm(null)}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => openForm(product._id, variant.variantId, buyingPrice)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-md hover:border-blue-700 hover:text-blue-400 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add Stock
                      </button>
                    )}
                  </div>

                  {/* Inline add form */}
                  {isEditing && form && (
                    <div className="px-4 pb-4 space-y-3 bg-slate-800/20 border-t border-slate-800/60">
                      {/* Action toggle */}
                      <div className="flex gap-2 pt-3">
                        {(['add', 'set'] as const).map((a) => (
                          <button
                            key={a}
                            onClick={() => setForm({ ...form, action: a })}
                            className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors ${
                              form.action === a
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {a === 'add' ? '+ Add to stock' : '= Set total'}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">
                            {form.action === 'add' ? 'Quantity received' : 'New total stock'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            step={product.isOpenLoose ? '0.1' : '1'}
                            className="input-base"
                            placeholder="0"
                            value={form.quantity}
                            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-xs block mb-1">
                            {buyingPrice > 0 ? (
                              <span className="text-slate-400">Buying price ৳ <span className="text-slate-600">(optional — current: ৳{buyingPrice})</span></span>
                            ) : (
                              <span className="text-amber-400 font-medium">Buying price ৳ <span className="text-slate-500">(required — not set yet)</span></span>
                            )}
                          </label>
                          <input
                            type="number"
                            min="0"
                            required={buyingPrice === 0}
                            className={`input-base ${buyingPrice === 0 ? 'border-amber-700/60 focus:border-amber-500' : ''}`}
                            placeholder={buyingPrice > 0 ? `${buyingPrice} (keep current)` : 'Enter buying price'}
                            value={form.buyingPrice}
                            onChange={(e) => setForm({ ...form, buyingPrice: e.target.value })}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Notes (optional)</label>
                        <input
                          type="text"
                          className="input-base"
                          placeholder="e.g. Morning delivery"
                          value={form.notes}
                          onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        />
                      </div>

                      {form.action === 'add' && form.quantity && (
                        <p className="text-xs text-slate-400">
                          {stockLevel} + {form.quantity} = <span className="text-slate-200 font-medium">{stockLevel + Number(form.quantity)}</span> after save
                        </p>
                      )}

                      {/* Procurement toggle — only makes sense when adding stock with a buying price */}
                      {form.action === 'add' && (
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={form.recordAsPurchase}
                            onChange={(e) => setForm({ ...form, recordAsPurchase: e.target.checked })}
                            className="w-3.5 h-3.5 accent-blue-500"
                          />
                          <span className="text-xs text-slate-300">
                            Paid from store cash
                            {form.recordAsPurchase && form.quantity && form.buyingPrice && (
                              <span className="text-blue-400 ml-1">
                                — records ৳{(Number(form.quantity) * Number(form.buyingPrice)).toLocaleString()} purchase
                              </span>
                            )}
                          </span>
                        </label>
                      )}

                      <button
                        onClick={handleSave}
                        disabled={saving || !form.quantity}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-600 border border-emerald-500 rounded-md hover:bg-emerald-500 transition-colors disabled:opacity-40"
                      >
                        <Check className="w-3 h-3" />
                        {saving ? 'Saving…' : 'Save Stock'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
