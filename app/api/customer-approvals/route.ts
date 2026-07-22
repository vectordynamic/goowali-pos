import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import { validate, ApprovalActionSchema } from '@/lib/validators'
import type { Role } from '@/types'

// GET /api/customer-approvals?branchId=&count=1
// Lists customers awaiting permanent approval. Admin / Branch Admin only.
// ?count=1 returns just { count } — used by the sidebar badge.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  if (role === 'MANAGER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const branchId = sp.get('branchId')
  const countOnly = sp.get('count') === '1'

  await dbConnect()

  const { default: Customer } = await import('@/models/Customer')

  const filter: Record<string, unknown> = { approvalStatus: 'pending' }
  if (role === 'SUPER_ADMIN') {
    if (branchId) filter.registeredBranch = branchId
  } else {
    const allowed = branchId && assignedBranches.includes(branchId) ? [branchId] : assignedBranches
    filter.registeredBranch = { $in: allowed }
  }

  if (countOnly) {
    const count = await Customer.countDocuments(filter)
    return NextResponse.json({ count })
  }

  const customers = await Customer.find(filter)
    .populate('approvalRequestedBy', 'name')
    .populate('registeredBranch', 'name')
    .sort({ approvalRequestedAt: 1 })
    .lean()

  return NextResponse.json(customers)
}

// PATCH /api/customer-approvals — approve or reject a pending request.
// Body: ApprovalActionSchema
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  if (role === 'MANAGER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = validate(ApprovalActionSchema, await req.json())
  if (!parsed.success) return parsed.response

  const { customerId, action, deliveryMethod, deliveryTime, fixedProductRates } = parsed.data

  await dbConnect()

  const { default: Customer } = await import('@/models/Customer')

  const customer = await Customer.findById(customerId)
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  // Branch access — 404 to avoid existence leak.
  if (role !== 'SUPER_ADMIN') {
    const b = customer.registeredBranch?.toString()
    if (!b || !assignedBranches.includes(b)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  if (customer.approvalStatus !== 'pending') {
    return NextResponse.json({ error: 'Request already resolved' }, { status: 409 })
  }

  if (action === 'reject') {
    customer.approvalStatus = 'rejected'
    await customer.save()
    return NextResponse.json({ customer })
  }

  // Approve — admin may adjust the locked rates / delivery before it goes permanent.
  customer.approvalStatus = 'approved'
  if (deliveryMethod) customer.paikariConfig.deliveryMethod = deliveryMethod
  if (deliveryTime) customer.paikariConfig.deliveryTime = deliveryTime
  if (fixedProductRates && fixedProductRates.length > 0) {
    customer.paikariConfig.fixedProductRates = fixedProductRates as any
    customer.paikariConfig.dailyRequirementLiters = fixedProductRates.reduce(
      (s, r) => s + (r.dailyQty || 0), 0
    )
  }
  await customer.save()

  return NextResponse.json({ customer })
}
