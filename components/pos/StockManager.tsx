'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Package, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { useProducts } from '@/lib/queries/useProducts'

interface BranchDetail {
  branchId: string
  stockLevel: number
  buyingPrice: number
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
  name: string
  unitType: string
  isOpenLoose: boolean
  isPooled: boolean
  variants: Variant[]
  pooledStock: PooledStockEntry[]
}

interface RowState {
  quantity: string
  buyingPrice: string
  paidBy: 'store' | 'owner'
  ownerId: string
  saving: boolean
}

interface OwnerOption {
  _id: string
  name: string
}

// ── Store / owner pay-source picker — shared by pool and normal rows ──────────
// Hoisted to module scope (not nested inside StockManager) so it keeps a stable
// component identity across renders instead of remounting on every keystroke.
function PaySourcePicker({
  rowKeyValue,
  buyingPrice,
  row,
  owners,
  setRow,
}: {
  rowKeyValue: string
  buyingPrice: number
  row: RowState
  owners: OwnerOption[]
  setRow: (key: string, patch: Partial<RowState>, bpHint?: number) => void
}) {
  const total = row.quantity && row.buyingPrice ? Number(row.quantity) * Number(row.buyingPrice) : 0

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setRow(rowKeyValue, { paidBy: 'store' }, buyingPrice)}
          className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${
            row.paidBy === 'store' ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-300 text-gray-600'
          }`}
        >
          দোকানের টাকায়
        </button>
        <button
          type="button"
          onClick={() => setRow(rowKeyValue, {
            paidBy: 'owner',
            ownerId: owners.length === 1 ? owners[0]._id : row.ownerId,
          }, buyingPrice)}
          className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${
            row.paidBy === 'owner' ? 'bg-purple-500 border-purple-500 text-white' : 'bg-white border-gray-300 text-gray-600'
          }`}
        >
          মালিকের টাকায়
        </button>
      </div>

      {row.paidBy === 'owner' && (
        owners.length === 0 ? (
          <p className="text-xs text-red-500 font-bold">কোনো মালিক পাওয়া যায়নি</p>
        ) : owners.length === 1 ? (
          <p className="text-sm font-bold text-purple-700">মালিক: {owners[0].name}</p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {owners.map((o) => (
              <button
                key={o._id}
                type="button"
                onClick={() => setRow(rowKeyValue, { ownerId: o._id }, buyingPrice)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 transition-colors ${
                  row.ownerId === o._id ? 'bg-purple-500 border-purple-500 text-white' : 'bg-white border-gray-300 text-gray-600'
                }`}
              >
                {o.name}
              </button>
            ))}
          </div>
        )
      )}

      {total > 0 && (
        <p className={`text-sm font-black ${row.paidBy === 'owner' ? 'text-purple-700' : 'text-green-700'}`}>
          ৳{total.toLocaleString()}
        </p>
      )}
    </div>
  )
}

export default function StockManager({ branchId }: { branchId: string }) {
  const queryClient = useQueryClient()
  // 'stock' context always includes buyingPrice — a distinct cache entry from the plain
  // catalog fetch shared by POSTerminal/ZReport/DailyOrders, since the response shape differs.
  const stockProductsKey = ['products', branchId, 'stock']
  const { data: productsData, isLoading: loading, isError: productsErrored } = useProducts(branchId, { context: 'stock' })
  const products: Product[] = productsData ?? []
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [expanded, setExpanded] = useState(true)
  const [rows, setRows] = useState<Record<string, RowState>>({})

  useEffect(() => {
    if (productsErrored) toast.error('স্টক লোড হয়নি')
  }, [productsErrored])

  useEffect(() => {
    fetch(`/api/branch-admins?branchId=${branchId}`)
      .then((r) => r.json())
      .then((data) => setOwners(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [branchId])

  // ── Normal mode helpers ──────────────────────────────────────────────────────
  function getStock(product: Product, variantId: string) {
    const variant = product.variants.find((v) => v.variantId === variantId)
    if (!variant) return { stockLevel: 0, buyingPrice: 0 }
    const bd = variant.branchDetails.find((b) => b.branchId === branchId)
    return { stockLevel: bd?.stockLevel ?? 0, buyingPrice: bd?.buyingPrice ?? 0 }
  }

  // ── Pool mode helpers ────────────────────────────────────────────────────────
  function getPoolStock(product: Product) {
    const entry = product.pooledStock.find((p) => p.branchId === branchId)
    return { stockQty: entry?.stockQty ?? 0, buyingPrice: entry?.buyingPrice ?? 0 }
  }

  function rowKey(productId: string, variantId: string) {
    return `${productId}:${variantId}`
  }

  function getRow(key: string, buyingPrice: number): RowState {
    return rows[key] ?? {
      quantity: '',
      buyingPrice: buyingPrice > 0 ? String(buyingPrice) : '',
      paidBy: 'store',
      ownerId: '',
      saving: false,
    }
  }

  function setRow(key: string, patch: Partial<RowState>, bpHint = 0) {
    setRows((prev) => ({ ...prev, [key]: { ...getRow(key, bpHint), ...prev[key], ...patch } }))
  }

  // ── Normal mode save ─────────────────────────────────────────────────────────
  async function handleSave(product: Product, variant: Variant) {
    const { stockLevel, buyingPrice: currentBuyingPrice } = getStock(product, variant.variantId)
    const key = rowKey(product._id, variant.variantId)
    const row = rows[key] ?? getRow(key, currentBuyingPrice)

    const qty = Number(row.quantity)
    if (!qty || qty <= 0) { toast.error('কত পেলেন সেটা লিখুন'); return }
    if (currentBuyingPrice === 0 && row.buyingPrice === '') { toast.error('ক্রয় মূল্য দিন'); return }
    if (row.paidBy === 'owner' && !row.ownerId) { toast.error('মালিক বাছুন'); return }

    setRow(key, { saving: true })

    const res = await fetch('/api/stock-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId,
        productId: product._id,
        variantId: variant.variantId,
        action: 'add',
        quantity: qty,
        buyingPrice: row.buyingPrice !== '' ? Number(row.buyingPrice) : undefined,
        paidBy: row.paidBy,
        ownerId: row.paidBy === 'owner' ? row.ownerId : undefined,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'স্টক আপডেট হয়নি')
      setRow(key, { saving: false })
      return
    }

    const { stockLevel: newStock, procurementId } = await res.json()

    queryClient.setQueryData(stockProductsKey, (prev: Product[] | undefined) =>
      (prev ?? []).map((p) => {
        if (p._id !== product._id) return p
        return {
          ...p,
          variants: p.variants.map((v) => {
            if (v.variantId !== variant.variantId) return v
            const hasBd = v.branchDetails.some((b) => b.branchId === branchId)
            return {
              ...v,
              branchDetails: hasBd
                ? v.branchDetails.map((b) =>
                    b.branchId === branchId
                      ? { ...b, stockLevel: newStock, buyingPrice: row.buyingPrice !== '' ? Number(row.buyingPrice) : b.buyingPrice }
                      : b
                  )
                : [...v.branchDetails, { branchId, stockLevel: newStock, buyingPrice: Number(row.buyingPrice) || 0 }],
            }
          }),
        }
      })
    )
    // Stock changed — the plain (non-stock-context) catalog cache shared by
    // POSTerminal/ZReport/DailyOrders is now stale, force it to refetch next time it's read.
    queryClient.invalidateQueries({ queryKey: ['products', branchId, null] })

    toast.success(procurementId ? `স্টক আপডেট ও কেনা রেকর্ড — এখন ${newStock}` : `স্টক আপডেট — এখন ${newStock}`)
    setRows((prev) => { const next = { ...prev }; delete next[key]; return next })
  }

  // ── Pool mode save ───────────────────────────────────────────────────────────
  async function handlePoolSave(product: Product) {
    const { stockQty: currentQty, buyingPrice: currentBp } = getPoolStock(product)
    const key = rowKey(product._id, '__pool__')
    const row = rows[key] ?? getRow(key, currentBp)

    const qty = Number(row.quantity)
    if (!qty || qty <= 0) { toast.error('কত পেলেন সেটা লিখুন'); return }
    if (row.paidBy === 'owner' && !row.ownerId) { toast.error('মালিক বাছুন'); return }

    setRow(key, { saving: true })

    const res = await fetch('/api/stock-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId,
        productId: product._id,
        variantId: '__pool__',
        action: 'add',
        quantity: qty,
        buyingPrice: row.buyingPrice !== '' ? Number(row.buyingPrice) : undefined,
        paidBy: row.paidBy,
        ownerId: row.paidBy === 'owner' ? row.ownerId : undefined,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'পুল স্টক আপডেট হয়নি')
      setRow(key, { saving: false })
      return
    }

    const { stockLevel: newPool, procurementId } = await res.json()

    queryClient.setQueryData(stockProductsKey, (prev: Product[] | undefined) =>
      (prev ?? []).map((p) => {
        if (p._id !== product._id) return p
        const hasEntry = p.pooledStock.some((e) => e.branchId === branchId)
        return {
          ...p,
          pooledStock: hasEntry
            ? p.pooledStock.map((e) =>
                e.branchId === branchId
                  ? { ...e, stockQty: newPool, buyingPrice: row.buyingPrice !== '' ? Number(row.buyingPrice) : e.buyingPrice }
                  : e
              )
            : [...p.pooledStock, { branchId, stockQty: newPool, buyingPrice: Number(row.buyingPrice) || 0 }],
        }
      })
    )
    queryClient.invalidateQueries({ queryKey: ['products', branchId, null] })

    toast.success(procurementId ? `পুল স্টক আপডেট ও কেনা রেকর্ড — এখন ${newPool} ${product.unitType === 'Liquid' ? 'L' : 'kg'}` : `পুল স্টক আপডেট — এখন ${newPool} ${product.unitType === 'Liquid' ? 'L' : 'kg'}`)
    setRows((prev) => { const next = { ...prev }; delete next[key]; return next })
  }

  if (loading) {
    return (
      <div className="lcard p-4 flex items-center gap-2">
        <Package className="w-5 h-5 text-gray-400" />
        <span className="text-base text-gray-400">স্টক লোড হচ্ছে...</span>
      </div>
    )
  }

  if (products.length === 0) return null

  return (
    <div className="lcard overflow-hidden">
      {/* Collapse toggle */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-200"
      >
        <Package className="w-5 h-5 text-blue-600" />
        <span className="text-base font-black text-gray-800">স্টক ম্যানেজমেন্ট</span>
        <span className="ml-auto text-gray-400">
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </span>
      </button>

      {expanded && (
        <div className="divide-y divide-gray-100">
          {products.map((product) => {
            const unit = product.unitType === 'Liquid' ? 'L' : product.unitType === 'Weight' ? 'kg' : 'পিস'

            // ── Pool product row ─────────────────────────────────────────────
            if (product.isPooled) {
              const { stockQty, buyingPrice } = getPoolStock(product)
              const poolKey = rowKey(product._id, '__pool__')
              const row = getRow(poolKey, buyingPrice)
              const newTotal = row.quantity ? stockQty + Number(row.quantity) : null

              return (
                <div key={product._id} className="px-5 py-4 space-y-3 bg-amber-50/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-base font-black text-gray-800">{product.name}</p>
                        <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Pool</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {product.variants.map(v => v.sizeLabel ?? v.variantId).join(' · ')}
                        {' · '}
                        <span className={`font-bold ${stockQty <= 0 ? 'text-red-500' : stockQty < 5 ? 'text-amber-600' : 'text-green-600'}`}>
                          ট্যাংক: {stockQty} {unit}
                        </span>
                        {buyingPrice > 0 && (
                          <span className="text-gray-400 ml-2">ক্রয়: ৳{buyingPrice}/{unit}</span>
                        )}
                      </p>
                    </div>
                    {newTotal !== null && (
                      <span className="text-sm font-bold text-amber-700 bg-amber-100 px-3 py-1 rounded-xl">
                        → {newTotal} {unit}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                    <div className="flex-1">
                      <label className="text-xs font-bold text-gray-500 block mb-1">কত {unit} পেলেন</label>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        className="w-full border-2 border-amber-300 rounded-xl px-3 py-2.5 text-base font-bold text-gray-800 bg-white focus:outline-none focus:border-amber-500 placeholder:text-gray-300 min-h-[44px]"
                        placeholder="০"
                        value={row.quantity}
                        onChange={(e) => setRow(poolKey, { quantity: e.target.value }, buyingPrice)}
                      />
                    </div>

                    <div className="flex-1">
                      <label className={`text-xs font-bold block mb-1 ${buyingPrice === 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                        {buyingPrice > 0 ? `ক্রয় মূল্য (৳${buyingPrice}/${unit})` : `ক্রয় মূল্য ৳/${unit}`}
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="w-full border-2 border-gray-300 rounded-xl px-3 py-2.5 text-base font-bold text-gray-800 bg-white focus:outline-none focus:border-amber-400 placeholder:text-gray-300 min-h-[44px]"
                        placeholder={buyingPrice > 0 ? `${buyingPrice}` : 'দাম'}
                        value={row.buyingPrice}
                        onChange={(e) => setRow(poolKey, { buyingPrice: e.target.value }, buyingPrice)}
                      />
                    </div>

                    <button
                      onClick={() => handlePoolSave(product)}
                      disabled={row.saving || !row.quantity}
                      className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-base min-h-[44px]"
                    >
                      <Check className="w-5 h-5" />
                      <span>{row.saving ? 'সেভ...' : 'সেভ'}</span>
                    </button>
                  </div>

                  {row.quantity && (
                    <PaySourcePicker rowKeyValue={poolKey} buyingPrice={buyingPrice} row={row} owners={owners} setRow={setRow} />
                  )}
                </div>
              )
            }

            // ── Normal product rows ──────────────────────────────────────────
            return product.variants.map((variant) => {
              const { stockLevel, buyingPrice } = getStock(product, variant.variantId)
              const key = rowKey(product._id, variant.variantId)
              const row = getRow(key, buyingPrice)
              const label = variant.sizeLabel ?? variant.variantId
              const preview = row.quantity ? `${stockLevel} + ${row.quantity} = ${stockLevel + Number(row.quantity)}` : null

              return (
                <div key={key} className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-black text-gray-800">{product.name}</p>
                      <p className="text-sm text-gray-500">
                        {label} ·{' '}
                        <span className={`font-bold ${
                          stockLevel <= 0 ? 'text-red-500' :
                          stockLevel < 5 ? 'text-amber-600' : 'text-green-600'
                        }`}>
                          আছে: {stockLevel} {unit}
                        </span>
                        {buyingPrice > 0 && (
                          <span className="text-gray-400 ml-2">ক্রয়: ৳{buyingPrice}</span>
                        )}
                      </p>
                    </div>
                    {preview && (
                      <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-xl">
                        → {stockLevel + Number(row.quantity)} {unit}
                      </span>
                    )}
                  </div>

                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex-1 min-w-[80px]">
                      <label className="text-xs font-bold text-gray-500 block mb-1">কত পেলেন</label>
                      <input
                        type="number"
                        min="0"
                        step={product.isOpenLoose ? '0.1' : '1'}
                        className="w-full border-2 border-gray-300 rounded-xl px-3 py-2.5 text-base font-bold text-gray-800 bg-white focus:outline-none focus:border-blue-400 placeholder:text-gray-300"
                        placeholder="০"
                        value={row.quantity}
                        onChange={(e) => setRow(key, { quantity: e.target.value }, buyingPrice)}
                      />
                    </div>

                    <div className="flex-1 min-w-[90px]">
                      <label className={`text-xs font-bold block mb-1 ${buyingPrice === 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                        {buyingPrice > 0 ? `ক্রয় মূল্য (৳${buyingPrice})` : 'ক্রয় মূল্য ৳ *'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        className={`w-full border-2 rounded-xl px-3 py-2.5 text-base font-bold text-gray-800 bg-white focus:outline-none placeholder:text-gray-300 ${
                          buyingPrice === 0
                            ? 'border-amber-400 focus:border-amber-500'
                            : 'border-gray-300 focus:border-blue-400'
                        }`}
                        placeholder={buyingPrice > 0 ? `${buyingPrice}` : 'দাম'}
                        value={row.buyingPrice}
                        onChange={(e) => setRow(key, { buyingPrice: e.target.value }, buyingPrice)}
                      />
                    </div>

                    <button
                      onClick={() => handleSave(product, variant)}
                      disabled={row.saving || !row.quantity}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-base"
                    >
                      <Check className="w-4 h-4" />
                      {row.saving ? 'সেভ...' : 'সেভ'}
                    </button>
                  </div>

                  {row.quantity && (
                    <PaySourcePicker rowKeyValue={key} buyingPrice={buyingPrice} row={row} owners={owners} setRow={setRow} />
                  )}
                </div>
              )
            })
          })}
        </div>
      )}
    </div>
  )
}
