import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Product from '@/models/Product'
import { assertBranchAccess, branchDenied, stripSensitiveProductData } from '@/lib/utils'
import { validate, ProductCreateSchema } from '@/lib/validators'
import type { Role } from '@/types'

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
    const products = await Product.find({}).lean()
    return NextResponse.json(products)
  }

  if (!branchId) {
    return NextResponse.json({ error: 'branchId is required' }, { status: 400 })
  }

  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  const products = await Product.find({
    'variants.branchDetails.branchId': branchId
  }).lean()

  const filtered = products.map((p) => ({
    ...p,
    variants: p.variants.map((v: any) => ({
      ...v,
      branchDetails: v.branchDetails.filter(
        (bd: any) => bd.branchId.toString() === branchId
      )
    }))
  }))

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
  const product = await Product.create(parsed.data)
  return NextResponse.json(product, { status: 201 })
}
