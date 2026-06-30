'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { Plus, Minus, Trash2, Search, X, CheckCircle2, Lock, Play, Calendar } from 'lucide-react'
import { formatCurrency, today } from '@/lib/utils'

interface BranchDetail {
  branchId: string
  stockLevel: number
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
  name: string
  category?: string
  unitType: string
  isOpenLoose: boolean
  isPooled?: boolean
  pooledStock?: PooledStockEntry[]
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
  isPooled?: boolean
  portionSize?: number
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
  
  // Drill-down UI state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  // Payment
  const [mode, setMode] = useState<PaymentMode>('Cash Sale')
  const [discount, setDiscount] = useState(0)
  const [cashPaid, setCashPaid] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  // ── Day status gate ──
  type DayStatus = 'pending' | 'open' | 'locked' | null
  const [dayStatus, setDayStatus] = useState<DayStatus>(null)
  const [openingCash, setOpeningCash] = useState(0)
  const [startingDay, setStartingDay] = useState(false)

  useEffect(() => {
    fetch(`/api/daily-closing?branchId=${branchId}&date=${today()}`)
      .then((r) => r.json())
      .then((data) => {
        const s = (data.status ?? 'Pending').toLowerCase() as DayStatus
        setDayStatus(s)
        setOpeningCash(data.openingCash ?? data.mathematicalSystemTotals?.openingCash ?? 0)
      })
      .catch(() => setDayStatus('pending'))
  }, [branchId])

