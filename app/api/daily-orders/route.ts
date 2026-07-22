import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import { assertBranchAccess, branchDenied, generateInvoiceId, today } from '@/lib/utils'
import { updateDailySummary } from '@/lib/update-daily-summary'
import type { Role } from '@/types'

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
  const date = sp.get('date') ?? today()


  if (!branchId) return NextResponse.json({ error: 'branchId required' }, { status: 400 })
  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const { default: Customer } = await import('@/models/Customer')
  const { default: DailyOrderLog } = await import('@/models/DailyOrderLog')

  // Permanent Paikari customers with a standing order. Temporary/pending/rejected bookings are
  // excluded from auto-create — a temporary customer only ever surfaces on the specific date its
  // isTemporary log was booked for (the log already exists, so it still shows via the query below).
  const customers = await Customer.find({
    registeredBranch: branchId,
    'paikariConfig.fixedProductRates.0': { $exists: true },
    approvalStatus: { $nin: ['temporary', 'pending', 'rejected'] }
  }).lean()

  // Upsert a pending log for each permanent customer that doesn't have one yet today.
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
    .populate('customerId', 'name phone location customerType paikariConfig khata approvalStatus')
    .populate('transactionId', 'items financials.totalBill')
    .sort({ createdAt: 1 })
    .lean()

  if (logs.length === 0) return NextResponse.json([])

  // Compute stock availability for each pending order so the UI can disable Taken button
  // and let the manager adjust today's quantity within what's actually available. Product IDs
  // come from the populated logs (not the permanent `customers` query) so temporary bookings —
  // which aren't in that query — get their stock checked too.
  const { default: Product } = await import('@/models/Product')

  const allProductIds = [
    ...new Set(
      logs.flatMap((log: any) =>
        ((log.customerId as any)?.paikariConfig?.fixedProductRates ?? []).map((r: any) =>
          r.productId.toString()
        )
      )
    )
  ]
  const products = allProductIds.length
    ? await Product.find({ _id: { $in: allProductIds } }).lean()
    : []

  // Per line-item available quantity, pooled-aware — used by the UI to validate
  // a manager-adjusted quantity live, not just the configured default.
  function availableFor(rate: any) {
    const product = (products as any[]).find(
      (p: any) => p._id.toString() === rate.productId.toString()
    )
    // Stale order: the product/variant no longer exists (product deleted or recreated with new
    // ids). `found: false` lets the UI say "product missing — fix the order" instead of a
    // misleading "0 in stock".
    if (!product) return { name: 'Unknown', available: 0, found: false }

    const variant = product.variants.find((v: any) => v.variantId === rate.variantId)
    if (!variant) return { name: product.name, available: 0, found: false }

    if (product.isPooled) {
      const pool = product.pooledStock?.find((p: any) => p.branchId.toString() === branchId)
      const portion = variant.portionSize || 1
      const available = pool ? Math.floor((pool.stockQty / portion) * 100) / 100 : 0
      return { name: product.name, available, found: true }
    }

    const bd = variant.branchDetails.find((b: any) => b.branchId.toString() === branchId)
    return { name: product.name, available: bd?.stockLevel ?? 0, found: true }
  }

  const logsWithStock = logs.map((log: any) => {
    const rates = (log.customerId as any)?.paikariConfig?.fixedProductRates ?? []
    const stockInfo = rates.map((rate: any) => {
      const { name, available, found } = availableFor(rate)
      return { productId: rate.productId, variantId: rate.variantId, name, available, found }
    })

    if (log.status !== 'pending') return { ...log, stockOk: true, stockIssues: [], stockInfo }

    // Confirmed-on-call quantity (set the night before) is the real need if present, else the
    // standing daily default.
    const confirmed: any[] = log.confirmedItems ?? []
    const stockIssues: string[] = []
    stockInfo.forEach((s: any, i: number) => {
      const rate = rates[i]
      const conf = confirmed.find(
        (ci: any) => ci.productId.toString() === rate.productId.toString() && ci.variantId === rate.variantId
      )
      const need = conf ? conf.quantity : (rate.dailyQty || 1)
      if (need > 0 && s.available < need) stockIssues.push(`${s.name}: need ${need}, have ${s.available}`)
    })

    return { ...log, stockOk: stockIssues.length === 0, stockIssues, stockInfo }
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

  const { branchId, date, customerId, status, paymentType, cashPaid, items: qtyOverrides } = await req.json()

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

  const effectiveDate = date ?? today()
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

  // Quantity can flex day-to-day (shop may take more/less than the standing order),
  // but price ALWAYS comes from the customer's locked config server-side — never trust
  // a client-supplied rate. Unmatched productId/variantId pairs are silently dropped.
  let dispatchList: Array<{ productId: any; variantId: string; lockedRate: number; qty: number }>

  if (Array.isArray(qtyOverrides) && qtyOverrides.length > 0) {
    dispatchList = qtyOverrides
      .map((o: any) => {
        const cfg = rates.find(
          (r: any) => r.productId.toString() === o.productId && r.variantId === o.variantId
        )
        const qty = Number(o.quantity)
        if (!cfg || !qty || qty <= 0) return null
        return { productId: cfg.productId, variantId: cfg.variantId, lockedRate: cfg.lockedRate, qty }
      })
      .filter((x: any): x is NonNullable<typeof x> => x !== null)
  } else if (Array.isArray(log.confirmedItems) && log.confirmedItems.length > 0) {
    // No explicit override from the client — fall back to what the customer confirmed on the
    // call the night before. Price still comes from the locked config, never the log.
    dispatchList = rates
      .map((r: any) => {
        const conf = log.confirmedItems.find(
          (ci: any) => ci.productId.toString() === r.productId.toString() && ci.variantId === r.variantId
        )
        const qty = conf ? Number(conf.quantity) : (r.dailyQty || 1)
        if (!qty || qty <= 0) return null
        return { productId: r.productId, variantId: r.variantId, lockedRate: r.lockedRate, qty }
      })
      .filter((x: any): x is NonNullable<typeof x> => x !== null)
  } else {
    dispatchList = rates.map((r: any) => ({
      productId: r.productId, variantId: r.variantId, lockedRate: r.lockedRate, qty: r.dailyQty || 1
    }))
  }

  if (dispatchList.length === 0) {
    return NextResponse.json({ error: 'No dispatchable items — adjust quantity or configure a regular order' }, { status: 400 })
  }

  const { default: Product } = await import('@/models/Product')
  const { default: Transaction } = await import('@/models/Transaction')

  // Batch-fetch every unique product in the dispatch list in one query instead of one
  // sequential findById per line, same as the main POS checkout route. Nothing is saved
  // until every line has been validated, so a dispatch that fails partway through (e.g.
  // insufficient stock on line 3) no longer leaves lines 1-2's stock partially deducted.
  const uniqueProductIds = [...new Set(dispatchList.map((r) => r.productId.toString()))]
  const products = await Product.find({ _id: { $in: uniqueProductIds } })
  const productMap = new Map(products.map((p) => [p._id.toString(), p]))
  const touchedProductIds = new Set<string>()

  let totalBill = 0
  let totalCOGS = 0
  const processedItems: any[] = []

  for (const rate of dispatchList) {
    const product = productMap.get(rate.productId.toString())
    if (!product) continue

    const variant = product.variants.find((v: any) => v.variantId === rate.variantId)
    if (!variant) continue

    const qty = rate.qty

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
      const totalDeduction = portion * qty

      if (poolEntry.stockQty < totalDeduction) {
        return NextResponse.json(
          { error: `Insufficient pool stock for ${product.name} (need ${totalDeduction}, have ${poolEntry.stockQty})` },
          { status: 400 }
        )
      }

      poolEntry.stockQty = Math.max(0, poolEntry.stockQty - totalDeduction)
      touchedProductIds.add(product._id.toString())

      totalBill += rate.lockedRate * qty
      totalCOGS += (poolEntry.buyingPrice ?? 0) * totalDeduction

      processedItems.push({
        productId: rate.productId,
        variantId: rate.variantId,
        quantity: qty,
        rateApplied: rate.lockedRate,
        isCustomOverride: false
      })
      continue
    }

    // ── Normal mode: deduct from variant branchDetail ─────────────────────────
    const branchDetail = variant.branchDetails.find(
      (bd: any) => bd.branchId.toString() === branchId
    )
    if (!branchDetail) continue

    if (branchDetail.stockLevel < qty) {
      return NextResponse.json(
        { error: `Insufficient stock for ${product.name}` },
        { status: 400 }
      )
    }

    branchDetail.stockLevel -= qty
    touchedProductIds.add(product._id.toString())
    totalBill += rate.lockedRate * qty
    totalCOGS += branchDetail.buyingPrice * qty

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

  // All lines validated — persist every touched product's stock change in parallel
  // (previously one sequential save per line, awaited one at a time).
  await Promise.all([...touchedProductIds].map((id) => productMap.get(id)!.save()))

  const netProfitAmount = totalBill - totalCOGS
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
      netProfitAmount
    },
    notes: 'Regular order'
  })

  // Update pre-computed daily summary (non-blocking) — same pattern as /api/transactions
  updateDailySummary(branchId, effectiveDate).catch(() => {})

  log.status = 'taken'
  log.transactionId = transaction._id
  log.updatedBy = userId as any
  await log.save()

  const result = transaction.toObject()
  if (role === 'MANAGER') {
    delete (result.financials as any).netProfitAmount
  }

  return NextResponse.json({ log, transaction: result })
}
