import dbConnect from './db'
import bcrypt from 'bcryptjs'

export async function seedAdmin() {
  const name = process.env.SUPER_ADMIN_NAME
  const phone = process.env.SUPER_ADMIN_PHONE
  const password = process.env.SUPER_ADMIN_PASSWORD

  if (!name || !phone || !password) {
    console.warn('[ShopMS] SUPER_ADMIN_NAME / PHONE / PASSWORD not set — skipping admin seed')
    return
  }

  await dbConnect()
  const { default: User } = await import('@/models/User')

  const existing = await User.findOne({ role: 'SUPER_ADMIN' })
  if (existing) return

  const passwordHash = await bcrypt.hash(password, 12)
  await User.create({
    name,
    phone,
    passwordHash,
    role: 'SUPER_ADMIN',
    assignedBranches: [],
    isActive: true
  })

  console.log(`[ShopMS] Super admin created — phone: ${phone}`)
}
