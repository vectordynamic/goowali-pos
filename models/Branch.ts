import mongoose, { Schema, Document } from 'mongoose'

export interface BranchDocument extends Document {
  name: string
  address?: string
  contactPhone?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const BranchSchema = new Schema<BranchDocument>(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
)

BranchSchema.index({ name: 1 })

const Branch =
  mongoose.models.Branch ||
  mongoose.model<BranchDocument>('Branch', BranchSchema)

export default Branch
