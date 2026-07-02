import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import dbConnect from '@/lib/db'
import { validate, ChangePasswordSchema } from '@/lib/validators'
import type { Role } from '@/types'

// PATCH /api/account/password — self-service password change, SUPER_ADMIN/BRANCH_ADMIN only
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role } = session.user as { role: Role }
  if (role !== 'SUPER_ADMIN' && role !== 'BRANCH_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = validate(ChangePasswordSchema, body)
  if (!parsed.success) return parsed.response

  const { currentPassword, newPassword } = parsed.data

  await dbConnect()
  const { default: User } = await import('@/models/User')

  const user = await User.findById(session.user.id)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const matches = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!matches) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12)
  await user.save()

  return NextResponse.json({ message: 'Password updated' })
}
