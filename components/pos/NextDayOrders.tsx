'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  PhoneCall, RefreshCw, Minus, Plus, Check, PhoneOff, SkipForward,
  UserPlus, Send, X, Trash2, Clock, MapPin
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useProducts } from '@/lib/queries/useProducts'

interface FixedRate {
  productId: string
  variantId: string
  lockedRate: number
  dailyQty: number
}

interface ConfirmedItem {
  productId: string
  variantId: string
  quantity: number
}

interface Customer {
  _id: string
  name: string
  phone?: string
  location?: string
  customerType: 'Retail' | 'Paikari'
  approvalStatus?: 'approved' | 'pending' | 'rejected' | 'temporary'
  approvalNote?: string
  paikariConfig: {
    deliveryMethod: 'Pickup' | 'Send'
    deliveryTime: string
    fixedProductRates: FixedRate[]
  }
  khata: { currentDue: number }
}

interface OrderLog {
  _id: string
  date: string
  customerId: Customer
  status: 'pending' | 'taken' | 'skipped'
  callStatus: 'not_called' | 'called' | 'no_answer' | 'skipped'
  confirmedItems: ConfirmedItem[]
  overrideDeliveryTime?: string
  callNotes?: string
  isTemporary: boolean
}

interface ProductLite {
  _id: string
  name: string
  variants: Array<{ variantId: string; sizeLabel?: string }>
}

interface Props {
  branchId: string
}

function tomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export default function NextDayOrders({ branchId }: Props) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(tomorrowStr)
  const ordersKey = ['next-day-orders', branchId, date]

  const [acting, setActing] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<Record<string, boolean>>({})
  const [qtyOverride, setQtyOverride] = useState<Record<string, number>>({})
  const [timeOverride, setTimeOverride] = useState<Record<string, string>>({})
  const [noteInput, setNoteInput] = useState<Record<string, string>>({})
  // Per customer: manager toggled "won't take an order tomorrow" before logging the call.
  const [wontTake, setWontTake] = useState<Record<string, boolean>>({})
  const [showAdd, setShowAdd] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ordersKey,
    queryFn: async () => {
      const res = await fetch(`/api/next-day-orders?branchId=${branchId}&date=${date}`)
      if (!res.ok) throw new Error('কালকের অর্ডার লোড হয়নি')
      return res.json()
    },
    enabled: !!branchId && !!date,
  })
  const logs: OrderLog[] = data ?? []

  const { data: productsData } = useProducts(branchId)
  const products: ProductLite[] = productsData ?? []

  function reload() {
    queryClient.invalidateQueries({ queryKey: ordersKey })
  }

  function productName(productId: string) {
    return products.find((p) => p._id === productId)?.name ?? 'পণ্য'
  }

  // Standing default per line = what the customer confirmed on an earlier call, else the daily qty.
  function defaultQty(log: OrderLog, rate: FixedRate) {
    const conf = log.confirmedItems?.find(
      (ci) => ci.productId === rate.productId && ci.variantId === rate.variantId
    )
    return conf ? conf.quantity : (rate.dailyQty || 1)
  }

  function getQty(customerId: string, idx: number, fallback: number) {
    return qtyOverride[`${customerId}:${idx}`] ?? fallback
  }
  function setQty(customerId: string, idx: number, value: number) {
    setQtyOverride((p) => ({ ...p, [`${customerId}:${idx}`]: Math.max(0, Math.round(value * 10) / 10) }))
  }

  async function saveCall(
    log: OrderLog,
    callStatus: OrderLog['callStatus'],
    opts: { withItems?: boolean; noOrder?: boolean } = {}
  ) {
    const c = log.customerId
    setActing((p) => ({ ...p, [c._id]: true }))

    const rates = c.paikariConfig?.fixedProductRates ?? []
    const confirmedItems = opts.withItems
      ? rates
          .map((r, idx) => ({
            productId: r.productId,
            variantId: r.variantId,
            quantity: getQty(c._id, idx, defaultQty(log, r))
          }))
          .filter((i) => i.quantity > 0)
      : undefined

    if (opts.withItems && (confirmedItems?.length ?? 0) === 0) {
      setActing((p) => ({ ...p, [c._id]: false }))
      toast.error('কত নেবে পরিমাণ দিন, নাহলে "নেবে না" বাছুন')
      return
    }

    const res = await fetch('/api/next-day-orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId,
        date,
        customerId: c._id,
        callStatus,
        ...(opts.noOrder ? { noOrder: true } : {}),
        ...(confirmedItems ? { confirmedItems } : {}),
        overrideDeliveryTime: timeOverride[c._id] ?? c.paikariConfig?.deliveryTime,
        callNotes: noteInput[c._id] ?? log.callNotes ?? ''
      }),
    })

    setActing((p) => ({ ...p, [c._id]: false }))

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'সেভ হয়নি')
      return
    }
    const label =
      opts.noOrder ? 'কাল নেবে না — নোট হলো' :
      callStatus === 'called' ? 'অর্ডার কনফার্ম হয়েছে' :
      callStatus === 'no_answer' ? 'রিসিভ করেনি' : 'কল করার দরকার নেই'
    toast.success(label)
    setEditing((p) => ({ ...p, [c._id]: false }))
    setWontTake((p) => { const n = { ...p }; delete n[c._id]; return n })
    reload()
  }

  async function requestPermanent(c: Customer) {
    setActing((p) => ({ ...p, [c._id]: true }))
    const res = await fetch('/api/next-day-orders/request-permanent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: c._id, note: c.approvalNote ?? '' }),
    })
    setActing((p) => ({ ...p, [c._id]: false }))
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'অনুরোধ পাঠানো হয়নি')
      return
    }
    toast.success('অ্যাডমিনের কাছে অনুরোধ পাঠানো হয়েছে')
    reload()
  }

  async function cancelTemp(c: Customer) {
    setActing((p) => ({ ...p, [c._id]: true }))
    const res = await fetch(
      `/api/next-day-orders?branchId=${branchId}&date=${date}&customerId=${c._id}`,
      { method: 'DELETE' }
    )
    setActing((p) => ({ ...p, [c._id]: false }))
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'বাতিল হয়নি')
      return
    }
    toast.success('বুকিং বাতিল হয়েছে')
    reload()
  }

  // ── Grouping ────────────────────────────────────────────────────────────────
  const notCalled = logs.filter((l) => !l.isTemporary && (l.callStatus === 'not_called' || editing[l.customerId._id]))
  const called = logs.filter((l) => !l.isTemporary && l.callStatus !== 'not_called' && !editing[l.customerId._id])
  const temps = logs.filter((l) => l.isTemporary)

  const doneCount = logs.filter((l) => !l.isTemporary && l.callStatus !== 'not_called').length
  const pendingCount = logs.filter((l) => !l.isTemporary && l.callStatus === 'not_called').length

  return (
    <div>
      {/* Header */}
      <div className="lcard p-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <PhoneCall className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-black text-gray-800">কালকের অর্ডার</h1>
          <div className="ml-auto flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border-2 border-gray-300 rounded-xl px-3 py-2 text-sm font-bold text-gray-800 bg-white focus:outline-none focus:border-blue-400"
            />
            <button onClick={reload} className="p-2 text-gray-400 hover:text-blue-600 rounded-xl">
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          প্রতি কাস্টমারকে কল করে কনফার্ম করুন — <b className="text-gray-700">কালকে নেবে কি না</b>, <b className="text-gray-700">কত নেবে</b>, <b className="text-gray-700">কখন নেবে</b>।
        </p>
        <div className="flex items-center gap-3 mt-2 text-sm font-bold flex-wrap">
          <span className="text-gray-600">{logs.length} জন কাস্টমার</span>
          {doneCount > 0 && <span className="text-green-600">✅ {doneCount} কল হয়েছে</span>}
          {pendingCount > 0 && <span className="text-amber-600">⏳ {pendingCount} বাকি</span>}
          {temps.length > 0 && <span className="text-purple-600">🆕 {temps.length} নতুন</span>}
          <button
            onClick={() => setShowAdd(true)}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            নতুন কাস্টমার
          </button>
        </div>
      </div>

      {isLoading && <div className="text-base text-gray-400 py-6">লোড হচ্ছে...</div>}
      {isError && <div className="text-base text-red-500 py-6">কালকের অর্ডার লোড হয়নি</div>}

      {!isLoading && logs.length === 0 && (
        <div className="lcard p-10 text-center">
          <PhoneCall className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-bold">কোনো পাইকারি কাস্টমার নেই</p>
          <p className="text-gray-400 text-sm mt-1">নতুন কাস্টমার যোগ করুন অথবা অ্যাডমিন পাইকারি কাস্টমার সেট করুন</p>
        </div>
      )}

      {/* Not called */}
      {notCalled.length > 0 && (
        <Section title="কল করা হয়নি ⏳">
          {notCalled.map((log) => {
            const c = log.customerId
            const rates = c.paikariConfig?.fixedProductRates ?? []
            const busy = acting[c._id]
            const total = rates.reduce((s, r, idx) => s + r.lockedRate * getQty(c._id, idx, defaultQty(log, r)), 0)
            const wont = wontTake[c._id] ?? false
            return (
              <div key={log._id} className="lcard p-4 space-y-3">
                <CustomerHead c={c} />

                {/* Will they take an order tomorrow? — the whole point of the call */}
                <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2">
                  <span className="text-base font-black text-gray-800">কালকে অর্ডার নেবে?</span>
                  <div className="ml-auto flex gap-1">
                    <button type="button" onClick={() => setWontTake((p) => ({ ...p, [c._id]: false }))}
                      className={`px-4 py-1.5 rounded-lg text-sm font-bold border-2 transition-colors ${
                        !wont ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-300 text-gray-600'
                      }`}>হ্যাঁ</button>
                    <button type="button" onClick={() => setWontTake((p) => ({ ...p, [c._id]: true }))}
                      className={`px-4 py-1.5 rounded-lg text-sm font-bold border-2 transition-colors ${
                        wont ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-gray-300 text-gray-600'
                      }`}>না</button>
                  </div>
                </div>

                {/* Confirm HOW MUCH + WHEN — only when taking an order */}
                {!wont && (
                  <>
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-gray-500">কত নেবে?</p>
                      {rates.map((rate, idx) => {
                        const qty = getQty(c._id, idx, defaultQty(log, rate))
                        return (
                          <div key={idx} className="flex items-center gap-2 rounded-xl px-3 py-2.5 bg-gray-50">
                            <span className="flex-1 min-w-0 text-base font-bold text-gray-800 truncate">
                              {productName(rate.productId)}
                              <span className="text-gray-500 font-medium"> · ৳{rate.lockedRate}/একক</span>
                            </span>
                            <button type="button" disabled={busy} onClick={() => setQty(c._id, idx, qty - 0.5)}
                              className="w-10 h-10 flex items-center justify-center rounded-lg bg-white border-2 border-gray-300 text-gray-900 disabled:opacity-40 flex-shrink-0">
                              <Minus className="w-4 h-4" strokeWidth={3} />
                            </button>
                            <input type="number" min={0} step={0.1} disabled={busy} value={qty}
                              onChange={(e) => setQty(c._id, idx, Number(e.target.value))}
                              className="w-16 text-center text-xl font-black text-gray-900 border-2 border-gray-300 rounded-lg py-1 bg-white flex-shrink-0" />
                            <button type="button" disabled={busy} onClick={() => setQty(c._id, idx, qty + 0.5)}
                              className="w-10 h-10 flex items-center justify-center rounded-lg bg-white border-2 border-gray-300 text-gray-900 disabled:opacity-40 flex-shrink-0">
                              <Plus className="w-4 h-4" strokeWidth={3} />
                            </button>
                          </div>
                        )
                      })}
                      <p className="text-right text-base font-black text-gray-800">মোট: {formatCurrency(total)}</p>
                    </div>

                    <label className="flex items-center gap-1.5 text-sm font-bold text-gray-600">
                      <Clock className="w-4 h-4" /> কখন নেবে:
                      <input type="time"
                        value={timeOverride[c._id] ?? c.paikariConfig?.deliveryTime ?? '06:00'}
                        onChange={(e) => setTimeOverride((p) => ({ ...p, [c._id]: e.target.value }))}
                        className="border-2 border-gray-300 rounded-lg px-2 py-1 text-sm font-bold text-gray-800 bg-white" />
                    </label>
                  </>
                )}

                {wont && (
                  <p className="text-sm font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">
                    কাল অর্ডার নেবে না — কনফার্ম করলে কালকের দিনে বাদ থাকবে।
                  </p>
                )}

                {/* Note — always */}
                <input type="text" placeholder="নোট (যেমন: পরে জানাবে)..."
                  value={noteInput[c._id] ?? log.callNotes ?? ''}
                  onChange={(e) => setNoteInput((p) => ({ ...p, [c._id]: e.target.value }))}
                  className="w-full border-2 border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-800 bg-white focus:outline-none focus:border-blue-400" />

                {/* Call outcome */}
                <div className="flex gap-2 flex-wrap">
                  <button disabled={busy}
                    onClick={() => saveCall(log, 'called', wont ? { noOrder: true } : { withItems: true })}
                    className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-base font-bold rounded-xl text-white disabled:opacity-40 transition-colors ${
                      wont ? 'bg-gray-600 hover:bg-gray-700' : 'bg-green-500 hover:bg-green-600'
                    }`}>
                    <Check className="w-4 h-4" strokeWidth={3} /> {wont ? 'কল হয়েছে (নেবে না)' : 'কল হয়েছে ✓'}
                  </button>
                  <button disabled={busy} onClick={() => saveCall(log, 'no_answer')}
                    className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-base font-bold rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 transition-colors">
                    <PhoneOff className="w-4 h-4" /> রিসিভ করেনি
                  </button>
                  <button disabled={busy} onClick={() => saveCall(log, 'skipped')}
                    className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-base font-bold rounded-xl bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-40 transition-colors">
                    <SkipForward className="w-4 h-4" /> কল দরকার নেই
                  </button>
                </div>
              </div>
            )
          })}
        </Section>
      )}

      {/* Called (compact summary) */}
      {called.length > 0 && (
        <Section title="কল সম্পন্ন ✅">
          {called.map((log) => {
            const c = log.customerId
            const rates = c.paikariConfig?.fixedProductRates ?? []
            const time = log.overrideDeliveryTime ?? c.paikariConfig?.deliveryTime
            const total = rates.reduce((s, r) => s + r.lockedRate * defaultQty(log, r), 0)
            // callStatus 'called' + status 'skipped' = reached them, declined tomorrow.
            const declined = log.callStatus === 'called' && log.status === 'skipped'
            const confirmed = log.callStatus === 'called' && log.status !== 'skipped'
            const badge =
              confirmed ? { t: 'অর্ডার কনফার্ম', cls: 'text-green-600' } :
              declined ? { t: 'কাল নেবে না', cls: 'text-red-500' } :
              log.callStatus === 'no_answer' ? { t: 'রিসিভ করেনি', cls: 'text-amber-600' } :
              { t: 'কল দরকার নেই — নিয়মিত', cls: 'text-gray-400' }
            return (
              <div key={log._id} className={`lcard p-4 ${declined ? 'opacity-70' : ''}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-black text-gray-800">{c.name}</span>
                  <span className={`text-sm font-bold ${badge.cls}`}>· {badge.t}</span>
                  {confirmed && (
                    <span className="text-sm font-bold text-gray-700 ml-auto">{formatCurrency(total)}</span>
                  )}
                </div>
                {confirmed && (
                  <p className="text-sm text-gray-500 mt-1">
                    {rates.map((r) => `${productName(r.productId)} ${defaultQty(log, r)}`).join(', ')}
                    {' · '}{c.paikariConfig?.deliveryMethod} {time}
                  </p>
                )}
                {log.callNotes && <p className="text-sm text-gray-400 mt-0.5 italic">“{log.callNotes}”</p>}
                <button
                  onClick={() => {
                    setWontTake((p) => ({ ...p, [c._id]: declined }))
                    if (log.overrideDeliveryTime) setTimeOverride((p) => ({ ...p, [c._id]: log.overrideDeliveryTime! }))
                    if (log.callNotes) setNoteInput((p) => ({ ...p, [c._id]: log.callNotes! }))
                    setEditing((p) => ({ ...p, [c._id]: true }))
                  }}
                  className="text-sm font-bold text-blue-600 hover:text-blue-700 mt-1"
                >
                  আবার এডিট করুন
                </button>
              </div>
            )
          })}
        </Section>
      )}

      {/* Temporary / new customers */}
      {temps.length > 0 && (
        <Section title="নতুন কাস্টমার 🆕">
          {temps.map((log) => {
            const c = log.customerId
            const rates = c.paikariConfig?.fixedProductRates ?? []
            const total = rates.reduce((s, r) => s + r.lockedRate * (r.dailyQty || 1), 0)
            const busy = acting[c._id]
            const pending = c.approvalStatus === 'pending'
            return (
              <div key={log._id} className="lcard p-4 space-y-2 border-l-4 border-purple-400">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-black text-gray-800">{c.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-lg font-bold bg-purple-100 text-purple-700">
                    {pending ? 'অনুমোদন বাকি' : 'অস্থায়ী'}
                  </span>
                  {c.location && (
                    <span className="flex items-center gap-1 text-sm text-gray-500">
                      <MapPin className="w-3.5 h-3.5" />{c.location}
                    </span>
                  )}
                </div>
                {c.phone && <p className="text-sm text-gray-500">📞 {c.phone}</p>}
                <p className="text-sm text-gray-600 font-medium">
                  {rates.map((r) => `${productName(r.productId)} ${r.dailyQty} × ৳${r.lockedRate}`).join(' · ')}
                  {' · '}{c.paikariConfig?.deliveryMethod} {log.overrideDeliveryTime ?? c.paikariConfig?.deliveryTime}
                </p>
                <p className="text-right text-base font-black text-gray-800">{formatCurrency(total)}</p>
                <div className="flex gap-2 flex-wrap">
                  <button disabled={busy || pending} onClick={() => requestPermanent(c)}
                    className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 py-2.5 text-base font-bold rounded-xl bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-40 transition-colors">
                    <Send className="w-4 h-4" /> {pending ? 'অনুরোধ পাঠানো হয়েছে' : 'স্থায়ী করার অনুরোধ'}
                  </button>
                  {!pending && (
                    <button disabled={busy} onClick={() => cancelTemp(c)}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-base font-bold rounded-xl bg-gray-200 text-gray-600 hover:bg-red-100 hover:text-red-600 disabled:opacity-40 transition-colors">
                      <Trash2 className="w-4 h-4" /> বাতিল
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </Section>
      )}

      {showAdd && (
        <AddTempCustomerModal
          branchId={branchId}
          date={date}
          products={products}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); reload() }}
        />
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-sm font-black text-gray-500 uppercase tracking-wide mb-2 px-1">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function CustomerHead({ c }: { c: Customer }) {
  return (
    <div className="flex items-start gap-2 flex-wrap">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base font-black text-gray-800">{c.name}</span>
          <span className="text-xs px-2 py-0.5 rounded-lg font-bold bg-amber-100 text-amber-700">পাইকারি</span>
        </div>
        <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-3 flex-wrap">
          {c.phone && <span>📞 {c.phone}</span>}
          {c.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{c.location}</span>}
          <span>🚚 {c.paikariConfig?.deliveryMethod}</span>
          {c.khata?.currentDue > 0 && (
            <span className="text-red-500 font-bold">বাকি: {formatCurrency(c.khata.currentDue)}</span>
          )}
        </p>
      </div>
    </div>
  )
}

// ── Add new temporary customer modal ──────────────────────────────────────────

interface TempItem {
  productId: string
  variantId: string
  quantity: number
  rate: number
}

function AddTempCustomerModal({
  branchId, date, products, onClose, onSaved
}: {
  branchId: string
  date: string
  products: ProductLite[]
  onClose: () => void
  onSaved: () => void
}) {
  const defaultProduct = products.find((p) => p.name.toLowerCase().includes('milk')) ?? products[0]

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [deliveryMethod, setDeliveryMethod] = useState<'Pickup' | 'Send'>('Pickup')
  const [deliveryTime, setDeliveryTime] = useState('06:00')
  const [items, setItems] = useState<TempItem[]>([{
    productId: defaultProduct?._id ?? '',
    variantId: defaultProduct?.variants[0]?.variantId ?? '',
    quantity: 1,
    rate: 0
  }])
  const [submitting, setSubmitting] = useState(false)

  function variantsFor(productId: string) {
    return products.find((p) => p._id === productId)?.variants ?? []
  }
  function update(idx: number, patch: Partial<TempItem>) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }
  function addRow() {
    const p = products[0]
    setItems((prev) => [...prev, {
      productId: p?._id ?? '', variantId: p?.variants[0]?.variantId ?? '', quantity: 1, rate: 0
    }])
  }
  function removeRow(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('নাম দিন'); return }
    if (phone && !/^01[3-9]\d{8}$/.test(phone)) { toast.error('ফোন ১১ সংখ্যা, 013–019 দিয়ে শুরু'); return }

    const validItems = items
      .map((it) => ({ ...it, variantId: it.variantId || variantsFor(it.productId)[0]?.variantId || '' }))
      .filter((it) => it.productId && it.variantId && it.quantity > 0 && it.rate > 0)

    if (validItems.length === 0) { toast.error('কমপক্ষে ১টি পণ্য পরিমাণ ও দাম সহ দিন'); return }

    setSubmitting(true)
    const res = await fetch('/api/next-day-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId, date, name: name.trim(),
        ...(phone ? { phone } : {}),
        ...(location ? { location } : {}),
        deliveryMethod, deliveryTime, items: validItems
      }),
    })
    setSubmitting(false)

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const detail = err.errors?.[0] ? `${err.errors[0].field}: ${err.errors[0].message}` : (err.error ?? 'যোগ হয়নি')
      toast.error(detail)
      return
    }
    toast.success('কালকের জন্য বুক হয়েছে')
    onSaved()
  }

  const total = items.reduce((s, it) => s + it.quantity * it.rate, 0)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-black text-gray-800">🆕 নতুন কাস্টমার</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto p-4 space-y-3">
          <Field label="নাম *">
            <input className="linput" value={name} onChange={(e) => setName(e.target.value)} placeholder="কাস্টমারের নাম" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ফোন">
              <input className="linput" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" maxLength={11} />
            </Field>
            <Field label="এলাকা">
              <input className="linput" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="এলাকা" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ডেলিভারি">
              <div className="flex gap-2">
                {(['Pickup', 'Send'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setDeliveryMethod(m)}
                    className={`flex-1 px-3 py-2 text-sm rounded-xl border-2 font-bold transition-colors ${
                      deliveryMethod === m ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-600'
                    }`}>
                    {m === 'Pickup' ? 'Pickup' : 'Send'}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="সময়">
              <input type="time" className="linput" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} />
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-bold text-gray-600">পণ্য</label>
              <button type="button" onClick={addRow} disabled={products.length === 0}
                className="flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700 disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" /> আরো পণ্য
              </button>
            </div>
            {products.length === 0 && (
              <p className="text-sm text-red-500 italic">এই শাখায় কোনো পণ্য নেই</p>
            )}
            <div className="space-y-2">
              {items.map((it, idx) => {
                const variants = variantsFor(it.productId)
                return (
                  <div key={idx} className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <select className="linput flex-1" value={it.productId}
                        onChange={(e) => {
                          const p = products.find((p) => p._id === e.target.value)
                          update(idx, { productId: e.target.value, variantId: p?.variants[0]?.variantId ?? '' })
                        }}>
                        <option value="">পণ্য বাছুন…</option>
                        {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                      </select>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeRow(idx)} className="text-gray-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {variants.length > 1 && (
                      <select className="linput" value={it.variantId}
                        onChange={(e) => update(idx, { variantId: e.target.value })}>
                        {variants.map((v) => <option key={v.variantId} value={v.variantId}>{v.sizeLabel || v.variantId}</option>)}
                      </select>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">পরিমাণ</label>
                        <input type="number" min={0.1} step={0.1} className="linput" value={it.quantity}
                          onChange={(e) => update(idx, { quantity: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">দাম/একক ৳</label>
                        <input type="number" min={0} className="linput" value={it.rate || ''}
                          onChange={(e) => update(idx, { rate: Number(e.target.value) })} placeholder="0" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {total > 0 && <p className="text-right text-base font-black text-gray-800">মোট: {formatCurrency(total)}</p>}
        </form>

        <div className="p-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200">বাতিল</button>
          <button type="button" onClick={submit} disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-40">
            {submitting ? '...' : 'কালকের জন্য বুক'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-bold text-gray-600 block mb-1">{label}</label>
      {children}
    </div>
  )
}
