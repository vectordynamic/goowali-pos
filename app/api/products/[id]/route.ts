import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Product from '@/models/Product'
import {
  validate,
  ProductUpdateSchema,
  BranchPricingSchema,
  VariantSchema,
  objectId,
  PooledStockEntrySchema,
} from '@/lib/validators'
import { assertBranchAccess, branchDenied } from '@/lib/utils'
import type { Role } from '@/types'

// PATCH /api/products/[id]
// Handles: pushVariant | general product field update
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role } = session.user as { role: Role }
  if (role === 'MANAGER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const idCheck = objectId.safeParse(id)
  if (!idCheck.success) return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 })

  const body = await req.json()

  // Variant push — sent as { pushVariant: { variantId, sizeLabel?, portionSize?, branchDetails? } }
  if (body.pushVariant !== undefined) {
    const vParsed = VariantSchema.safeParse({ branchDetails: [], portionSize: 0, ...body.pushVariant })
    if (!vParsed.success) {
      return NextResponse.json(
        { error: 'Invalid variant', errors: vParsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) },
        { status: 400 }
      )
    }
    await dbConnect()
    const exists = await Product.findOne({ _id: id, 'variants.variantId': vParsed.data.variantId })
    if (exists) return NextResponse.json({ error: `Variant ID "${vParsed.data.variantId}" already exists` }, { status: 409 })

    const product = await Product.findByIdAndUpdate(
      id,
      { $push: { variants: vParsed.data } },
      { new: true }
    )
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    return NextResponse.json(product)
  }

  const parsed = validate(ProductUpdateSchema, body)
  if (!parsed.success) return parsed.response

  await dbConnect()
  const product = await Product.findByIdAndUpdate(
    id,
    { $set: parsed.data },
    { new: true, runValidators: true }
  )
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  return NextResponse.json(product)
}

// PUT /api/products/[id]
// - Pooled product + setPooledStock:true → update pool tank (branchId, stockQty, buyingPrice)
// - Pooled product, no flag            → update variant mrpPrice only (stockLevel ignored)
// - Normal product                     → update variant branchDetails (buyingPrice, mrpPrice, stockLevel)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  if (role === 'MANAGER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const idCheck = objectId.safeParse(id)
  if (!idCheck.success) return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 })

  const body = await req.json()

  // ── Pooled stock set ────────────────────────────────────────────────────────
  if (body.setPooledStock === true) {
    const parsed = PooledStockEntrySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid pool stock data', errors: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) },
        { status: 400 }
      )
    }
    const { branchId, stockQty, buyingPrice } = parsed.data
    if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

    await dbConnect()
    const product = await Product.findById(id)
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    if (!product.isPooled) return NextResponse.json({ error: 'Product is not in pool mode' }, { status: 400 })

    const existingPool = product.pooledStock.find((p: any) => p.branchId.toString() === branchId)
    if (existingPool) {
      existingPool.stockQty = stockQty
      if (buyingPrice !== undefined) existingPool.buyingPrice = buyingPrice
    } else {
      product.pooledStock.push({ branchId, stockQty, buyingPrice: buyingPrice ?? 0 })
    }
    await product.save()
    return NextResponse.json(product)
  }

  // ── Variant pricing / stock set ─────────────────────────────────────────────
  const parsed = validate(BranchPricingSchema, body)
  if (!parsed.success) return parsed.response

  const { variantId, branchId, buyingPrice, mrpPrice, stockLevel } = parsed.data

  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const product = await Product.findOne({ _id: id, 'variants.variantId': variantId })
  if (!product) return NextResponse.json({ error: 'Product or variant not found' }, { status: 404 })

  const variant = product.variants.find((v: any) => v.variantId === variantId)
  const existing = variant.branchDetails.find((bd: any) => bd.branchId.toString() === branchId)

  if (existing) {
    if (buyingPrice !== undefined) existing.buyingPrice = buyingPrice
    if (mrpPrice !== undefined) existing.mrpPrice = mrpPrice
    // stockLevel ignored for pooled products — pool tank is the source of truth
    if (stockLevel !== undefined && !product.isPooled) existing.stockLevel = stockLevel
  } else {
    variant.branchDetails.push({
      branchId,
      buyingPrice: buyingPrice ?? 0,
      mrpPrice: mrpPrice ?? 0,
      stockLevel: product.isPooled ? 0 : (stockLevel ?? 0),
    })
  }

  await product.save()
  return NextResponse.json(product)
}

// DELETE /api/products/[id] — SUPER_ADMIN only
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const idCheck = objectId.safeParse(id)
  if (!idCheck.success) return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 })

  await dbConnect()
  await Product.findByIdAndDelete(id)
  return NextResponse.json({ message: 'Product deleted' })
}
