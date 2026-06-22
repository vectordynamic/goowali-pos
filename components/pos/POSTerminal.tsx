'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { Plus, Minus, Trash2, Search, X, CheckCircle2, Lock } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface BranchDetail {
  branchId: string
  stockLevel: number
  mrpPrice: number
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
  mrpPrice: number
  stockLevel: number
}

export interface CustomerSuggestion {
  _id: string
  name: string
  phone: string
  customerType: string
  khata: { currentDue: number }
}

export interface PendingCustomer {
  name: string
  phone: string
  customerType: 'Retail' | 'Paikari'
}

type PaymentMode = 'Cash Sale' | 'Credit Sale' | 'Partial Payment'

interface Props {
  branchId: string
  userId: string
}

export default function POSTerminal({ branchId }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Customer
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerType, setCustomerType] = useState<'Retail' | 'Paikari'>('Retail')
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSuggestion | null>(null)

  // Payment
  const [mode, setMode] = useState<PaymentMode>('Cash Sale')
  const [discount, setDiscount] = useState(0)
  const [cashPaid, setCashPaid] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const phoneRef = useRef<HTMLInputElement>(null)

  const loadProducts = useCallback(() => {
    fetch(`/api/products?branchId=${branchId}`)
      .then((r) => r.json())
      .then(setProducts)
      .catch(() => toast.error('পণ্য লোড হয়নি'))
      .finally(() => setLoading(false))
  }, [branchId])

  useEffect(() => { loadProducts() }, [loadProducts])

  // Debounced phone search
  useEffect(() => {
    if (selectedCustomer || customerPhone.length < 2) {
      setSuggestions([])
      return
    }
    const t = setTimeout(() => {
      fetch(`/api/customers?search=${encodeURIComponent(customerPhone)}&branchId=${branchId}&pos=1`)
        .then((r) => r.json())
        .then((data) => setSuggestions(Array.isArray(data) ? data.slice(0, 5) : []))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [customerPhone, selectedCustomer, branchId])

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase())
  )

  function addToCart(product: Product, variant: Variant) {
    const bd = variant.branchDetails[0]
    if (!bd || bd.stockLevel <= 0) {
      toast.error('স্টক নেই')
      return
    }
    setCart((prev) => {
      const key = `${product._id}:${variant.variantId}`
      const existing = prev.find((i) => `${i.productId}:${i.variantId}` === key)
      if (existing) {
        if (existing.quantity >= bd.stockLevel) {
          toast.error('যথেষ্ট স্টক নেই')
          return prev
        }
        return prev.map((i) =>
          `${i.productId}:${i.variantId}` === key ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, {
        productId: product._id,
        variantId: variant.variantId,
        productName: product.name,
        sizeLabel: variant.sizeLabel,
        quantity: 1,
        mrpPrice: bd.mrpPrice ?? 0,
        stockLevel: bd.stockLevel,
      }]
    })
  }

  function updateQty(key: string, delta: number) {
    setCart((prev) =>
      prev.map((i) =>
        `${i.productId}:${i.variantId}` === key
          ? { ...i, quantity: Math.max(0, i.quantity + delta) }
          : i
      ).filter((i) => i.quantity > 0)
    )
  }

  function clearCustomer() {
    setSelectedCustomer(null)
    setCustomerPhone('')
    setCustomerName('')
    setCustomerType('Retail')
    setSuggestions([])
    setTimeout(() => phoneRef.current?.focus(), 50)
  }

  const cartSubtotal = cart.reduce((s, i) => s + i.mrpPrice * i.quantity, 0)
  const cartTotal = Math.max(0, cartSubtotal - discount)
  const change = mode === 'Cash Sale' ? cashPaid - cartTotal : 0

  useEffect(() => {
    if (mode === 'Cash Sale') setCashPaid(cartTotal)
  }, [cartTotal, mode])

  const addedToKhata =
    mode === 'Credit Sale' ? cartTotal :
    mode === 'Partial Payment' ? Math.max(0, cartTotal - cashPaid) : 0

  const pendingCustomer: PendingCustomer | null =
    !selectedCustomer && customerPhone.trim()
      ? { name: customerName.trim(), phone: customerPhone.trim(), customerType }
      : null

  const hasCustomer = !!(selectedCustomer || pendingCustomer)

  async function handleCheckout() {
    if (cart.length === 0) {
      toast.error('কোনো পণ্য যোগ করা হয়নি')
      return
    }
    if (cart.some((i) => i.mrpPrice <= 0)) {
      toast.error('কিছু পণ্যের দাম নির্ধারণ করা হয়নি')
      return
    }
    if (mode !== 'Cash Sale' && !hasCustomer) {
      toast.error('বাকি বা আংশিক পেমেন্টের জন্য ফোন নম্বর দিন')
      return
    }

    setSubmitting(true)

    let customerId: string | null = selectedCustomer?._id ?? null

    if (!customerId && pendingCustomer) {
      const createRes = await fetch('/api/customers?quick=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pendingCustomer.name || pendingCustomer.phone,
          phone: pendingCustomer.phone,
          customerType: pendingCustomer.customerType,
        }),
      })
      if (!createRes.ok) {
        const err = await createRes.json()
        if (createRes.status === 409 && err.existing?._id) {
          customerId = err.existing._id
        } else {
          toast.error(err.error ?? 'কাস্টমার যোগ করা যায়নি')
          setSubmitting(false)
          return
        }
      } else {
        const newC = await createRes.json()
        customerId = newC._id
      }
    }

    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId,
        customerId,
        transactionType: mode,
        items: cart.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          rateApplied: i.mrpPrice,
        })),
        discount: discount > 0 ? discount : undefined,
        cashPaid: mode === 'Credit Sale' ? 0 : cashPaid,
      }),
    })

    setSubmitting(false)

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'বিক্রি হয়নি, আবার চেষ্টা করুন')
      return
    }

    setCart([])
    setMode('Cash Sale')
    setDiscount(0)
    setCashPaid(0)
    setSelectedCustomer(null)
    setCustomerPhone('')
    setCustomerName('')
    setCustomerType('Retail')
    toast.success('বিক্রি সম্পন্ন হয়েছে ✓')
    loadProducts()
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50">

      {/* ── Left: Product grid ── */}
      <div className="flex-1 flex flex-col overflow-hidden p-4">
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            className="w-full pl-12 pr-4 py-3 text-lg border-2 border-gray-300 rounded-xl bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 shadow-sm"
            placeholder="পণ্য খুঁজুন..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-lg">
            লোড হচ্ছে...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
            {filtered.flatMap((product) =>
              product.variants.map((variant) => {
                const bd = variant.branchDetails[0]
                if (!bd) return null
                const inStock = bd.stockLevel > 0
                return (
                  <button
                    key={`${product._id}:${variant.variantId}`}
                    onClick={() => addToCart(product, variant)}
                    disabled={!inStock}
                    className={`rounded-2xl p-4 text-left transition-all border-2 shadow-sm ${
                      inStock
                        ? 'bg-white border-gray-200 hover:border-blue-400 hover:bg-blue-50 active:scale-95'
                        : 'bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <p className="text-base font-bold text-gray-800 leading-snug mb-1">
                      {product.name}
                    </p>
                    {variant.sizeLabel && (
                      <p className="text-sm text-gray-500 mb-1">{variant.sizeLabel}</p>
                    )}
                    {bd.mrpPrice > 0 && (
                      <p className="text-sm font-semibold text-blue-600 mb-1">
                        ৳{bd.mrpPrice}/{product.unitType === 'Liquid' ? 'L' : product.unitType === 'Weight' ? 'kg' : 'পিস'}
                      </p>
                    )}
                    {inStock ? (
                      <span className="inline-block bg-green-100 text-green-700 text-sm font-semibold px-2 py-0.5 rounded-lg">
                        আছে: {bd.stockLevel}
                      </span>
                    ) : (
                      <span className="inline-block bg-red-100 text-red-600 text-sm font-semibold px-2 py-0.5 rounded-lg">
                        স্টক নেই
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* ── Right: Order + Payment ── */}
      <div className="w-96 flex-shrink-0 bg-white border-l-2 border-gray-200 flex flex-col shadow-xl">

        {/* Customer section */}
        <div className="px-4 pt-4 pb-3 border-b-2 border-gray-100">
          <p className="text-base font-bold text-gray-700 mb-2">
            কাস্টমার{' '}
            <span className="text-sm font-normal text-gray-400">(না দিলেও চলবে)</span>
          </p>

          {selectedCustomer ? (
            <div className="flex items-center justify-between bg-blue-50 border-2 border-blue-200 rounded-xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-base font-bold text-gray-800 truncate">{selectedCustomer.name}</p>
                <p className="text-sm text-gray-500">
                  {selectedCustomer.phone}
                  {selectedCustomer.khata.currentDue > 0 && (
                    <span className="ml-2 text-orange-500 font-semibold">
                      বাকি: {formatCurrency(selectedCustomer.khata.currentDue)}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={clearCustomer}
                className="ml-3 w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-500 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <input
                  ref={phoneRef}
                  className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400"
                  placeholder="ফোন নম্বর লিখুন"
                  value={customerPhone}
                  onChange={(e) => { setCustomerPhone(e.target.value); setShowSuggestions(true) }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white border-2 border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                    {suggestions.map((c) => (
                      <button
                        key={c._id}
                        onMouseDown={() => {
                          setSelectedCustomer(c)
                          setCustomerPhone('')
                          setCustomerName('')
                          setSuggestions([])
                          setShowSuggestions(false)
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0"
                      >
                        <p className="text-base font-bold text-gray-800">{c.name}</p>
                        <p className="text-sm text-gray-500">
                          {c.phone}
                          {c.khata.currentDue > 0 && (
                            <span className="ml-2 text-orange-500">বাকি: {formatCurrency(c.khata.currentDue)}</span>
                          )}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input
                className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400"
                placeholder="নাম লিখুন (ঐচ্ছিক)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />

              {customerPhone.trim() && (
                <div className="flex gap-2">
                  {(['Retail', 'Paikari'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setCustomerType(t)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors border-2 ${
                        customerType === t
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-gray-300 text-gray-500'
                      }`}
                    >
                      {t === 'Retail' ? 'খুচরা' : 'পাইকারি'}
                    </button>
                  ))}
                </div>
              )}

              {pendingCustomer && (
                <p className="text-sm text-green-600 font-medium bg-green-50 rounded-xl px-3 py-2 border border-green-200">
                  ✓ নতুন হিসাব খোলা হবে
                </p>
              )}
            </div>
          )}
        </div>

        {/* Order items */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {cart.length === 0 ? (
            <p className="text-center text-gray-400 text-base py-8">
              বাম দিক থেকে পণ্য বাছুন
            </p>
          ) : (
            cart.map((item) => {
              const key = `${item.productId}:${item.variantId}`
              return (
                <div key={key} className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-gray-800 truncate">{item.productName}</p>
                      {item.sizeLabel && <p className="text-sm text-gray-500">{item.sizeLabel}</p>}
                    </div>
                    <button
                      onClick={() => setCart((p) => p.filter((i) => `${i.productId}:${i.variantId}` !== key))}
                      className="ml-2 w-7 h-7 flex items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-200 flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQty(key, -1)}
                      className="w-9 h-9 rounded-xl bg-gray-200 hover:bg-gray-300 flex items-center justify-center font-bold text-gray-700 text-lg"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-8 text-center text-lg font-bold text-gray-800">{item.quantity}</span>
                    <button
                      onClick={() => updateQty(key, 1)}
                      className="w-9 h-9 rounded-xl bg-gray-200 hover:bg-gray-300 flex items-center justify-center font-bold text-gray-700 text-lg"
                    >
                      <Plus className="w-4 h-4" />
                    </button>

                    {/* Locked MRP price */}
                    <div className="flex-1 flex items-center gap-1.5 bg-gray-100 border-2 border-gray-200 rounded-xl px-3 py-2">
                      <Lock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-base font-bold text-gray-600">
                        ৳{item.mrpPrice > 0 ? item.mrpPrice : '—'}
                      </span>
                    </div>
                  </div>

                  {item.mrpPrice > 0 && (
                    <p className="text-right text-base font-bold text-blue-600 mt-1">
                      = {formatCurrency(item.mrpPrice * item.quantity)}
                    </p>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* ── Payment section ── */}
        <div className="border-t-2 border-gray-200 bg-white px-4 pt-3 pb-4 space-y-3">

          {cart.length > 0 ? (
            <div className="space-y-2">
              {discount > 0 && (
                <div className="flex items-center justify-between text-sm text-gray-500 px-1">
                  <span>মোট (MRP)</span>
                  <span className="font-semibold">{formatCurrency(cartSubtotal)}</span>
                </div>
              )}

              <div>
                <label className="text-sm font-bold text-gray-500 mb-1 block">ছাড় (টাকা)</label>
                <input
                  type="number"
                  className="w-full px-4 py-2 text-base font-bold border-2 border-orange-200 rounded-xl bg-orange-50 text-orange-700 focus:outline-none focus:border-orange-400 placeholder:text-orange-300"
                  value={discount || ''}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                  placeholder="০"
                  min="0"
                  max={cartSubtotal}
                />
              </div>

              <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
                <span className="text-xl font-bold text-gray-700">মোট</span>
                <span className="text-3xl font-black text-blue-600">{formatCurrency(cartTotal)}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
              <span className="text-xl font-bold text-gray-700">মোট</span>
              <span className="text-3xl font-black text-blue-600">{formatCurrency(0)}</span>
            </div>
          )}

          {/* Payment mode */}
          <div>
            <p className="text-sm font-bold text-gray-500 mb-2">পেমেন্ট পদ্ধতি</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: 'Cash Sale', label: 'নগদ', color: 'green' },
                  { value: 'Credit Sale', label: 'বাকি', color: 'orange' },
                  { value: 'Partial Payment', label: 'আংশিক', color: 'blue' },
                ] as const
              ).map(({ value, label, color }) => (
                <button
                  key={value}
                  onClick={() => {
                    setMode(value)
                    if (value === 'Cash Sale') setCashPaid(cartTotal)
                    if (value === 'Credit Sale') setCashPaid(0)
                  }}
                  className={`py-3 rounded-xl text-base font-bold transition-all border-2 ${
                    mode === value
                      ? color === 'green'
                        ? 'bg-green-500 border-green-500 text-white shadow-md'
                        : color === 'orange'
                        ? 'bg-orange-500 border-orange-500 text-white shadow-md'
                        : 'bg-blue-500 border-blue-500 text-white shadow-md'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mode !== 'Credit Sale' && (
            <div>
              <label className="text-sm font-bold text-gray-500 mb-1 block">
                নগদ পেয়েছি (টাকা)
              </label>
              <input
                type="number"
                className="w-full px-4 py-3 text-xl font-bold border-2 border-gray-300 rounded-xl bg-white text-gray-800 focus:outline-none focus:border-blue-400"
                value={cashPaid || ''}
                onChange={(e) => setCashPaid(Number(e.target.value))}
                placeholder="০"
                min="0"
              />
              {mode === 'Cash Sale' && change > 0 && (
                <p className="mt-1 text-base font-bold text-green-600 bg-green-50 rounded-xl px-3 py-2 text-center">
                  ফেরত দিন: {formatCurrency(change)}
                </p>
              )}
            </div>
          )}

          {addedToKhata > 0 && (
            <p className="text-base font-bold text-orange-600 bg-orange-50 rounded-xl px-3 py-2 text-center border border-orange-200">
              বাকিতে যাবে: {formatCurrency(addedToKhata)}
            </p>
          )}

          <button
            onClick={handleCheckout}
            disabled={submitting || cart.length === 0}
            className="w-full py-4 rounded-2xl text-xl font-black text-white transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed bg-green-500 hover:bg-green-600 active:scale-95 flex items-center justify-center gap-2"
          >
            {submitting ? (
              'প্রসেস হচ্ছে...'
            ) : (
              <>
                <CheckCircle2 className="w-6 h-6" />
                বিক্রি করুন
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
