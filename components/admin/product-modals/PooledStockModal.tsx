'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'

interface Branch {
  _id: string
  name: string
}

export default function PooledStockModal({ productId, branches, onClose, onSave }: {
  productId: string
  branches: Branch[]
  onClose: () => void
  onSave: () => void
}) {
  const [branchId, setBranchId] = useState(branches[0]?._id ?? '')
  const [stockQty, setStockQty] = useState('')
  const [buyingPrice, setBuyingPrice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stockQty) { toast.error('Stock quantity required'); return }
    setSubmitting(true)

    const res = await fetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setPooledStock: true,
        branchId,
        stockQty: Number(stockQty),
        buyingPrice: buyingPrice ? Number(buyingPrice) : 0
      })
    })

    setSubmitting(false)
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to set pool stock')
      return
    }
    const branch = branches.find((b) => b._id === branchId)
    toast.success(`Pool stock set for ${branch?.name ?? 'branch'}`)
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-amber-300">Set Pool Tank Stock</h2>
            <p className="text-xs text-slate-500 mt-0.5">Shared bulk stock for all variants</p>
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
          <div>
            <label className="text-xs text-amber-400 block mb-1.5">Total Pool Stock (L / kg) *</label>
            <input
              type="number"
              className="input-base"
              value={stockQty}
              onChange={(e) => setStockQty(e.target.value)}
              required
              min="0"
              step="0.001"
              placeholder="e.g. 100"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Buying Price ৳ per unit (optional)</label>
            <input
              type="number"
              className="input-base"
              value={buyingPrice}
              onChange={(e) => setBuyingPrice(e.target.value)}
              min="0"
              placeholder="e.g. 55 per litre"
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">
              {submitting ? 'Saving…' : 'Set Pool Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
