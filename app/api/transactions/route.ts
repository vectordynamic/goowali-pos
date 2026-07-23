import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Transaction from '@/models/Transaction'
import Product from '@/models/Product'
import Customer from '@/models/Customer'
import DailyClosing from '@/models/DailyClosing'
import {
  assertBranchAccess,
  branchDenied,
  stripSensitiveTransactionData,
  generateInvoiceId,
  today
} from '@/lib/utils'
import { updateDailySummary } from '@/lib/update-daily-summary'
import { validate, TransactionCreateSchema } from '@/lib/validators'
import type { Role } from '@/types'

// GET /api/transactions?branchId=xxx&date=YYYY-MM-DD&type=Cash Sale
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  const params = req.nextUrl.searchParams
  const branchId = params.get('branchId')
  const date = params.get('date')
  const type = params.get('type')

  if (!branchId) return NextResponse.json({ error: 'branchId required' }, { status: 400 })

  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const filter: Record<string, unknown> = { branchId }
  if (type) filter.transactionType = type
  if (date) {
    const start = new Date(date)
    const end = new Date(date)
    end.setDate(end.getDate() + 1)
    filter.createdAt = { $gte: start, $lt: end }
  }

  // Safety cap — this is already date+branch scoped in practice (a single day's transactions),
  // but had no explicit limit at all; 1000 is a ceiling against a pathological case, not a real
  // page size for the common one-day view.
  const transactions = await Transaction.find(filter)
    .populate('customerId', 'name phone')
    .populate('recordedBy', 'name')
    .populate('voidedBy', 'name')
    .populate('correctedFromId', 'invoiceId transactionType financials createdAt')
    .populate('correctedById', 'invoiceId transactionType createdAt')
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean()

  const sanitized = stripSensitiveTransactionData(transactions, role)
  return NextResponse.json(sanitized)
}

