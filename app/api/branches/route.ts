import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Branch from '@/models/Branch'
import { validate, BranchCreateSchema } from '@/lib/validators'
import type { Role } from '@/types'

// GET /api/branches
// SUPER_ADMIN: all branches
// BRANCH_ADMIN: only their assigned branches (never reveals others exist)
// MANAGER: 403
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }

  if (role === 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await dbConnect()

  const filter =
    role === 'SUPER_ADMIN'
      ? {}
      : { _id: { $in: assignedBranches } }

  const branches = await Branch.find(filter).sort({ name: 1 }).lean()
  return NextResponse.json(branches)
}

// POST /api/branches — SUPER_ADMIN only
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = validate(BranchCreateSchema, body)
  if (!parsed.success) return parsed.response

  await dbConnect()
  const branch = await Branch.create(parsed.data)
  return NextResponse.json(branch, { status: 201 })
}
