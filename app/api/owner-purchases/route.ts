import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import type { Role } from '@/types'

// GET /api/owner-purchases?branchId=&from=&to=
// Lists stock purchases funded by a branch admin's own money (not store cash).
// SUPER_ADMIN: all branches (optionally filtered to one). BRANCH_ADMIN: their own branch only.
// MANAGER: 403 — this is an admin-only report, same as /api/withdrawals.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  if (role === 'MANAGER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const branchIdParam = sp.get('branchId')
  const from = sp.get('from')
  const to = sp.get('to')

  await dbConnect()
  const { default: Transaction } = await import('@/models/Transaction')

  const filter: Record<string, unknown> = { transactionType: 'Owner Purchase' }

  if (role === 'SUPER_ADMIN') {
    if (branchIdParam) filter.branchId = branchIdParam
  } else {
    filter.branchId = { $in: assignedBranches }
  }

  if (from || to) {
    filter.createdAt = {}
    if (from) (filter.createdAt as any).$gte = new Date(from)
    if (to) { const end = new Date(to); end.setDate(end.getDate() + 1); (filter.createdAt as any).$lt = end }
  }

  const purchases = await Transaction.find(filter)
    .populate('ownerId', 'name')
    .populate('branchId', 'name')
    .populate('items.productId', 'name unitType')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean()

  return NextResponse.json(purchases)
}