// POST /api/transactions — POS checkout
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches, id: userId } = session.user as {
    role: Role
    assignedBranches: string[]
    id: string
  }

  const body = await req.json()
  const parsed = validate(TransactionCreateSchema, body)
  if (!parsed.success) return parsed.response

  const { branchId, customerId, transactionType, items, cashPaid, discount: rawDiscount, notes } = parsed.data
  const discount = Math.max(0, rawDiscount ?? 0)

  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  // ── Day-status gate: block sales if day not Open ─────────────────────────────────
  let dayClosing = await DailyClosing.findOne({ branchId, status: 'Open', date: { $lte: today() } })
    .sort({ date: 1 })
    .lean() as any

  if (!dayClosing) {
    dayClosing = await DailyClosing.findOne({ branchId, date: today() }).lean() as any
  }

  if (!dayClosing || dayClosing.status === 'Pending') {
    return NextResponse.json(
      { error: 'আজকের হিসাব শুরু হয়নি। বিক্রি শুরু করতে প্রথমে "দিন শুরু করুন" বাটন চাপুন।' },
      { status: 403 }
    )
  }
  if (dayClosing.status === 'Locked') {
    return NextResponse.json(
      { error: 'আজকের হিসাব বন্ধ করা হয়েছে। আর বিক্রি করা যাবে না।' },
      { status: 403 }
    )
  }

  // Batch-fetch every unique product referenced by the cart in one query instead of one
  // sequential findById per item. Items are still validated in the same order as before
  // (same error messages, same abort-on-first-failure behavior), but since nothing is
  // saved until every item has validated, a checkout that fails partway through (e.g. item
  // 3 of 5 is out of stock) no longer leaves items 1-2's stock partially deducted with no
  // rollback the way the old per-item find-then-save loop did.
  const uniqueProductIds = [...new Set(items.map((i) => i.productId))]
  const products = await Product.find({ _id: { $in: uniqueProductIds } })
  const productMap = new Map(products.map((p) => [p._id.toString(), p]))
  const touchedProductIds = new Set<string>()

  let subtotal = 0
  let totalCOGS = 0
  const processedItems = []

  for (const item of items) {
    const product = productMap.get(item.productId)
    if (!product) {
      return NextResponse.json({ error: `Product ${item.productId} not found` }, { status: 404 })
    }

    const variant = product.variants.find((v: any) => v.variantId === item.variantId)
    if (!variant) {
      return NextResponse.json({ error: `Variant ${item.variantId} not found` }, { status: 404 })
    }

    // ── Pooled mode: deduct from the shared tank ──────────────────────────────
    if (product.isPooled) {
      const poolEntry = product.pooledStock.find(
        (p: any) => p.branchId.toString() === branchId
      )
      if (!poolEntry) {
        return NextResponse.json(
          { error: `Pool stock not configured for ${product.name}` },
          { status: 400 }
        )
      }

      const portion = variant.portionSize ?? 1
      const totalDeduction = portion * item.quantity

      if (poolEntry.stockQty < totalDeduction) {
        return NextResponse.json(
          { error: `Insufficient pool stock for ${product.name} (need ${totalDeduction} ${product.unitType === 'Liquid' ? 'L' : 'kg'}, have ${poolEntry.stockQty})` },
          { status: 400 }
        )
      }

      // selling price from variant branchDetails
      const branchDetail = variant.branchDetails.find(
        (bd: any) => bd.branchId.toString() === branchId
      )
      const mrp = branchDetail?.mrpPrice > 0 ? branchDetail.mrpPrice : item.rateApplied
      subtotal += mrp * item.quantity

      // COGS from pool buying price × actual volume deducted
      totalCOGS += (poolEntry.buyingPrice ?? 0) * totalDeduction

      poolEntry.stockQty = Math.max(0, poolEntry.stockQty - totalDeduction)
      touchedProductIds.add(product._id.toString())

      processedItems.push({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        rateApplied: mrp,
        isCustomOverride: false
      })
      continue
    }

    // ── Normal mode: deduct from variant branchDetail ─────────────────────────
    const branchDetail = variant.branchDetails.find(
      (bd: any) => bd.branchId.toString() === branchId
    )
    if (!branchDetail) {
      return NextResponse.json({ error: 'Product not available in this branch' }, { status: 400 })
    }

    if (branchDetail.stockLevel < item.quantity) {
      return NextResponse.json(
        { error: `Insufficient stock for ${product.name}` },
        { status: 400 }
      )
    }

    // rateApplied = mrpPrice (locked; manager cannot override)
    const mrp = branchDetail.mrpPrice > 0 ? branchDetail.mrpPrice : item.rateApplied
    subtotal += mrp * item.quantity
    totalCOGS += branchDetail.buyingPrice * item.quantity

    branchDetail.stockLevel -= item.quantity
    touchedProductIds.add(product._id.toString())

    processedItems.push({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      rateApplied: mrp,
      isCustomOverride: false
    })
  }

  // All items validated — persist every touched product's stock change in parallel
  // (previously N sequential saves, one per item, awaited one at a time).
  await Promise.all([...touchedProductIds].map((id) => productMap.get(id)!.save()))

  // Discount applied at sale level; profit = final bill - COGS
  const totalBill = Math.max(0, subtotal - discount)
  const netProfitAmount = totalBill - totalCOGS
  const amountAddedToKhata = Math.max(0, totalBill - (cashPaid ?? 0))

  if (customerId && amountAddedToKhata > 0) {
    await Customer.findByIdAndUpdate(customerId, {
      $inc: { 'khata.currentDue': amountAddedToKhata }
    })
  }

  const transaction = await Transaction.create({
    invoiceId: generateInvoiceId(branchId),
    branchId,
    recordedBy: userId,
    customerId: customerId ?? null,
    transactionType,
    items: processedItems,
    financials: {
      totalBill,
      discount,
      cashPaid: cashPaid ?? totalBill,
      amountAddedToKhata,
      netProfitAmount
    },
    notes
  })

  // Update pre-computed daily summary (non-blocking)
  updateDailySummary(branchId, dayClosing.date).catch(() => {})

  const result = transaction.toObject()
  if (role === 'MANAGER') {
    delete (result.financials as any).netProfitAmount
  }

  return NextResponse.json(result, { status: 201 })
}
