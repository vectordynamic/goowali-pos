import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Product from '@/models/Product'
import { assertBranchAccess, branchDenied, stripSensitiveProductData } from '@/lib/utils'
import { validate, ProductCreateSchema } from '@/lib/validators'
import type { Role } from '@/types'
import mongoose from 'mongoose'

// Common projection shape: keep every top-level product field, but let the caller supply
// the $filter condition used to trim variants[].branchDetails / pooledStock down to only
// the branch(es) that matter — done in the DB, not by pulling every branch's data over the
// wire and discarding most of it in application code afterward.
function branchScopedProjection(branchDetailsCond: unknown, pooledStockCond: unknown) {
  return {
    productCode: 1, name: 1, category: 1, unitType: 1, isOpenLoose: 1, isPooled: 1,
    createdAt: 1, updatedAt: 1,
    variants: {
      $map: {
        input: '$variants',
        as: 'v',
        in: {
          variantId: '$$v.variantId',
          sizeLabel: '$$v.sizeLabel',
          portionSize: '$$v.portionSize',
          branchDetails: { $filter: { input: '$$v.branchDetails', as: 'bd', cond: branchDetailsCond } },
        },
      },
    },
    pooledStock: { $filter: { input: '$pooledStock', as: 'ps', cond: pooledStockCond } },
  }
}

// GET /api/products?branchId=xxx  (branch-specific, manager-safe)
// GET /api/products?all=1          (admin global view, no stripping)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  const branchId = req.nextUrl.searchParams.get('branchId')
  const all = req.nextUrl.searchParams.get('all') === '1'
  // stock context: manager is adding stock and needs to see/update buying price
  const stockContext = req.nextUrl.searchParams.get('context') === 'stock'

  await dbConnect()

  // Admin global view
  if (all && role !== 'MANAGER') {
    // BRANCH_ADMIN gets every product but only their own branches' stock/pricing —
    // filtered server-side instead of fetching every branch's data and discarding most of it.
    if (role === 'BRANCH_ADMIN') {
      const branchOids = assignedBranches.map((b) => new mongoose.Types.ObjectId(b))
      const products = await Product.aggregate([
        { $project: branchScopedProjection({ $in: ['$$bd.branchId', branchOids] }, { $in: ['$$ps.branchId', branchOids] }) },
      ])
      return NextResponse.json(products)
    }

    const products = await Product.find({}).lean()
    return NextResponse.json(products)
  }

  if (!branchId) {
    return NextResponse.json({ error: 'branchId is required' }, { status: 400 })
  }

  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  const branchOid = new mongoose.Types.ObjectId(branchId)
  const filtered = await Product.aggregate([
    { $match: { 'variants.branchDetails.branchId': branchOid } },
    { $project: branchScopedProjection({ $eq: ['$$bd.branchId', branchOid] }, { $eq: ['$$ps.branchId', branchOid] }) },
  ])

  // In stock management context, manager needs to see buying price to update it
  const sanitized = stockContext ? filtered : stripSensitiveProductData(filtered, role)
  return NextResponse.json(sanitized)
}

// POST /api/products — BRANCH_ADMIN and SUPER_ADMIN only
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role } = session.user as { role: Role }
  if (role === 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = validate(ProductCreateSchema, body)
  if (!parsed.success) return parsed.response

  await dbConnect()

  const duplicate = await Product.findOne({ productCode: parsed.data.productCode })
  if (duplicate) {
    return NextResponse.json({ error: `Product code "${parsed.data.productCode}" already exists` }, { status: 409 })
  }

  const product = await Product.create(parsed.data)
  return NextResponse.json(product, { status: 201 })
}
