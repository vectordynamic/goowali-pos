/**
 * Creates the SUPER_ADMIN from .env.local — never from hardcoded values.
 * Run with: npm run seed
 * Required env vars: SUPER_ADMIN_PHONE, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME
 */

import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const MONGODB_URI = process.env.MONGODB_URI
const PHONE = process.env.SUPER_ADMIN_PHONE
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD
const NAME = process.env.SUPER_ADMIN_NAME

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not set in environment')
  process.exit(1)
}
if (!PHONE || !PASSWORD || !NAME) {
  console.error('ERROR: SUPER_ADMIN_PHONE, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME must all be set')
  process.exit(1)
}
if (!/^01[3-9]\d{8}$/.test(PHONE)) {
  console.error('ERROR: SUPER_ADMIN_PHONE must be 11 digits and start with 013–019')
  process.exit(1)
}
if (PASSWORD.length < 8) {
  console.error('ERROR: SUPER_ADMIN_PASSWORD must be at least 8 characters')
  process.exit(1)
}

const UserSchema = new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true },
  passwordHash: String,
  role: String,
  assignedBranches: [mongoose.Schema.Types.ObjectId],
  isActive: { type: Boolean, default: true }
})

const User = mongoose.models.User ?? mongoose.model('User', UserSchema)

async function seed() {
  await mongoose.connect(MONGODB_URI!)
  console.log('Connected to MongoDB')

  const existing = await User.findOne({ phone: PHONE })
  if (existing) {
    console.log(`Super admin already exists (phone: ${PHONE})`)
    await mongoose.disconnect()
    return
  }

  const passwordHash = await bcrypt.hash(PASSWORD!, 12)
  await User.create({
    name: NAME,
    phone: PHONE,
    passwordHash,
    role: 'SUPER_ADMIN',
    assignedBranches: []
  })

  console.log('✓ Super admin created')
  console.log(`  Name:  ${NAME}`)
  console.log(`  Phone: ${PHONE}`)
  await mongoose.disconnect()
}

seed().catch((e) => { console.error(e); process.exit(1) })
