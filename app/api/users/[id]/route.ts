import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import dbConnect from '@/lib/db'
import User from '@/models/User'
import { validate, UserUpdateSchema, objectId } from '@/lib/validators'
import type { Role } from '@/types'

async function getActorAndTarget(id: string) {
  const idCheck = objectId.safeParse(id)
  if (!idCheck.success) return { error: 'Invalid user ID', status: 400 }

  const session = await getServerSession(authOptions)
  if (!session) return { error: 'Unauthorized', status: 401 }

  const actor = session.user as { role: Role; assignedBranches: string[]; id: string }
  if (actor.role === 'MANAGER') return { error: 'Forbidden', status: 403 }

  await dbConnect()
  const target = await User.findById(id)
  if (!target) return { error: 'User not found', status: 404 }

  // BRANCH_ADMIN can only manage MANAGERs in their own branches
  if (actor.role === 'BRANCH_ADMIN') {
    if (target.role !== 'MANAGER') return { error: 'Forbidden', status: 403 }
    const hasAccess = target.assignedBranches.some((b: any) =>
      actor.assignedBranches.includes(b.toString())
    )
    if (!hasAccess) return { error: 'Forbidden', status: 403 }
  }

  return { actor, target }
}

// PATCH /api/users/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ctx = await getActorAndTarget(id)
  if ('error' in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  }

  const { actor, target } = ctx
  const body = await req.json()
  const parsed = validate(UserUpdateSchema, body)
  if (!parsed.success) return parsed.response

  const { name, phone, password, role, assignedBranches, isActive } = parsed.data

  // BRANCH_ADMIN cannot elevate role or assign to branches outside their own —
  // generic message on purpose, never hints that other branches exist
  if (actor.role === 'BRANCH_ADMIN') {
    if (role && role !== 'MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (assignedBranches) {
      const allowed = assignedBranches.every((b) => actor.assignedBranches.includes(b))
      if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
  }

  // Ensure non-SUPER_ADMIN always has at least one branch
  const finalRole = (role && actor.role === 'SUPER_ADMIN') ? role : target.role
  const finalBranches = assignedBranches !== undefined ? assignedBranches : target.assignedBranches
  if (finalRole !== 'SUPER_ADMIN' && finalBranches.length === 0) {
    return NextResponse.json(
      { error: 'Please assign at least one branch for this role' },
      { status: 400 }
    )
  }

  if (name) target.name = name
  if (phone) target.phone = phone
  if (password) target.passwordHash = await bcrypt.hash(password, 12)
  if (role && actor.role === 'SUPER_ADMIN') target.role = role
  if (assignedBranches !== undefined) target.assignedBranches = assignedBranches
  if (isActive !== undefined) target.isActive = isActive

  await target.save()
  const { passwordHash: _ph, ...safe } = target.toObject()
  return NextResponse.json(safe)
}

// DELETE /api/users/[id] — soft delete
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ctx = await getActorAndTarget(id)
  if ('error' in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  }

  const { target } = ctx
  target.isActive = false
  await target.save()
  return NextResponse.json({ message: 'User deactivated' })
}
