import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import dbConnect from '@/lib/db'
import User from '@/models/User'
import { validate, UserCreateSchema } from '@/lib/validators'
import type { Role } from '@/types'

// GET /api/users
// SUPER_ADMIN: all users
// BRANCH_ADMIN: managers of their branches + themselves (never reveals other admins/branches)
// MANAGER: 403
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches, id } = session.user as {
    role: Role
    assignedBranches: string[]
    id: string
  }

  if (role === 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await dbConnect()

  let filter: Record<string, unknown> = {}

  if (role === 'BRANCH_ADMIN') {
    // Sees only managers in their branches + themselves — no super admins or other admins revealed
    filter = {
      $or: [
        { _id: id },
        { role: 'MANAGER', assignedBranches: { $in: assignedBranches } }
      ]
    }
  }

  const users = await User.find(filter)
    .select('-passwordHash')
    .sort({ role: 1, name: 1 })
    .lean()

  return NextResponse.json(users)
}

// POST /api/users — SUPER_ADMIN creates any role; BRANCH_ADMIN creates MANAGER for their branches only
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const actor = session.user as { role: Role; assignedBranches: string[] }

  if (actor.role === 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = validate(UserCreateSchema, body)
  if (!parsed.success) return parsed.response

  const { name, phone, password, role, assignedBranches } = parsed.data

  // MANAGER and BRANCH_ADMIN must always have at least one branch
  if (role !== 'SUPER_ADMIN' && assignedBranches.length === 0) {
    return NextResponse.json(
      { error: 'Please assign at least one branch for this role' },
      { status: 400 }
    )
  }

  // BRANCH_ADMIN can only create MANAGERs for their own branches
  if (actor.role === 'BRANCH_ADMIN') {
    if (role !== 'MANAGER') {
      return NextResponse.json(
        { error: 'Branch admins can only create managers' },
        { status: 403 }
      )
    }
    const allowed = assignedBranches.every((b) => actor.assignedBranches.includes(b))
    if (!allowed) {
      return NextResponse.json(
        { error: 'Cannot assign manager to branches you do not manage' },
        { status: 403 }
      )
    }
  }

  await dbConnect()

  const existing = await User.findOne({ phone })
  if (existing) {
    return NextResponse.json({ error: 'Phone number already in use' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await User.create({ name, phone, passwordHash, role, assignedBranches })

  const { passwordHash: _ph, ...safe } = user.toObject()
  return NextResponse.json(safe, { status: 201 })
}
