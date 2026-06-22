import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Transaction from '@/models/Transaction'
import Product from '@/models/Product'
import Customer from '@/models/Customer'
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

  const transactions = await Transaction.find(filter)
    .populate('customerId', 'name phone')
    .populate('recordedBy', 'name')
    .sort({ createdAt: -1 })
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

  let subtotal = 0
  let totalCOGS = 0
  const processedItems = []

  for (const item of items) {
    const product = await Product.findById(item.productId)
    if (!product) {
      return NextResponse.json({ error: `Product ${item.productId} not found` }, { status: 404 })
    }

    const variant = product.variants.find((v: any) => v.variantId === item.variantId)
    if (!variant) {
      return NextResponse.json({ error: `Variant ${item.variantId} not found` }, { status: 404 })
    }

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
    await product.save()

    processedItems.push({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      rateApplied: mrp,
      isCustomOverride: false
    })
  }

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
  updateDailySummary(branchId, today()).catch(() => {})

  const result = transaction.toObject()
  if (role === 'MANAGER') {
    delete (result.financials as any).netProfitAmount
  }

  return NextResponse.json(result, { status: 201 })
}
