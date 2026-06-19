import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import { assertBranchAccess, branchDenied, generateInvoiceId } from '@/lib/utils'
import type { Role } from '@/types'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// GET /api/daily-orders?branchId=&date=YYYY-MM-DD
// Returns today's regular order log for the branch.
// Auto-creates 'pending' entries for every customer that has fixedProductRates
// but doesn't have a log entry yet for this date.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  const sp = req.nextUrl.searchParams
  const branchId = sp.get('branchId')
  const date = sp.get('date') ?? todayStr()

  if (!branchId) return NextResponse.json({ error: 'branchId required' }, { status: 400 })
  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const { default: Customer } = await import('@/models/Customer')
  const { default: DailyOrderLog } = await import('@/models/DailyOrderLog')

  // All customers in this branch that have at least one fixed rate configured
  const customers = await Customer.find({
    registeredBranch: branchId,
    'paikariConfig.fixedProductRates.0': { $exists: true }
  }).lean()

  if (customers.length === 0) return NextResponse.json([])

  // Upsert a pending log for each customer that doesn't have one yet today
  if (customers.length > 0) {
    await DailyOrderLog.bulkWrite(
      customers.map((c: any) => ({
        updateOne: {
          filter: { branchId, date, customerId: c._id },
          update: { $setOnInsert: { branchId, date, customerId: c._id, status: 'pending' } },
          upsert: true
        }
      }))
    )
  }

  const logs = await DailyOrderLog.find({ branchId, date })
    .populate('customerId', 'name phone location customerType paikariConfig khata')
    .sort({ createdAt: 1 })
    .lean()

  // Compute stock availability for each pending order so the UI can disable Taken button
  const { default: Product } = await import('@/models/Product')

  const allProductIds = [
    ...new Set(
      customers.flatMap((c: any) =>
        (c.paikariConfig?.fixedProductRates ?? []).map((r: any) => r.productId.toString())
      )
    )
  ]
  const products = allProductIds.length
    ? await Product.find({ _id: { $in: allProductIds } }).lean()
    : []

  const logsWithStock = logs.map((log: any) => {
    if (log.status !== 'pending') return { ...log, stockOk: true, stockIssues: [] }

    const rates = (log.customerId as any)?.paikariConfig?.fixedProductRates ?? []
    const stockIssues: string[] = []

    for (const rate of rates) {
      const product = (products as any[]).find(
        (p: any) => p._id.toString() === rate.productId.toString()
      )
      if (!product) continue

      const variant = product.variants.find((v: any) => v.variantId === rate.variantId)
      if (!variant) continue

      const bd = variant.branchDetails.find((b: any) => b.branchId.toString() === branchId)
      const qty = rate.dailyQty || 1

      if (!bd || bd.stockLevel < qty) {
        const available = bd?.stockLevel ?? 0
        stockIssues.push(`${product.name}: need ${qty}, have ${available}`)
      }
    }

    return { ...log, stockOk: stockIssues.length === 0, stockIssues }
  })

  return NextResponse.json(logsWithStock)
}

// PATCH /api/daily-orders
// Body: { branchId, date, customerId, status: 'taken' | 'skipped' }
// 'taken' → auto-creates a Credit Sale transaction from fixedProductRates + marks log
// 'skipped' → just marks log, no transaction
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches, id: userId } = session.user as {
    role: Role
    assignedBranches: string[]
    id: string
  }

  const { branchId, date, customerId, status, paymentType, cashPaid } = await req.json()

  if (!branchId || !customerId || !status) {
    return NextResponse.json({ error: 'branchId, customerId, status are required' }, { status: 400 })
  }
  if (!['taken', 'skipped'].includes(status)) {
    return NextResponse.json({ error: 'status must be taken or skipped' }, { status: 400 })
  }
  const pType: 'cash' | 'partial' | 'credit' = paymentType ?? 'credit'
  if (!['cash', 'partial', 'credit'].includes(pType)) {
    return NextResponse.json({ error: 'paymentType must be cash, partial, or credit' }, { status: 400 })
  }
  if (pType === 'partial' && (!cashPaid || Number(cashPaid) <= 0)) {
    return NextResponse.json({ error: 'cashPaid amount required for partial payment' }, { status: 400 })
  }
  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const { default: DailyOrderLog } = await import('@/models/DailyOrderLog')
  const { default: Customer } = await import('@/models/Customer')

  const effectiveDate = date ?? todayStr()
  const log = await DailyOrderLog.findOne({ branchId, date: effectiveDate, customerId })
  if (!log) return NextResponse.json({ error: 'Order log not found' }, { status: 404 })

  if (log.status !== 'pending') {
    return NextResponse.json({ error: 'Order already resolved' }, { status: 409 })
  }

  if (status === 'skipped') {
    log.status = 'skipped'
    log.updatedBy = userId as any
    await log.save()
    return NextResponse.json({ log })
  }

  // status === 'taken' — dispatch from fixedProductRates and record transaction
  const customer = await Customer.findById(customerId)
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const rates = customer.paikariConfig?.fixedProductRates ?? []
  if (rates.length === 0) {
    return NextResponse.json({ error: 'No regular order configured for this customer' }, { status: 400 })
  }

  const { default: Product } = await import('@/models/Product')
  const { default: Transaction } = await import('@/models/Transaction')

  let totalBill = 0
  const processedItems: any[] = []

  for (const rate of rates) {
    const product = await Product.findById(rate.productId)
    if (!product) continue

    const variant = product.variants.find((v: any) => v.variantId === rate.variantId)
    if (!variant) continue

    const branchDetail = variant.branchDetails.find(
      (bd: any) => bd.branchId.toString() === branchId
    )
    if (!branchDetail) continue

    const qty = (rate as any).dailyQty || 1

    if (branchDetail.stockLevel < qty) {
      return NextResponse.json(
        { error: `Insufficient stock for ${product.name}` },
        { status: 400 }
      )
    }

    branchDetail.stockLevel -= qty
    await product.save()
    totalBill += rate.lockedRate * qty

    processedItems.push({
      productId: rate.productId,
      variantId: rate.variantId,
      quantity: qty,
      rateApplied: rate.lockedRate,
      isCustomOverride: false
    })
  }

  if (processedItems.length === 0) {
    return NextResponse.json({ error: 'No dispatchable items found for this branch' }, { status: 400 })
  }

  const cash = pType === 'cash' ? totalBill : pType === 'partial' ? Math.min(Number(cashPaid), totalBill) : 0
  const addedToKhata = totalBill - cash
  const txType = pType === 'cash' ? 'Cash Sale' : pType === 'partial' ? 'Partial Payment' : 'Credit Sale'

  if (addedToKhata > 0) {
    customer.khata.currentDue += addedToKhata
  }
  await customer.save()

  const transaction = await Transaction.create({
    invoiceId: generateInvoiceId(branchId),
    branchId,
    recordedBy: userId,
    customerId,
    transactionType: txType,
    items: processedItems,
    financials: {
      totalBill,
      cashPaid: cash,
      amountAddedToKhata: addedToKhata,
      netProfitAmount: 0
    },
    notes: 'Regular order'
  })

  log.status = 'taken'
  log.transactionId = transaction._id
  log.updatedBy = userId as any
  await log.save()

  return NextResponse.json({ log, transaction })
}
