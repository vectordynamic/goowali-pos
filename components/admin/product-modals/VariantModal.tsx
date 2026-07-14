'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'

export default function VariantModal({ productId, isPooled, onClose, onSave }: {
  productId: string
  isPooled?: boolean
  onClose: () => void
  onSave: () => void
}) {
  const [variantId, setVariantId] = useState('')
  const [sizeLabel, setSizeLabel] = useState('')
  const [portionSize, setPortionSize] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const res = await fetch(`/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pushVariant: {
          variantId,
          sizeLabel,
          portionSize: portionSize ? Number(portionSize) : 0,
          branchDetails: []
        }
      })
    })

    setSubmitting(false)
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to add variant')
      return
    }
    toast.success(`Variant "${variantId}" added`)
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">Add Variant</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Variant ID *</label>
            <input
              className="input-base font-mono"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
              required
              placeholder="e.g. milk_1l"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Display Label</label>
            <input
              className="input-base"
              value={sizeLabel}
              onChange={(e) => setSizeLabel(e.target.value)}
              placeholder="e.g. 1 Litre"
            />
          </div>
          {isPooled && (
            <div>
              <label className="text-xs text-amber-400 block mb-1.5">Portion Size * <span className="text-slate-500">(কতটুকু pool থেকে নেবে)</span></label>
              <input
                type="number"
                className="input-base"
                value={portionSize}
                onChange={(e) => setPortionSize(e.target.value)}
                required={isPooled}
                min="0"
                step="0.001"
                placeholder="e.g. 0.5 for 500ml, 1 for 1L"
              />
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">
              {submitting ? 'Adding…' : 'Add Variant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
