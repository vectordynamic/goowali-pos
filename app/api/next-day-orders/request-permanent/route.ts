import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import { assertBranchAccess, branchDenied } from '@/lib/utils'
import { validate, RequestPermanentSchema } from '@/lib/validators'
import type { Role } from '@/types'

// POST /api/next-day-orders/request-permanent
// A manager asks an admin to promote a temporary customer to a permanent Paikari customer.
// Body: RequestPermanentSchema
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches, id: userId } = session.user as {
    role: Role
    assignedBranches: string[]
    id: string
  }

  const parsed = validate(RequestPermanentSchema, await req.json())
  if (!parsed.success) return parsed.response

  const { customerId, note } = parsed.data

  await dbConnect()

  const { default: Customer } = await import('@/models/Customer')

  const customer = await Customer.findById(customerId)
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  // Cross-branch guard — 404 to avoid existence leak, same pattern as /api/customers/[id].
  if (!assertBranchAccess(role, assignedBranches, customer.registeredBranch?.toString() ?? '')) {
    return branchDenied()
  }

  // Only a one-time (or previously rejected) booking can be put up for approval.
  if (!['temporary', 'rejected'].includes(customer.approvalStatus)) {
    return NextResponse.json(
      { error: 'Only a temporary customer can be requested permanent' },
      { status: 400 }
    )
  }

  customer.approvalStatus = 'pending'
  customer.approvalRequestedBy = userId as any
  customer.approvalRequestedAt = new Date()
  if (note !== undefined) customer.approvalNote = note
  await customer.save()

  return NextResponse.json({ customer })
}
