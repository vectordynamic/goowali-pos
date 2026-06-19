'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Plus, Pencil, X, Package, ChevronDown, ChevronRight, Trash2, RefreshCw } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import type { Role } from '@/types'

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
  category?: string
  unitType: string
  isOpenLoose: boolean
  variants: Variant[]
}

interface Branch {
  _id: string
  name: string
}

interface Props {
  role: Role
  assignedBranches: string[]
}

export default function ProductManager({ role, assignedBranches }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [modal, setModal] = useState<null | 'create' | Product>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [branchDetailModal, setBranchDetailModal] = useState<{
    productId: string
    variantId: string
  } | null>(null)
  const [variantModal, setVariantModal] = useState<string | null>(null)

  function load() {
    setLoading(true)
    Promise.all([
      fetch('/api/products?all=1').then((r) => r.json()),
      fetch('/api/branches').then((r) => r.json())
    ])
      .then(([p, b]) => {
        setProducts(Array.isArray(p) ? p : [])
        setBranches(Array.isArray(b) ? b : [])
      })
      .catch(() => toast.error('Failed to load products'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleDelete(product: Product) {
    const loadingToast = toast.loading(`Deleting ${product.name}…`)
    const res = await fetch(`/api/products/${product._id}`, { method: 'DELETE' })
    toast.dismiss(loadingToast)

    if (res.ok) {
      toast.success(`${product.name} deleted`)
      setDeleteTarget(null)
      load()
    } else {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to delete product')
    }
  }

  function branchName(id: string) {
    return branches.find((b) => b._id === id)?.name ?? `…${String(id).slice(-4)}`
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{products.length} products</span>
          <button
            onClick={load}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <button onClick={() => setModal('create')} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Add Product
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12 text-sm">Loading products…</div>
      ) : products.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No products yet</p>
          <p className="text-slate-600 text-sm mt-1">Add your first product to the catalog</p>
        </div>
      ) : (
        <div className="card overflow-hidden divide-y divide-slate-800">
          {products.map((product) => (
            <div key={product._id}>
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/30 transition-colors"
                onClick={() => setExpanded(expanded === product._id ? null : product._id)}
              >
                {expanded === product._id
                  ? <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                }
                <div className="w-7 h-7 rounded bg-slate-700 flex items-center justify-center flex-shrink-0">
                  <Package className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-100">{product.name}</p>
                  <p className="text-xs text-slate-500">
                    {product.unitType}
                    {product.isOpenLoose && ' · Loose'}
                    {product.category && ` · ${product.category}`}
                    {' · '}
                    {product.variants.length} variant{product.variants.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setModal(product)}
                    className="p-1.5 text-slate-500 hover:text-slate-100 hover:bg-slate-700 rounded transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {role === 'SUPER_ADMIN' && (
                    <button
                      onClick={() => setDeleteTarget(product)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-900/20 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {expanded === product._id && (
                <div className="px-4 pb-4 bg-slate-900/30 border-t border-slate-800/50">
                  <div className="flex items-center justify-between mt-3 mb-2">
                    <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Variants & Branch Stock</span>
                    <button
                      onClick={() => setVariantModal(product._id)}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      + Add variant
                    </button>
                  </div>

                  {product.variants.length === 0 ? (
                    <p className="text-xs text-slate-600 italic py-2">No variants yet</p>
                  ) : (
                    product.variants.map((variant) => (
                      <div key={variant.variantId} className="mb-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                            {variant.variantId}
                          </span>
                          {variant.sizeLabel && (
                            <span className="text-xs text-slate-400">{variant.sizeLabel}</span>
                          )}
                          <button
                            onClick={() => setBranchDetailModal({ productId: product._id, variantId: variant.variantId })}
                            className="ml-auto text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            + Set stock
                          </button>
                        </div>
                        {variant.branchDetails.length === 0 ? (
                          <p className="text-xs text-slate-600 italic">No branch stock set</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-slate-500 border-b border-slate-800">
                                <th className="text-left py-1 font-medium">Branch</th>
                                <th className="text-right py-1 font-medium">Stock</th>
                                <th className="text-right py-1 font-medium">Buy ৳</th>
                              </tr>
                            </thead>
                            <tbody>
                              {variant.branchDetails.map((bd) => (
                                <tr key={String(bd.branchId)} className="border-b border-slate-800/40">
                                  <td className="py-1 text-slate-300">{branchName(String(bd.branchId))}</td>
                                  <td className="py-1 text-right text-slate-300">{bd.stockLevel}</td>
                                  <td className="py-1 text-right text-rose-400">৳{bd.buyingPrice}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ProductModal
          product={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load() }}
        />
      )}

      {variantModal && (
        <VariantModal
          productId={variantModal}
          onClose={() => setVariantModal(null)}
          onSave={() => { setVariantModal(null); load() }}
        />
      )}

      {branchDetailModal && (
        <BranchStockModal
          productId={branchDetailModal.productId}
          variantId={branchDetailModal.variantId}
          branches={branches}
          onClose={() => setBranchDetailModal(null)}
          onSave={() => { setBranchDetailModal(null); load() }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete product?"
          message={`"${deleteTarget.name}" and all its branch stock will be permanently deleted.`}
          confirmLabel="Delete"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

function ProductModal({ product, onClose, onSave }: {
  product: Product | null
  onClose: () => void
  onSave: () => void
}) {
  const [name, setName] = useState(product?.name ?? '')
  const [category, setCategory] = useState(product?.category ?? '')
  const [unitType, setUnitType] = useState(product?.unitType ?? 'Fixed')
  const [isOpenLoose, setIsOpenLoose] = useState(product?.isOpenLoose ?? false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const payload = { name, category, unitType, isOpenLoose }
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

function VariantModal({ productId, onClose, onSave }: {
  productId: string
  onClose: () => void
  onSave: () => void
}) {
  const [variantId, setVariantId] = useState('')
  const [sizeLabel, setSizeLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const res = await fetch(`/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pushVariant: { variantId, sizeLabel, branchDetails: [] }
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
              placeholder="e.g. milk_1L"
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

function BranchStockModal({ productId, variantId, branches, onClose, onSave }: {
  productId: string
  variantId: string
  branches: Branch[]
  onClose: () => void
  onSave: () => void
}) {
  const [branchId, setBranchId] = useState(branches[0]?._id ?? '')
  const [buyingPrice, setBuyingPrice] = useState('')
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
        buyingPrice: Number(buyingPrice),
        stockLevel: Number(stockLevel)
      })
    })

    setSubmitting(false)
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to set stock')
      return
    }
    const branch = branches.find((b) => b._id === branchId)
    toast.success(`Stock set for ${branch?.name ?? 'branch'}`)
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
            <h2 className="text-base font-semibold text-slate-100">Set Branch Stock</h2>
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
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">
              {submitting ? 'Saving…' : 'Set Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