  async function handleStartDay() {
    setStartingDay(true)
    try {
      const res = await fetch('/api/daily-closing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId, date: today(), action: 'startDay' }),
      })
      if (res.ok) {
        setDayStatus('open')
        toast.success('দিন শুরু হয়েছে! বিক্রি শুরু করুন ✓')
      } else {
        const err = await res.json()
        // If already started by another session, refresh status
        if (res.status === 409) {
          setDayStatus((err.status ?? 'open').toLowerCase())
        } else {
          toast.error(err.error ?? 'দিন শুরু করা যায়নি')
        }
      }
    } finally {
      setStartingDay(false)
    }
  }

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
    let stockAvailable = 0
    let mrpPrice = 0

    if (product.isPooled) {
      const poolEntry = product.pooledStock?.find(p => p.branchId === branchId)
      stockAvailable = poolEntry?.stockQty ?? 0
      mrpPrice = variant.branchDetails.find(b => b.branchId === branchId)?.mrpPrice ?? 0
    } else {
      const bd = variant.branchDetails.find(b => b.branchId === branchId)
      stockAvailable = bd?.stockLevel ?? 0
      mrpPrice = bd?.mrpPrice ?? 0
    }

    const portionSize = variant.portionSize ?? 1

    if (stockAvailable <= 0 || (product.isPooled && stockAvailable < portionSize)) {
      toast.error('স্টক নেই')
      return
    }

    setCart((prev) => {
      const key = `${product._id}:${variant.variantId}`
      const existing = prev.find((i) => `${i.productId}:${i.variantId}` === key)

      const currentQty = existing ? existing.quantity : 0
      const newQty = currentQty + 1
      const requiredStock = product.isPooled ? newQty * portionSize : newQty

      if (requiredStock > stockAvailable) {
        toast.error('যথেষ্ট স্টক নেই')
        return prev
      }

      if (existing) {
        return prev.map((i) =>
          `${i.productId}:${i.variantId}` === key ? { ...i, quantity: newQty } : i
        )
      }

      return [...prev, {
        productId: product._id,
        variantId: variant.variantId,
        productName: product.name,
        sizeLabel: variant.sizeLabel,
        quantity: 1,
        mrpPrice,
        stockLevel: stockAvailable,
        isPooled: product.isPooled,
        portionSize
      }]
    })
  }

  function updateQty(key: string, delta: number) {
    setCart((prev) =>
      prev.map((i) => {
        if (`${i.productId}:${i.variantId}` === key) {
          const newQty = Math.max(0, i.quantity + delta)
          const requiredStock = i.isPooled && i.portionSize ? newQty * i.portionSize : newQty
          if (requiredStock > i.stockLevel) {
            toast.error('যথেষ্ট স্টক নেই')
            return i
          }
          return { ...i, quantity: newQty }
        }
        return i
      }).filter((i) => i.quantity > 0)
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

  // ── Day status overlays ────────────────────────────────────────────────────
  if (dayStatus === null) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-base font-bold">লোড হচ্ছে...</p>
        </div>
      </div>
    )
  }

  if (dayStatus === 'pending') {
    const dateStr = new Date().toLocaleDateString('bn-BD', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center space-y-6 border border-blue-100">
          <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
            <Play className="w-10 h-10 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-800 mb-1">দিন শুরু করুন</h2>
            <p className="text-gray-500 text-sm flex items-center justify-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {dateStr}
            </p>
          </div>
          {openingCash > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl px-6 py-4">
              <p className="text-sm font-bold text-blue-600 mb-1">গতকালের ক্লোজিং ক্যাশ (আজকের শুরু)</p>
              <p className="text-3xl font-black text-blue-700">{formatCurrency(openingCash)}</p>
            </div>
          )}
          <p className="text-gray-500 text-sm">
            বিক্রি শুরু করতে নিচের বাটনে চাপুন।<br />
            দিন শুরু না করলে কোনো বিক্রি করা যাবে না।
          </p>
          <button
            onClick={handleStartDay}
            disabled={startingDay}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xl font-black rounded-2xl transition-colors disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg"
          >
            {startingDay ? (
              <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> শুরু হচ্ছে...</>
            ) : (
              <><Play className="w-6 h-6" /> দিন শুরু করুন</>
            )}
          </button>
        </div>
      </div>
    )
  }

  if (dayStatus === 'locked') {
    const dateStr = new Date().toLocaleDateString('bn-BD', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-100 to-slate-200 p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center space-y-6 border border-gray-200">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <Lock className="w-10 h-10 text-red-500" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-800 mb-1">আজকের হিসাব বন্ধ</h2>
            <p className="text-gray-500 text-sm flex items-center justify-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {dateStr}
            </p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-2xl px-6 py-4">
            <p className="text-base font-bold text-red-600">আর বিক্রি করা যাবে না</p>
            <p className="text-sm text-red-500 mt-1">আজকের Z-Report জমা দেওয়া হয়েছে।<br />আগামীকাল আবার দিন শুরু করুন।</p>
          </div>
        </div>
      </div>
    )
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
            onChange={(e) => {
              setSearch(e.target.value)
              setSelectedProduct(null)
            }}
          />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-lg">
            লোড হচ্ছে...
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
              {filtered.map((product) => {
                let totalStock = 0
                if (product.isPooled) {
                  totalStock = product.pooledStock?.find(p => p.branchId === branchId)?.stockQty ?? 0
                } else {
                  totalStock = product.variants.reduce((sum, v) => sum + (v.branchDetails.find(b => b.branchId === branchId)?.stockLevel ?? 0), 0)
                }
                const inStock = totalStock > 0
                const variantCount = product.variants.length

                return (
                  <button
                    key={product._id}
                    onClick={() => setSelectedProduct(product)}
                    className={`rounded-2xl p-4 text-left transition-all border-2 shadow-sm flex flex-col ${
                      inStock
                        ? 'bg-white border-gray-200 hover:border-blue-400 hover:bg-blue-50 active:scale-95'
                        : 'bg-gray-100 border-gray-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1 gap-2 w-full">
                      <p className="text-base font-bold text-gray-800 leading-snug">
                        {product.name}
                      </p>
                      {product.isPooled && (
                        <span className="text-[10px] font-bold tracking-wider uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded flex-shrink-0">
                          Pool
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mb-2 mt-auto">{variantCount} ভেরিয়েন্ট</p>
                    {inStock ? (
                      <span className="inline-block bg-green-100 text-green-700 text-sm font-semibold px-2 py-0.5 rounded-lg mt-1">
                        {product.isPooled ? `ট্যাংক: ${totalStock}` : `মোট আছে: ${totalStock}`}
                      </span>
                    ) : (
                      <span className="inline-block bg-red-100 text-red-600 text-sm font-semibold px-2 py-0.5 rounded-lg mt-1">
                        স্টক নেই
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {selectedProduct && (
              <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedProduct(null)}>
                <div className="bg-gray-50 rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-full" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
                    <h2 className="text-xl font-bold text-gray-800">{selectedProduct.name} - ভেরিয়েন্ট নির্বাচন করুন</h2>
                    <button onClick={() => setSelectedProduct(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3 content-start">
                    {selectedProduct.variants.map((variant) => {
                      let inStock = false
                      let stockDisplay = 0
                      let mrpPrice = 0
                      const bd = variant.branchDetails.find(b => b.branchId === branchId)

                      if (selectedProduct.isPooled) {
                        const poolEntry = selectedProduct.pooledStock?.find(p => p.branchId === branchId)
                        const poolQty = poolEntry?.stockQty ?? 0
                        const reqQty = variant.portionSize ?? 0
                        inStock = reqQty > 0 && poolQty >= reqQty
                        stockDisplay = poolQty
                        mrpPrice = bd?.mrpPrice ?? 0
                      } else {
                        inStock = (bd?.stockLevel ?? 0) > 0
                        stockDisplay = bd?.stockLevel ?? 0
                        mrpPrice = bd?.mrpPrice ?? 0
                      }

                      if (!selectedProduct.isPooled && !bd) return null

                      return (
                        <button
                          key={`${selectedProduct._id}:${variant.variantId}`}
                          onClick={() => addToCart(selectedProduct, variant)}
                          disabled={!inStock}
                          className={`rounded-2xl p-4 text-left transition-all border-2 shadow-sm ${
                            inStock
                              ? 'bg-white border-gray-200 hover:border-blue-400 hover:bg-blue-50 active:scale-95'
                              : 'bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-1 gap-2">
                            <p className="text-base font-bold text-gray-800 leading-snug">
                              {selectedProduct.name}
                            </p>
                            {selectedProduct.isPooled && (
                              <span className="text-[10px] font-bold tracking-wider uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded flex-shrink-0">
                                Pool
                              </span>
                            )}
                          </div>
                          {variant.sizeLabel && (
                            <p className="text-sm text-gray-500 mb-1">{variant.sizeLabel}</p>
                          )}
                          {mrpPrice > 0 && (
                            <p className="text-sm font-semibold text-blue-600 mb-1">
                              ৳{mrpPrice}/{selectedProduct.unitType === 'Liquid' ? 'L' : selectedProduct.unitType === 'Weight' ? 'kg' : 'পিস'}
                            </p>
                          )}
                          {inStock ? (
                            <span className="inline-block bg-green-100 text-green-700 text-sm font-semibold px-2 py-0.5 rounded-lg">
                              {selectedProduct.isPooled ? `ট্যাংক: ${stockDisplay}` : `আছে: ${stockDisplay}`}
                            </span>
                          ) : (
                            <span className="inline-block bg-red-100 text-red-600 text-sm font-semibold px-2 py-0.5 rounded-lg">
                              স্টক নেই
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Right: Order + Payment ── */}
      <div className="w-[22rem] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col shadow-2xl z-10">

        {/* Customer section */}
        <div className="px-3 pt-3 pb-2 border-b border-gray-100 bg-gray-50/50">
          <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
            কাস্টমার বিবরণ
          </p>

          {selectedCustomer ? (
            <div className="flex items-center justify-between bg-white border border-blue-200 rounded-lg px-3 py-2 shadow-sm">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">{selectedCustomer.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
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
                className="ml-2 w-7 h-7 flex items-center justify-center rounded-md bg-gray-100 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <input
                  ref={phoneRef}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 shadow-sm"
                  placeholder="ফোন নম্বর লিখুন (ঐচ্ছিক)"
                  value={customerPhone}
                  onChange={(e) => { setCustomerPhone(e.target.value); setShowSuggestions(true) }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
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
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0"
                      >
                        <p className="text-sm font-bold text-gray-800">{c.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
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

              {customerPhone.trim() && (
                <>
                  <input
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 shadow-sm"
                    placeholder="নাম লিখুন"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                  <div className="flex gap-2">
                    {(['Retail', 'Paikari'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setCustomerType(t)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                          customerType === t
                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                            : 'bg-white border-gray-300 text-gray-500'
                        }`}
                      >
                        {t === 'Retail' ? 'খুচরা' : 'পাইকারি'}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {pendingCustomer && (
                <p className="text-xs text-green-700 font-medium bg-green-50 rounded-lg px-2 py-1.5 border border-green-200 inline-block mt-1">
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
                <div key={key} className="bg-white border border-gray-200 rounded-xl p-2.5 flex flex-col shadow-sm">
                  <div className="flex items-start justify-between mb-1.5">
                    <p className="text-sm font-bold text-gray-800 leading-tight pr-2">{item.productName}</p>
                    <button
                      onClick={() => setCart((p) => p.filter((i) => `${i.productId}:${i.variantId}` !== key))}
                      className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="flex items-end justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500 font-medium">
                        {item.sizeLabel ? `${item.sizeLabel} • ` : ''}৳{item.mrpPrice > 0 ? item.mrpPrice : '—'}
                      </span>
                      {item.mrpPrice > 0 && (
                        <span className="text-sm font-bold text-blue-600 mt-0.5">
                          {formatCurrency(item.mrpPrice * item.quantity)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200">
                      <button
                        onClick={() => updateQty(key, -1)}
                        className="w-6 h-6 rounded bg-white shadow-sm flex items-center justify-center text-gray-700 hover:text-blue-600 active:scale-95 transition-all"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold text-gray-800">{item.quantity}</span>
                      <button
                        onClick={() => updateQty(key, 1)}
                        className="w-6 h-6 rounded bg-white shadow-sm flex items-center justify-center text-gray-700 hover:text-blue-600 active:scale-95 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ── Payment section ── */}
        <div className="border-t border-gray-200 bg-gray-50/50 px-3 py-3 space-y-3">
          
          {cart.length > 0 ? (
            <div className="space-y-2">
              {discount > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                  <span>মোট (MRP)</span>
                  <span className="font-semibold">{formatCurrency(cartSubtotal)}</span>
                </div>
              )}

              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-gray-600 whitespace-nowrap">ছাড় (টাকা):</label>
                <input
                  type="number"
                  className="w-full px-3 py-1.5 text-sm font-bold border border-orange-200 rounded-lg bg-orange-50 text-orange-700 focus:outline-none focus:border-orange-400 placeholder:text-orange-300 text-right"
                  value={discount || ''}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                  placeholder="০"
                  min="0"
                  max={cartSubtotal}
                />
              </div>

              <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
                <span className="text-sm font-bold text-gray-600 uppercase tracking-wide">সর্বমোট</span>
                <span className="text-2xl font-black text-blue-600 tracking-tight">{formatCurrency(cartTotal)}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
              <span className="text-sm font-bold text-gray-600 uppercase tracking-wide">সর্বমোট</span>
              <span className="text-2xl font-black text-gray-400 tracking-tight">{formatCurrency(0)}</span>
            </div>
          )}

          {/* Payment mode */}
          <div>
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
                  className={`py-2 rounded-lg text-sm font-bold transition-all border ${
                    mode === value
                      ? color === 'green'
                        ? 'bg-green-600 border-green-600 text-white shadow-sm'
                        : color === 'orange'
                        ? 'bg-orange-500 border-orange-500 text-white shadow-sm'
                        : 'bg-blue-600 border-blue-600 text-white shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mode !== 'Credit Sale' && (
            <div className="bg-white border border-gray-200 rounded-xl p-2.5 shadow-sm space-y-2">
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-gray-600 whitespace-nowrap">নগদ গ্রহণ:</label>
                <input
                  type="number"
                  className="w-full px-3 py-1.5 text-base font-bold border border-gray-300 rounded-lg bg-gray-50 text-gray-800 focus:outline-none focus:border-blue-400 text-right"
                  value={cashPaid || ''}
                  onChange={(e) => setCashPaid(Number(e.target.value))}
                  placeholder="০"
                  min="0"
                />
              </div>
              {mode === 'Cash Sale' && change > 0 && (
                <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-1.5 border border-green-100">
                  <span className="text-xs font-bold text-green-700">ফেরত দিন:</span>
                  <span className="text-sm font-bold text-green-700">{formatCurrency(change)}</span>
                </div>
              )}
            </div>
          )}

          {addedToKhata > 0 && (
            <div className="flex items-center justify-between bg-orange-50 rounded-xl px-3 py-2 border border-orange-200 mt-2">
              <span className="text-xs font-bold text-orange-700">বাকিতে যাবে:</span>
              <span className="text-sm font-bold text-orange-700">{formatCurrency(addedToKhata)}</span>
            </div>
          )}

          <button
            onClick={handleCheckout}
            disabled={submitting || cart.length === 0}
            className="w-full py-3 rounded-xl text-base font-bold text-white transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 hover:bg-green-700 active:scale-95 flex items-center justify-center gap-2 mt-2"
          >
            {submitting ? (
              'প্রসেস হচ্ছে...'
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                বিক্রি করুন
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
