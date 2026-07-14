'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'

interface Product {
  _id: string
  productCode: string
  name: string
  category?: string
  unitType: string
  isOpenLoose: boolean
  isPooled: boolean
}

export default function ProductModal({ product, onClose, onSave }: {
  product: Product | null
  onClose: () => void
  onSave: () => void
}) {
  const [productCode, setProductCode] = useState(product?.productCode ?? '')
  const [name, setName] = useState(product?.name ?? '')
  const [category, setCategory] = useState(product?.category ?? '')
  const [unitType, setUnitType] = useState(product?.unitType ?? 'Fixed')
  const [isOpenLoose, setIsOpenLoose] = useState(product?.isOpenLoose ?? false)
  const [isPooled, setIsPooled] = useState(product?.isPooled ?? false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const payload = { productCode: productCode.trim().toUpperCase(), name, category, unitType, isOpenLoose, isPooled }
    const res = product
      ? await fetch(`/api/products/${product._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      : await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, variants: [] })
        })

    setSubmitting(false)
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to save product')
      return
    }
    toast.success(product ? `${name} updated` : `${name} added to catalog`)
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">
            {product ? 'Edit Product' : 'New Product'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Product Code * <span className="text-slate-600">(unique, e.g. MILK-1L)</span></label>
            <input
              className="input-base font-mono uppercase"
              value={productCode}
              onChange={(e) => setProductCode(e.target.value.toUpperCase())}
              required
              placeholder="e.g. MILK-1L"
              disabled={!!product}
            />
            {!!product && (
              <p className="text-xs text-slate-600 mt-1">Product code cannot be changed after creation</p>
            )}
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Name *</label>
            <input
              className="input-base"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Fresh Milk"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Category</label>
            <input
              className="input-base"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Dairy"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Unit Type</label>
            <select className="input-base" value={unitType} onChange={(e) => setUnitType(e.target.value)}>
              <option value="Liquid">Liquid (litres)</option>
              <option value="Weight">Weight (kg/g)</option>
              <option value="Fixed">Fixed (pieces)</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isOpenLoose}
              onChange={(e) => setIsOpenLoose(e.target.checked)}
              className="accent-blue-500"
            />
            <span className="text-sm text-slate-300">Open / Loose (allows decimal quantity)</span>
          </label>
          {(unitType === 'Liquid' || unitType === 'Weight') && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPooled}
                onChange={(e) => setIsPooled(e.target.checked)}
                disabled={!!product}
                className="accent-amber-500"
              />
              <span className="text-sm text-amber-300">
                Pool Mode — shared tank, variants draw from it
              </span>
            </label>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">
              {submitting ? 'Saving…' : 'Save Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
