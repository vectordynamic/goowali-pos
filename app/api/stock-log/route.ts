import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import { assertBranchAccess, branchDenied, today } from '@/lib/utils'
import { updateDailySummary } from '@/lib/update-daily-summary'
import type { Role } from '@/types'
import { z } from 'zod'
import { objectId } from '@/lib/validators'

const StockUpdateSchema = z.object({
  branchId: objectId,
  productId: objectId,
  variantId: z.string().min(1),
  action: z.enum(['add', 'set']),
  quantity: z.number().positive('Quantity must be positive'),
  buyingPrice: z.number().min(0).optional(),
  recordAsPurchase: z.boolean().default(false),
  notes: z.string().trim().max(300).optional()
})

// POST /api/stock-log — manager or admin updates stock for a branch
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: userId, role, assignedBranches } = session.user as {
    id: string; role: Role; assignedBranches: string[]
  }

  const body = await req.json()
  const parsed = StockUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', errors: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) },
      { status: 400 }
    )
  }

  const { branchId, productId, variantId, action, quantity, buyingPrice, recordAsPurchase, notes } = parsed.data

  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const { default: Product } = await import('@/models/Product')
  const { default: StockLog } = await import('@/models/StockLog')

  const product = await Product.findOne({ _id: productId, 'variants.variantId': variantId })
  if (!product) return NextResponse.json({ error: 'Product or variant not found' }, { status: 404 })

  const variant = product.variants.find((v: any) => v.variantId === variantId)
  let bd = variant.branchDetails.find((b: any) => b.branchId.toString() === branchId)

  if (!bd) {
    variant.branchDetails.push({ branchId, stockLevel: 0, buyingPrice: buyingPrice ?? 0 })
    bd = variant.branchDetails[variant.branchDetails.length - 1]
  }

  const quantityBefore = bd.stockLevel
  const buyingPriceBefore = bd.buyingPrice

  const quantityAfter = action === 'add' ? quantityBefore + quantity : quantity
  const quantityChange = quantityAfter - quantityBefore

  bd.stockLevel = quantityAfter
  if (buyingPrice !== undefined) bd.buyingPrice = buyingPrice

  await product.save()

  const effectiveBuyingPrice = buyingPrice !== undefined ? buyingPrice : buyingPriceBefore
  const totalPurchaseCost = recordAsPurchase && effectiveBuyingPrice
    ? Math.abs(quantityChange) * effectiveBuyingPrice
    : undefined

  const log = await StockLog.create({
    branchId,
    productId,
    variantId,
    action,
    quantityBefore,
    quantityChange,
    quantityAfter,
    buyingPriceBefore,
    buyingPriceAfter: buyingPrice !== undefined ? buyingPrice : undefined,
    paidFromCash: recordAsPurchase,
    totalPurchaseCost,
    notes,
    recordedBy: userId
  })

  let procurementId: string | undefined

  // If manager paid from store cash, record a Procurement transaction (cash outflow)
  if (recordAsPurchase && buyingPrice !== undefined && buyingPrice > 0) {
    const { default: Transaction } = await import('@/models/Transaction')
    const { generateInvoiceId } = await import('@/lib/utils')

    const totalCost = quantity * buyingPrice
    const txn = await Transaction.create({
      invoiceId: generateInvoiceId(branchId),
      branchId,
      recordedBy: userId,
      transactionType: 'Procurement',
      items: [{ productId, variantId, quantity, rateApplied: buyingPrice, isCustomOverride: false }],
      financials: { totalBill: totalCost, cashPaid: totalCost, amountAddedToKhata: 0, netProfitAmount: -totalCost },
      notes: notes ?? `Stock purchase — ${product.name} (${variantId})`
    })
    procurementId = txn._id.toString()
  }

  // Update pre-computed daily summary if a procurement was recorded (non-blocking)
  if (recordAsPurchase) {
    updateDailySummary(branchId, today()).catch(() => {})
  }

  return NextResponse.json({
    stockLevel: quantityAfter,
    log: log._id,
    procurementId
  })
}

// GET /api/stock-log — admin/super admin reads history
// Query: branchId (required for BRANCH_ADMIN/MANAGER), productId?, date?
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }

  // Managers can only view, not query across branches
  const sp = req.nextUrl.searchParams
  const branchId = sp.get('branchId')
  const productId = sp.get('productId')
  const date = sp.get('date') // YYYY-MM-DD, filters to that calendar day

  if (role !== 'SUPER_ADMIN' && !branchId) {
    return NextResponse.json({ error: 'branchId required' }, { status: 400 })
  }
  if (branchId && !assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()
  const { default: StockLog } = await import('@/models/StockLog')

  const filter: Record<string, unknown> = {}
  if (branchId) filter.branchId = branchId
  if (productId) filter.productId = productId
  if (date) {
    const start = new Date(date + 'T00:00:00.000Z')
    const end = new Date(date + 'T23:59:59.999Z')
    filter.createdAt = { $gte: start, $lte: end }
  }

  const logs = await StockLog.find(filter)
    .populate('productId', 'name unitType')
    .populate('recordedBy', 'name role')
    .populate('branchId', 'name')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean()

  return NextResponse.json(logs)
}
