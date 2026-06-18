import mongoose, { Schema, Document, Types } from 'mongoose'
import type { Role } from '@/types'

export interface UserDocument extends Document {
  name: string
  phone: string
  passwordHash: string
  role: Role
  assignedBranches: Types.ObjectId[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'],
      required: true
    },
    // SUPER_ADMIN: empty array (system grants all-branch access)
    // BRANCH_ADMIN: array of branch IDs they can see
    // MANAGER: array of branch IDs they operate in (usually one)
    assignedBranches: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
)

UserSchema.index({ role: 1 })
UserSchema.index({ assignedBranches: 1 })

const User =
  mongoose.models.User ||
  mongoose.model<UserDocument>('User', UserSchema)

export default User
