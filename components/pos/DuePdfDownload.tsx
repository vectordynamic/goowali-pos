'use client'

import { useState, useRef, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Printer, FileText, Truck, ChevronDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface DueCustomer {
  name: string
  phone: string
  location: string
  totalDue: number
  breakdown: Array<{ date: string; items: string; amount: number }>
}

interface DeliveryOrder {
  name: string
  phone: string
  location: string
  time: string
  items: string[]
  totalDue: number
  confirmed: boolean
}

interface Props {
  branchId: string
  type: 'Retail' | 'Paikari'
  branchLabel: string
  lightMode?: boolean
}

function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function bnDate(iso: string): string {
  return new Date(iso).toLocaleDateString('bn-BD', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function today(): string {
  return new Date().toLocaleDateString('bn-BD', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Shared print-document shell. Bangla is shaped by the browser's own text engine (jsPDF cannot),
// so names, matras and conjuncts render correctly. The user picks "Save as PDF" in the dialog.
function printDocument(title: string, orientation: 'portrait' | 'landscape', body: string) {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) {
    toast.error('পপ-আপ ব্লক করা হয়েছে — অনুমতি দিন')
    return
  }
  win.document.write(`<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: A4 ${orientation}; margin: 8mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Hind Siliguri', 'Noto Sans Bengali', 'Nirmala UI', 'SolaimanLipi', system-ui, sans-serif;
    color: #111; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet-header { display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 2px solid #111; padding-bottom: 4px; margin-bottom: 8px; }
  .sheet-header h1 { font-size: 15px; margin: 0; font-weight: 800; }
  .sheet-header .sub { font-size: 10px; color: #444; }
  .sheet-header .meta { text-align: right; font-size: 10px; }
  .sheet-header .meta .total { font-size: 13px; font-weight: 800; color: #b91c1c; }
  table { border-collapse: collapse; width: 100%; }
  .toolbar { position: fixed; top: 0; left: 0; right: 0; background: #1e293b; color: #fff;
    padding: 8px 12px; display: flex; gap: 8px; justify-content: center; font-family: system-ui, sans-serif; }
  .toolbar button { font-size: 13px; font-weight: 700; padding: 6px 16px; border: 0; border-radius: 6px; cursor: pointer; }
  .toolbar .print { background: #2563eb; color: #fff; }
  .toolbar .close { background: #475569; color: #fff; }
  .content { padding-top: 46px; }
  @media print { .toolbar { display: none; } .content { padding-top: 0; } }

  /* Due Collection Sheet */
  .cust { margin-bottom: 6px; page-break-inside: avoid; }
  .cust-head { display: flex; gap: 6px; align-items: baseline; font-size: 10px; background: #f1f5f9;
    padding: 2px 6px; border: 1px solid #cbd5e1; border-bottom: 0; }
  .cust-head .num { font-weight: 800; }
  .cust-head .name { font-weight: 800; font-size: 11px; }
  .cust-head .due { margin-left: auto; font-weight: 800; color: #b91c1c; }
  table.due { font-size: 8px; }
  table.due th, table.due td { border: 1px solid #cbd5e1; padding: 1px 4px; }
  table.due th { background: #e2e8f0; font-weight: 700; text-align: left; }
  table.due td.date { width: 60px; }
  table.due td.plus { width: 70px; text-align: right; color: #b91c1c; }
  table.due td.minus { width: 70px; text-align: right; color: #15803d; }
  table.due tr.empty td { height: 16px; }

  /* Delivery Run Sheet */
  table.run { font-size: 9px; }
  table.run th, table.run td { border: 1px solid #94a3b8; padding: 3px 5px; vertical-align: top; }
  table.run th { background: #e2e8f0; font-weight: 700; }
  table.run td.num { width: 22px; text-align: center; }
  table.run td.qty { min-width: 120px; }
  table.run td.time { width: 44px; text-align: center; }
  table.run td.conf { width: 60px; text-align: center; font-weight: 800; }
  table.run td.conf.yes { color: #15803d; }
  table.run td.conf.no { color: #b91c1c; }
  table.run td.due { width: 68px; text-align: right; font-weight: 700; color: #b91c1c; }
  table.run td.tick { width: 48px; }
  table.run td.collect { width: 80px; }
  table.run .phone { color: #64748b; font-size: 8px; }
  table.run tfoot td { font-weight: 800; background: #f1f5f9; }
</style>
</head>
<body>
<div class="toolbar">
  <button class="print" onclick="window.print()">🖨️ প্রিন্ট / PDF সেভ করুন</button>
  <button class="close" onclick="window.close()">বন্ধ করুন</button>
</div>
<div class="content">${body}</div>
<script>window.onload = function () { setTimeout(function () { window.print() }, 300) }</script>
</body>
</html>`)
  win.document.close()
}

function dueSheetBody(customers: DueCustomer[], branchLabel: string, typeLabel: string, emptyRows: number): string {
  const grandTotal = customers.reduce((s, c) => s + c.totalDue, 0)
  const header = `
    <div class="sheet-header">
      <div>
        <h1>গুয়ালি — বাকি আদায়ের শীট</h1>
        <div class="sub">শাখা: ${esc(branchLabel)} • ${esc(typeLabel)}</div>
      </div>
      <div class="meta">
        <div>তারিখ: ${esc(today())}</div>
        <div class="total">মোট বাকি: ${esc(formatCurrency(grandTotal))}</div>
      </div>
    </div>`

  const blocks = customers.map((c, i) => {
    const rows = c.breakdown.map((b) => {
      const isCollection = b.amount < 0
      return `<tr>
        <td class="date">${esc(bnDate(b.date))}</td>
        <td>${esc(b.items)}</td>
        <td class="plus">${isCollection ? '' : esc(formatCurrency(b.amount))}</td>
        <td class="minus">${isCollection ? esc(formatCurrency(-b.amount)) : ''}</td>
      </tr>`
    }).join('')

    const empties = Array.from({ length: emptyRows }).map(() =>
      `<tr class="empty"><td class="date"></td><td></td><td class="plus"></td><td class="minus"></td></tr>`
    ).join('')

    return `<div class="cust">
      <div class="cust-head">
        <span class="num">${i + 1}.</span>
        <span class="name">${esc(c.name)}</span>
        <span>${esc(c.phone)}</span>
        <span class="due">মোট বাকি: ${esc(formatCurrency(c.totalDue))}</span>
      </div>
      <table class="due">
        <thead><tr><th>তারিখ</th><th>বিবরণ</th><th>বাকি (+)</th><th>আদায় (−)</th></tr></thead>
        <tbody>${rows}${empties}</tbody>
      </table>
    </div>`
  }).join('')

  return header + blocks
}

function deliverySheetBody(orders: DeliveryOrder[], branchLabel: string): string {
  const grandTotal = orders.reduce((s, o) => s + o.totalDue, 0)
  const header = `
    <div class="sheet-header">
      <div>
        <h1>গুয়ালি — ডেলিভারি রানশিট</h1>
        <div class="sub">শাখা: ${esc(branchLabel)}</div>
      </div>
      <div class="meta">
        <div>তারিখ: ${esc(today())}</div>
        <div class="total">মোট ডেলিভারি: ${esc(orders.length)} জন</div>
      </div>
    </div>`

  const rows = orders.map((o, i) => `<tr>
    <td class="num">${i + 1}</td>
    <td>${esc(o.name)}${o.phone ? `<div class="phone">${esc(o.phone)}</div>` : ''}</td>
    <td class="qty">${o.items.map((it) => esc(it)).join('<br/>')}</td>
    <td>${esc(o.location)}</td>
    <td class="time">${esc(o.time)}</td>
    <td class="conf ${o.confirmed ? 'yes' : 'no'}">${o.confirmed ? '✅ হ্যাঁ' : '✗ না'}</td>
    <td class="due">${o.totalDue > 0 ? esc(formatCurrency(o.totalDue)) : ''}</td>
    <td class="tick"></td>
    <td class="collect"></td>
  </tr>`).join('')

  const confirmedCount = orders.filter((o) => o.confirmed).length
  const table = `<table class="run">
    <thead><tr>
      <th class="num">#</th><th>নাম</th><th>পরিমাণ</th><th>এলাকা</th>
      <th class="time">সময়</th><th class="conf">কল কনফার্ম</th><th class="due">মোট বাকি</th><th class="tick">ডেলিভারি ✅</th><th class="collect">আদায় (৳)</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="5">মোট</td>
      <td class="conf yes">${esc(confirmedCount)}/${esc(orders.length)}</td>
      <td class="due">${esc(formatCurrency(grandTotal))}</td>
      <td></td><td></td>
    </tr></tfoot>
  </table>`

  return header + table
}

export default function DuePdfDownload({ branchId, type, branchLabel, lightMode }: Props) {
  const [open, setOpen] = useState(false)
  const [emptyRows, setEmptyRows] = useState(3)
  const [busy, setBusy] = useState<'due' | 'delivery' | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const typeLabel = type === 'Paikari' ? 'পাইকারি' : 'খুচরা'

  async function downloadDue() {
    setBusy('due')
    try {
      const params = new URLSearchParams({ type })
      if (branchId) params.set('branchId', branchId)
      const res = await fetch(`/api/due-pdf?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      const customers: DueCustomer[] = data.customers ?? []
      if (customers.length === 0) {
        toast.error('কোনো বাকি নেই')
        return
      }
      printDocument(
        'বাকি আদায়ের শীট',
        'portrait',
        dueSheetBody(customers, branchLabel, typeLabel, emptyRows)
      )
      setOpen(false)
    } catch {
      toast.error('শীট তৈরি করা যায়নি')
    } finally {
      setBusy(null)
    }
  }

  async function downloadDelivery() {
    if (!branchId) {
      toast.error('শাখা নির্বাচন করুন')
      return
    }
    setBusy('delivery')
    try {
      const res = await fetch(`/api/delivery-pdf?branchId=${branchId}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      const orders: DeliveryOrder[] = data.orders ?? []
      if (orders.length === 0) {
        toast.error('আজকের কোনো ডেলিভারি নেই')
        return
      }
      printDocument('ডেলিভারি রানশিট', 'landscape', deliverySheetBody(orders, branchLabel))
      setOpen(false)
    } catch {
      toast.error('শীট তৈরি করা যায়নি')
    } finally {
      setBusy(null)
    }
  }

  const btn = lightMode
    ? 'bg-white border border-gray-200 text-gray-700 hover:border-gray-300'
    : 'bg-slate-800 border border-slate-700 text-slate-200 hover:border-slate-600'
  const panel = lightMode
    ? 'bg-white border border-gray-200 shadow-lg'
    : 'bg-slate-800 border border-slate-700 shadow-xl'
  const item = lightMode
    ? 'hover:bg-gray-50 text-gray-700'
    : 'hover:bg-slate-700 text-slate-200'

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-colors ${btn}`}
      >
        <Printer className="w-4 h-4" />
        শীট প্রিন্ট
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`absolute right-0 mt-2 w-72 rounded-2xl p-2 z-20 ${panel}`}>
          <button
            onClick={downloadDue}
            disabled={busy !== null}
            className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors disabled:opacity-50 ${item}`}
          >
            <FileText className="w-5 h-5 mt-0.5 text-blue-500 shrink-0" />
            <span>
              <span className="block text-sm font-bold">📋 বাকি আদায়ের শীট</span>
              <span className="block text-xs opacity-70">তারিখ অনুযায়ী বাকির বিবরণ + ফাঁকা সারি</span>
            </span>
          </button>

          <div className={`flex items-center gap-2 px-3 py-2 text-xs ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
            <label className="font-bold">ফাঁকা সারি:</label>
            <input
              type="number"
              min={0}
              max={10}
              value={emptyRows}
              onChange={(e) => setEmptyRows(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
              className={`w-16 rounded-lg px-2 py-1 border text-center font-bold ${
                lightMode ? 'border-gray-300 bg-white text-gray-800' : 'border-slate-600 bg-slate-900 text-slate-100'
              }`}
            />
            <span className="opacity-70">প্রতি কাস্টমার</span>
          </div>

          <div className={`my-1 border-t ${lightMode ? 'border-gray-100' : 'border-slate-700'}`} />

          <button
            onClick={downloadDelivery}
            disabled={busy !== null}
            className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors disabled:opacity-50 ${item}`}
          >
            <Truck className="w-5 h-5 mt-0.5 text-green-500 shrink-0" />
            <span>
              <span className="block text-sm font-bold">🚚 আজকের ডেলিভারি শীট</span>
              <span className="block text-xs opacity-70">নাম, পরিমাণ, এলাকা, সময় + আদায়ের ঘর</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
