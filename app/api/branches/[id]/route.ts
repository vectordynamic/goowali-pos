import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Branch from '@/models/Branch'
import { validate, BranchUpdateSchema, objectId } from '@/lib/validators'

// PATCH /api/branches/[id] — SUPER_ADMIN only
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const idCheck = objectId.safeParse(id)
  if (!idCheck.success) return NextResponse.json({ error: 'Invalid branch ID' }, { status: 400 })

  const body = await req.json()
  const parsed = validate(BranchUpdateSchema, body)
  if (!parsed.success) return parsed.response

  await dbConnect()
  const branch = await Branch.findByIdAndUpdate(
    id,
    { $set: parsed.data },
    { new: true, runValidators: true }
  )

  if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
  return NextResponse.json(branch)
}

// DELETE /api/branches/[id] — SUPER_ADMIN only (soft delete)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const idCheck = objectId.safeParse(id)
  if (!idCheck.success) return NextResponse.json({ error: 'Invalid branch ID' }, { status: 400 })

  await dbConnect()
  const branch = await Branch.findByIdAndUpdate(id, { isActive: false }, { new: true })
  if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
  return NextResponse.json({ message: 'Branch deactivated' })
}
