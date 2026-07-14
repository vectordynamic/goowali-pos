'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import toast from 'react-hot-toast'
import { Plus, Pencil, Package, ChevronDown, ChevronRight, Trash2, RefreshCw } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import type { Role } from '@/types'
import { useBranches } from '@/lib/queries/useBranches'
import { useAllProducts } from '@/lib/queries/useProducts'

// Code-split: these 4 modals are only ever needed after a user clicks an action button
// (add product, add variant, set stock, set pool stock) — no reason to ship their code in
// the initial /products bundle. `ssr: false` since they're pure client-interaction modals.
const ProductModal = dynamic(() => import('./product-modals/ProductModal'), { ssr: false })
const VariantModal = dynamic(() => import('./product-modals/VariantModal'), { ssr: false })
const BranchStockModal = dynamic(() => import('./product-modals/BranchStockModal'), { ssr: false })
const PooledStockModal = dynamic(() => import('./product-modals/PooledStockModal'), { ssr: false })

interface BranchDetail {
  branchId: string
  stockLevel: number
  buyingPrice: number
  mrpPrice: number
}

interface Variant {
  variantId: string
  sizeLabel?: string
  portionSize?: number
  branchDetails: BranchDetail[]
}

interface PooledStockEntry {
  branchId: string
  stockQty: number
  buyingPrice: number
}

interface Product {
  _id: string
  productCode: string
  name: string
  category?: string
  unitType: string
  isOpenLoose: boolean
  isPooled: boolean
  variants: Variant[]
  pooledStock: PooledStockEntry[]
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
  const queryClient = useQueryClient()
  // Shared cache — BranchManager (the write-side) invalidates ['branches'] on create/edit/
  // deactivate, so this list stays fresh without ProductManager needing its own fetch.
  const { data: branchesData } = useBranches()
  const branches: Branch[] = branchesData ?? []

  // Shared with RegularOrderManager, which fetches this exact same `?all=1` endpoint.
  const { data: productsData, isLoading: loading, isError: productsErrored } = useAllProducts()
  const products: Product[] = productsData ?? []

  const [expanded, setExpanded] = useState<string | null>(null)
  const [modal, setModal] = useState<null | 'create' | Product>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [branchDetailModal, setBranchDetailModal] = useState<{
    productId: string
    variantId: string
    isPooled: boolean
  } | null>(null)
  const [variantModal, setVariantModal] = useState<{ productId: string; isPooled: boolean } | null>(null)
  const [pooledStockModal, setPooledStockModal] = useState<string | null>(null)

  useEffect(() => {
    if (productsErrored) toast.error('Failed to load products')
  }, [productsErrored])

  // Only the product catalog needs reloading after a save here — branches never change as a
  // side effect of anything on this page, so it no longer gets bundled into every reload.
  function load() {
    queryClient.invalidateQueries({ queryKey: ['products', 'all'] })
  }

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
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-100">{product.name}</p>
                    <span className="text-xs font-mono bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded flex-shrink-0">
                      {product.productCode}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {product.unitType}
                    {product.isOpenLoose && ' · Loose'}
                    {product.isPooled && <span className="ml-1 text-amber-400 font-semibold">· Pool</span>}
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
                      onClick={() => setVariantModal({ productId: product._id, isPooled: product.isPooled })}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      + Add variant
                    </button>
                  </div>

                  {/* Pooled product: show pool tank stock */}
                  {product.isPooled && (
                    <div className="mb-3 p-3 rounded-lg bg-amber-900/10 border border-amber-800/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">Pool Tank (Shared Stock)</span>
                        <button
                          onClick={() => setPooledStockModal(product._id)}
                          className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                        >
                          + Set pool stock
                        </button>
                      </div>
                      {product.pooledStock.length === 0 ? (
                        <p className="text-xs text-slate-600 italic">No pool stock set for any branch</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-500 border-b border-slate-800">
                              <th className="text-left py-1 font-medium">Branch</th>
                              <th className="text-right py-1 font-medium">Pool Stock</th>
                              <th className="text-right py-1 font-medium">Buy ৳/unit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {product.pooledStock.map((ps) => (
                              <tr key={String(ps.branchId)} className="border-b border-slate-800/40">
                                <td className="py-1 text-slate-300">{branchName(String(ps.branchId))}</td>
                                <td className="py-1 text-right text-amber-400 font-bold">
                                  {ps.stockQty} {product.unitType === 'Liquid' ? 'L' : 'kg'}
                                </td>
                                <td className="py-1 text-right text-rose-400">৳{ps.buyingPrice}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

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
                          {product.isPooled && variant.portionSize !== undefined && variant.portionSize > 0 && (
                            <span className="text-xs text-amber-500 bg-amber-900/20 px-1.5 py-0.5 rounded">
                              {variant.portionSize} {product.unitType === 'Liquid' ? 'L' : 'kg'} each
                            </span>
                          )}
                          <button
                            onClick={() => setBranchDetailModal({ productId: product._id, variantId: variant.variantId, isPooled: product.isPooled })}
                            className="ml-auto text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            + Set {product.isPooled ? 'price' : 'stock'}
                          </button>
                        </div>
                        {variant.branchDetails.length === 0 ? (
                          <p className="text-xs text-slate-600 italic">No branch {product.isPooled ? 'price' : 'stock'} set</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-slate-500 border-b border-slate-800">
                                <th className="text-left py-1 font-medium">Branch</th>
                                {!product.isPooled && <th className="text-right py-1 font-medium">Stock</th>}
                                {!product.isPooled && <th className="text-right py-1 font-medium">Buy ৳</th>}
                                <th className="text-right py-1 font-medium">MRP ৳</th>
                              </tr>
                            </thead>
                            <tbody>
                              {variant.branchDetails.map((bd) => (
                                <tr key={String(bd.branchId)} className="border-b border-slate-800/40">
                                  <td className="py-1 text-slate-300">{branchName(String(bd.branchId))}</td>
                                  {!product.isPooled && <td className="py-1 text-right text-slate-300">{bd.stockLevel}</td>}
                                  {!product.isPooled && <td className="py-1 text-right text-rose-400">৳{bd.buyingPrice}</td>}
                                  <td className="py-1 text-right text-emerald-400">৳{bd.mrpPrice ?? 0}</td>
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
          productId={variantModal.productId}
          isPooled={variantModal.isPooled}
          onClose={() => setVariantModal(null)}
          onSave={() => { setVariantModal(null); load() }}
        />
      )}

      {branchDetailModal && (
        <BranchStockModal
          productId={branchDetailModal.productId}
          variantId={branchDetailModal.variantId}
          isPooled={branchDetailModal.isPooled}
          branches={branches}
          onClose={() => setBranchDetailModal(null)}
          onSave={() => { setBranchDetailModal(null); load() }}
        />
      )}

      {pooledStockModal && (
        <PooledStockModal
          productId={pooledStockModal}
          branches={branches}
          onClose={() => setPooledStockModal(null)}
          onSave={() => { setPooledStockModal(null); load() }}
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
