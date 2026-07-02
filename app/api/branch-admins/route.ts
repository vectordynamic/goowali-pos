import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import type { Role } from '@/types'

// GET /api/branch-admins — minimal { _id, name } list of BRANCH_ADMINs for the caller's own
// branch. Used by the manager's "owner paid" stock picker — never exposes other branches or
// SUPER_ADMIN. Branch is always resolved from the caller's own session, never from a query param.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  if (role !== 'MANAGER' && role !== 'BRANCH_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const branchId = assignedBranches[0]
  if (!branchId) return NextResponse.json([])

  await dbConnect()
  const { default: User } = await import('@/models/User')

  const admins = await User.find({ role: 'BRANCH_ADMIN', assignedBranches: branchId, isActive: true })
    .select('_id name')
    .sort({ name: 1 })
    .lean()

  return NextResponse.json(admins.map((a: any) => ({ _id: a._id.toString(), name: a.name })))
}
