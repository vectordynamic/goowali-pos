'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Package, ChevronDown, ChevronUp, Check } from 'lucide-react'

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
  recordAsPurchase: boolean
  saving: boolean
}

export default function StockManager({ branchId }: { branchId: string }) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [rows, setRows] = useState<Record<string, RowState>>({})

  const loadProducts = useCallback(() => {
    setLoading(true)
    fetch(`/api/products?branchId=${branchId}&context=stock`)
      .then((r) => r.json())
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => toast.error('স্টক লোড হয়নি'))
      .finally(() => setLoading(false))
  }, [branchId])

  useEffect(() => { loadProducts() }, [loadProducts])

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
      recordAsPurchase: true,
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
        recordAsPurchase: row.recordAsPurchase,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'স্টক আপডেট হয়নি')
      setRow(key, { saving: false })
      return
    }

    const { stockLevel: newStock, procurementId } = await res.json()

    setProducts((prev) =>
      prev.map((p) => {
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
        recordAsPurchase: row.recordAsPurchase,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'পুল স্টক আপডেট হয়নি')
      setRow(key, { saving: false })
      return
    }

    const { stockLevel: newPool, procurementId } = await res.json()

    setProducts((prev) =>
      prev.map((p) => {
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

                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex-1 min-w-[80px]">
                      <label className="text-xs font-bold text-gray-500 block mb-1">কত {unit} পেলেন</label>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        className="w-full border-2 border-amber-300 rounded-xl px-3 py-2.5 text-base font-bold text-gray-800 bg-white focus:outline-none focus:border-amber-500 placeholder:text-gray-300"
                        placeholder="০"
                        value={row.quantity}
                        onChange={(e) => setRow(poolKey, { quantity: e.target.value }, buyingPrice)}
                      />
                    </div>

                    <div className="flex-1 min-w-[90px]">
                      <label className={`text-xs font-bold block mb-1 ${buyingPrice === 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                        {buyingPrice > 0 ? `ক্রয় মূল্য (৳${buyingPrice}/${unit})` : `ক্রয় মূল্য ৳/${unit}`}
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="w-full border-2 border-gray-300 rounded-xl px-3 py-2.5 text-base font-bold text-gray-800 bg-white focus:outline-none focus:border-amber-400 placeholder:text-gray-300"
                        placeholder={buyingPrice > 0 ? `${buyingPrice}` : 'দাম'}
                        value={row.buyingPrice}
                        onChange={(e) => setRow(poolKey, { buyingPrice: e.target.value }, buyingPrice)}
                      />
                    </div>

                    <button
                      onClick={() => handlePoolSave(product)}
                      disabled={row.saving || !row.quantity}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-base"
                    >
                      <Check className="w-4 h-4" />
                      {row.saving ? 'সেভ...' : 'সেভ'}
                    </button>
                  </div>

                  {row.quantity && (
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-green-700 pl-1">
                      <input
                        type="checkbox"
                        checked={row.recordAsPurchase}
                        onChange={(e) => setRow(poolKey, { recordAsPurchase: e.target.checked }, buyingPrice)}
                        className="w-4 h-4 accent-green-600"
                      />
                      দোকানের টাকায় কিনেছি
                      {row.recordAsPurchase && row.quantity && row.buyingPrice && (
                        <span className="text-green-700 font-black ml-1">
                          ৳{(Number(row.quantity) * Number(row.buyingPrice)).toLocaleString()}
                        </span>
                      )}
                    </label>
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
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-green-700 pl-1">
                      <input
                        type="checkbox"
                        checked={row.recordAsPurchase}
                        onChange={(e) => setRow(key, { recordAsPurchase: e.target.checked }, buyingPrice)}
                        className="w-4 h-4 accent-green-600"
                      />
                      দোকানের টাকায় কিনেছি
                      {row.recordAsPurchase && row.quantity && row.buyingPrice && (
                        <span className="text-green-700 font-black ml-1">
                          ৳{(Number(row.quantity) * Number(row.buyingPrice)).toLocaleString()}
                        </span>
                      )}
                    </label>
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
