import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Product from '@/models/Product'
import { validate, ProductUpdateSchema, BranchPricingSchema, VariantSchema, objectId } from '@/lib/validators'
import { assertBranchAccess, branchDenied } from '@/lib/utils'
import type { Role } from '@/types'

// PATCH /api/products/[id]
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

  // Variant push — sent as { pushVariant: { variantId, sizeLabel?, branchDetails? } }
  if (body.pushVariant !== undefined) {
    const vParsed = VariantSchema.safeParse({ branchDetails: [], ...body.pushVariant })
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

// PUT /api/products/[id] — set branch pricing for a variant
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
  const parsed = validate(BranchPricingSchema, body)
  if (!parsed.success) return parsed.response

  const { variantId, branchId, buyingPrice, mrpPrice, stockLevel } = parsed.data

  // BRANCH_ADMIN can only set stock for their own branches — 404 to prevent enumeration
  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const product = await Product.findOne({ _id: id, 'variants.variantId': variantId })
  if (!product) return NextResponse.json({ error: 'Product or variant not found' }, { status: 404 })

  const variant = product.variants.find((v: any) => v.variantId === variantId)
  const existing = variant.branchDetails.find((bd: any) => bd.branchId.toString() === branchId)

  if (existing) {
    if (buyingPrice !== undefined) existing.buyingPrice = buyingPrice
    if (mrpPrice !== undefined) existing.mrpPrice = mrpPrice
    if (stockLevel !== undefined) existing.stockLevel = stockLevel
  } else {
    variant.branchDetails.push({ branchId, buyingPrice, mrpPrice: mrpPrice ?? 0, stockLevel: stockLevel ?? 0 })
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
