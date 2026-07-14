'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'

interface Branch {
  _id: string
  name: string
}

export default function BranchStockModal({ productId, variantId, isPooled, branches, onClose, onSave }: {
  productId: string
  variantId: string
  isPooled: boolean
  branches: Branch[]
  onClose: () => void
  onSave: () => void
}) {
  const [branchId, setBranchId] = useState(branches[0]?._id ?? '')
  const [buyingPrice, setBuyingPrice] = useState('')
  const [mrpPrice, setMrpPrice] = useState('')
  const [stockLevel, setStockLevel] = useState('0')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const res = await fetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variantId,
        branchId,
        // pooled: only mrpPrice matters; buying/stock live on pool tank
        buyingPrice: isPooled ? 0 : Number(buyingPrice),
        mrpPrice: mrpPrice ? Number(mrpPrice) : undefined,
        stockLevel: isPooled ? 0 : Number(stockLevel)
      })
    })

    setSubmitting(false)
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to set price')
      return
    }
    const branch = branches.find((b) => b._id === branchId)
    toast.success(`Price set for ${branch?.name ?? 'branch'}`)
    onSave()
  }

  if (branches.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="card w-full max-w-sm p-6 text-center">
          <p className="text-slate-400 text-sm mb-4">Create a branch first before setting stock.</p>
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {isPooled ? 'Set Selling Price' : 'Set Branch Stock'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{variantId}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Branch</label>
            <select className="input-base" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
          {!isPooled && (
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Buying Price ৳ *</label>
              <input
                type="number"
                className="input-base"
                value={buyingPrice}
                onChange={(e) => setBuyingPrice(e.target.value)}
                required
                min="0"
                placeholder="0"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">MRP / Selling Price ৳ *</label>
            <input
              type="number"
              className="input-base"
              value={mrpPrice}
              onChange={(e) => setMrpPrice(e.target.value)}
              required
              min="0"
              placeholder="0"
            />
          </div>
          {!isPooled && (
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Stock Level</label>
              <input
                type="number"
                className="input-base"
                value={stockLevel}
                onChange={(e) => setStockLevel(e.target.value)}
                min="0"
              />
            </div>
          )}
          {isPooled && (
            <p className="text-xs text-amber-500/70">⚠️ Stock for this pool product is managed via the Pool Tank — set it from the product page above.</p>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">
              {submitting ? 'Saving…' : isPooled ? 'Set Price' : 'Set Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
