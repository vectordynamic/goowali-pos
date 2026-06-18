'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Search, Plus, Minus, Trash2, ShoppingBag } from 'lucide-react'
import CheckoutModal from './CheckoutModal'
import { formatCurrency } from '@/lib/utils'

interface BranchDetail {
  branchId: string
  stockLevel: number
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

interface CartItem {
  productId: string
  variantId: string
  productName: string
  sizeLabel?: string
  quantity: number
  rateApplied: number
  stockLevel: number
}

interface Props {
  branchId: string
  userId: string
}

export default function POSTerminal({ branchId, userId }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  const loadProducts = useCallback(() => {
    fetch(`/api/products?branchId=${branchId}`)
      .then((r) => r.json())
      .then(setProducts)
      .catch(() => toast.error('Failed to load products'))
      .finally(() => setLoading(false))
  }, [branchId])

  useEffect(() => { loadProducts() }, [loadProducts])

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase())
  )

  function addToCart(product: Product, variant: Variant) {
    const bd = variant.branchDetails[0]
    if (!bd || bd.stockLevel <= 0) {
      toast.error('Out of stock')
      return
    }

    setCart((prev) => {
      const key = `${product._id}:${variant.variantId}`
      const existing = prev.find((i) => `${i.productId}:${i.variantId}` === key)

      if (existing) {
        if (existing.quantity >= bd.stockLevel) {
          toast.error('Not enough stock')
          return prev
        }
        return prev.map((i) =>
          `${i.productId}:${i.variantId}` === key
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      }

      return [
        ...prev,
        {
          productId: product._id,
          variantId: variant.variantId,
          productName: product.name,
          sizeLabel: variant.sizeLabel,
          quantity: 1,
          rateApplied: 0,
          stockLevel: bd.stockLevel
        }
      ]
    })
  }

  function updateQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          `${i.productId}:${i.variantId}` === key
            ? { ...i, quantity: Math.max(0, i.quantity + delta) }
            : i
        )
        .filter((i) => i.quantity > 0)
    )
  }

  function updateRate(key: string, rate: number) {
    setCart((prev) =>
      prev.map((i) =>
        `${i.productId}:${i.variantId}` === key ? { ...i, rateApplied: rate } : i
      )
    )
  }

  const cartTotal = cart.reduce((s, i) => s + i.rateApplied * i.quantity, 0)

  function handleCheckoutSuccess() {
    setCart([])
    setCheckoutOpen(false)
    toast.success('Transaction recorded')
    loadProducts()
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Product grid */}
      <div className="flex-1 flex flex-col overflow-hidden p-4">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="input-base pl-9"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            Loading products…
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 content-start">
            {filtered.flatMap((product) =>
              product.variants.map((variant) => {
                const bd = variant.branchDetails[0]
                if (!bd) return null
                return (
                  <button
                    key={`${product._id}:${variant.variantId}`}
                    onClick={() => addToCart(product, variant)}
                    disabled={bd.stockLevel <= 0}
                    className="card p-3 text-left hover:border-blue-700/50 hover:bg-slate-800/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center mb-2">
                      <ShoppingBag className="w-4 h-4 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-100 truncate">{product.name}</p>
                    {variant.sizeLabel && (
                      <p className="text-xs text-slate-500 mt-0.5">{variant.sizeLabel}</p>
                    )}
                    {bd.stockLevel <= 0
                      ? <p className="text-xs text-rose-500 mt-1">Out of stock</p>
                      : <p className="text-xs text-slate-600 mt-1">Stock: {bd.stockLevel}</p>
                    }
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Cart panel */}
      <div className="w-80 flex-shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-100">Cart</span>
          <span className="ml-auto text-xs text-slate-500">{cart.length} items</span>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {cart.length === 0 && (
            <p className="text-center text-slate-600 text-sm py-8">Cart is empty</p>
          )}
          {cart.map((item) => {
            const key = `${item.productId}:${item.variantId}`
            return (
              <div key={key} className="card p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">
                      {item.productName}
                    </p>
                    {item.sizeLabel && (
                      <p className="text-xs text-slate-500">{item.sizeLabel}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setCart((p) => p.filter((i) => `${i.productId}:${i.variantId}` !== key))}
                    className="text-slate-600 hover:text-rose-400 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQty(key, -1)}
                    className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-8 text-center text-sm text-slate-100">{item.quantity}</span>
                  <button
                    onClick={() => updateQty(key, 1)}
                    className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center"
                  >
                    <Plus className="w-3 h-3" />
                  </button>

                  {/* Selling price — entered by manager at point of sale */}
                  <div className="flex-1 relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">৳</span>
                    <input
                      type="number"
                      value={item.rateApplied || ''}
                      onChange={(e) => updateRate(key, Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 pl-5 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-600"
                      placeholder="price"
                      min="0"
                    />
                  </div>
                </div>

                <p className="text-right text-sm font-bold text-slate-100">
                  {formatCurrency(item.rateApplied * item.quantity)}
                </p>
              </div>
            )
          })}
        </div>

        {/* Total & Checkout */}
        <div className="border-t border-slate-800 p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Total</span>
            <span className="font-bold text-slate-100 text-lg">{formatCurrency(cartTotal)}</span>
          </div>
          <button
            disabled={cart.length === 0}
            onClick={() => setCheckoutOpen(true)}
            className="btn-primary w-full py-2.5"
          >
            Proceed to Checkout
          </button>
        </div>
      </div>

      {checkoutOpen && (
        <CheckoutModal
          branchId={branchId}
          cart={cart}
          cartTotal={cartTotal}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={handleCheckoutSuccess}
        />
      )}
    </div>
  )
}
