import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import { assertBranchAccess, branchDenied } from '@/lib/utils'
import type { Role } from '@/types'

// GET /api/branch-admins?branchId=xxx — minimal { _id, name } list of BRANCH_ADMINs for the
// given branch, used by the "owner paid" stock picker. Branch is taken from the query so a
// SUPER_ADMIN (or a multi-branch admin) viewing another branch's stock still gets that branch's
// owners — not just their own session's first branch. Access is always checked.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }

  // Fall back to the caller's own first branch when no branchId is supplied (legacy callers).
  const branchId = req.nextUrl.searchParams.get('branchId') ?? assignedBranches[0]
  if (!branchId) return NextResponse.json([])

  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()
  const { default: User } = await import('@/models/User')

  const admins = await User.find({ role: 'BRANCH_ADMIN', assignedBranches: branchId, isActive: true })
    .select('_id name')
    .sort({ name: 1 })
    .lean()

  return NextResponse.json(admins.map((a: any) => ({ _id: a._id.toString(), name: a.name })))
}
