import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Customer from '@/models/Customer'
import Transaction from '@/models/Transaction'
import { assertBranchAccess, branchDenied, generateInvoiceId } from '@/lib/utils'
import { validate, CustomerUpdateSchema, DispatchSchema, DueCollectionSchema, objectId } from '@/lib/validators'
import type { Role } from '@/types'

// GET /api/customers/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const idCheck = objectId.safeParse(id)
  if (!idCheck.success) return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }

  await dbConnect()
  const customer = await Customer.findById(id).lean()
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // BRANCH_ADMIN/MANAGER can only view customers from their branches — 404 to avoid existence leak.
  // Fail closed: a customer with no registeredBranch is treated as inaccessible, not as unrestricted.
  const cust = customer as any
  if (role !== 'SUPER_ADMIN') {
    if (!cust.registeredBranch || !assignedBranches.includes(cust.registeredBranch.toString())) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  return NextResponse.json(customer)
}

// PATCH /api/customers/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const idCheck = objectId.safeParse(id)
  if (!idCheck.success) return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }

  const body = await req.json()
  const parsed = validate(CustomerUpdateSchema, body)
  if (!parsed.success) return parsed.response

  await dbConnect()

  const existing = await Customer.findById(id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Branch access check — 404 to avoid existence leak. Fail closed: no registeredBranch means
  // no access, not open access.
  if (role !== 'SUPER_ADMIN') {
    const existingBranch = (existing as any).registeredBranch
    if (!existingBranch || !assignedBranches.includes(existingBranch.toString())) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Can't reassign a customer to a branch outside what you manage — otherwise a branch
    // admin could move a customer they own into a branch they don't (or vice versa).
    // Generic message on purpose — never hints that other branches exist.
    if (parsed.data.registeredBranch && !assignedBranches.includes(parsed.data.registeredBranch)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const customer = await Customer.findByIdAndUpdate(
    id,
    { $set: parsed.data },
    { new: true, runValidators: true }
  )
  return NextResponse.json(customer)
}

// POST /api/customers/[id]?action=dispatch|collect
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: customerId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const idCheck = objectId.safeParse(customerId)
  if (!idCheck.success) return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 })

  const { role, assignedBranches, id: userId } = session.user as {
    role: Role
    assignedBranches: string[]
    id: string
  }

  const action = req.nextUrl.searchParams.get('action')

  if (action === 'dispatch') {
    return handleDispatch(req, customerId, { role, assignedBranches, userId })
  }
  if (action === 'collect') {
    return handleDueCollection(req, customerId, { role, assignedBranches, userId })
  }
  if (action === 'auto-dispatch') {
    return handleAutoDispatch(req, customerId, { role, assignedBranches, userId })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

async function handleDispatch(
  req: NextRequest,
  customerId: string,
  ctx: { role: Role; assignedBranches: string[]; userId: string }
) {
  const body = await req.json()
  const parsed = validate(DispatchSchema, body)
  if (!parsed.success) return parsed.response

  const { branchId, items } = parsed.data

  if (!assertBranchAccess(ctx.role, ctx.assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const customer = await Customer.findById(customerId)
  if (!customer || customer.customerType !== 'Paikari') {
    return NextResponse.json({ error: 'Paikari customer not found' }, { status: 404 })
  }
  // The branchId in the request must actually be this customer's registered branch —
  // otherwise a manager could dispatch stock against another branch's customer.
  if (customer.registeredBranch?.toString() !== branchId) {
    return NextResponse.json({ error: 'Paikari customer not found' }, { status: 404 })
  }

  const Product = (await import('@/models/Product')).default

  let totalBill = 0
  const processedItems = []

  for (const item of items) {
    if (item.skipped) continue

    const product = await Product.findById(item.productId)
    if (!product) continue

    const variant = product.variants.find((v: any) => v.variantId === item.variantId)
    if (!variant) continue

    const branchDetail = variant.branchDetails.find(
      (bd: any) => bd.branchId.toString() === branchId
    )
    if (!branchDetail || branchDetail.stockLevel < item.quantity) {
      return NextResponse.json(
        { error: `Insufficient stock for ${product.name}` },
        { status: 400 }
      )
    }

    branchDetail.stockLevel -= item.quantity
    await product.save()
    totalBill += item.rateApplied * item.quantity

    processedItems.push({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      rateApplied: item.rateApplied,
      isCustomOverride: false
    })
  }

  customer.khata.currentDue += totalBill
  await customer.save()

  const transaction = await Transaction.create({
    invoiceId: generateInvoiceId(branchId),
    branchId,
    recordedBy: ctx.userId,
    customerId,
    transactionType: 'Credit Sale',
    items: processedItems,
    financials: {
      totalBill,
      cashPaid: 0,
      amountAddedToKhata: totalBill,
      netProfitAmount: 0
    },
    notes: 'Wholesale dispatch'
  })

  return NextResponse.json({ transaction, customer }, { status: 201 })
}

async function handleDueCollection(
  req: NextRequest,
  customerId: string,
  ctx: { role: Role; assignedBranches: string[]; userId: string }
) {
  const body = await req.json()
  const parsed = validate(DueCollectionSchema, body)
  if (!parsed.success) return parsed.response

  const { branchId, amountCollected, notes } = parsed.data

  if (!assertBranchAccess(ctx.role, ctx.assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const customer = await Customer.findById(customerId)
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  // Same cross-branch guard as dispatch — don't let a due collection be recorded against
  // a customer registered to a different branch than the one in the request.
  if (customer.registeredBranch?.toString() !== branchId) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  customer.khata.currentDue = Math.max(0, customer.khata.currentDue - amountCollected)
  customer.khata.lastPaymentDate = new Date()
  await customer.save()

  const transaction = await Transaction.create({
    invoiceId: generateInvoiceId(branchId),
    branchId,
    recordedBy: ctx.userId,
    customerId,
    transactionType: 'Due Collection',
    items: [],
    financials: {
      totalBill: amountCollected,
      cashPaid: amountCollected,
      amountAddedToKhata: 0,
      netProfitAmount: 0
    },
    notes: notes ?? 'Due collected'
  })

  return NextResponse.json({ transaction, customer }, { status: 201 })
}

// Auto-dispatch: uses Paikari customer's pre-configured daily rates.
// Manager confirms today's dispatch — no manual item entry.
// Body: { branchId, paymentMode: 'paid'|'partial'|'due', cashPaid?: number, notes? }
async function handleAutoDispatch(
  req: NextRequest,
  customerId: string,
  ctx: { role: Role; assignedBranches: string[]; userId: string }
) {
  const { branchId, paymentMode, cashPaid: cashPaidInput, notes } = await req.json()

  if (!branchId) {
    return NextResponse.json({ error: 'branchId is required' }, { status: 400 })
  }
  if (!['paid', 'partial', 'due'].includes(paymentMode)) {
    return NextResponse.json({ error: 'paymentMode must be paid, partial, or due' }, { status: 400 })
  }
  if (!assertBranchAccess(ctx.role, ctx.assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const customer = await Customer.findById(customerId)
  if (!customer || customer.customerType !== 'Paikari') {
    return NextResponse.json({ error: 'Paikari customer not found' }, { status: 404 })
  }
  if (customer.registeredBranch?.toString() !== branchId) {
    return NextResponse.json({ error: 'Paikari customer not found' }, { status: 404 })
  }

  const rates = customer.paikariConfig?.fixedProductRates ?? []
  if (rates.length === 0) {
    return NextResponse.json({ error: 'No fixed rates configured for this customer' }, { status: 400 })
  }

  const Product = (await import('@/models/Product')).default

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

    // Use per-rate daily qty, fall back to customer-level dailyRequirementLiters
    const qty = (rate as any).dailyQty || customer.paikariConfig.dailyRequirementLiters || 1
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

  const cashPaid =
    paymentMode === 'paid' ? totalBill :
    paymentMode === 'partial' ? Math.min(cashPaidInput ?? 0, totalBill) :
    0

  const amountAddedToKhata = totalBill - cashPaid

  if (amountAddedToKhata > 0) {
    customer.khata.currentDue += amountAddedToKhata
    await customer.save()
  }

  const txType =
    paymentMode === 'paid' ? 'Cash Sale' :
    paymentMode === 'partial' ? 'Partial Payment' :
    'Credit Sale'

  const transaction = await Transaction.create({
    invoiceId: generateInvoiceId(branchId),
    branchId,
    recordedBy: ctx.userId,
    customerId,
    transactionType: txType,
    items: processedItems,
    financials: {
      totalBill,
      cashPaid,
      amountAddedToKhata,
      netProfitAmount: 0
    },
    notes: notes ?? `Dispatch: ${paymentMode}`
  })

  return NextResponse.json({ transaction, customer }, { status: 201 })
}
