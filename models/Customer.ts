import mongoose, { Schema, Document, Types } from 'mongoose'
import type { CustomerType, CustomerApprovalStatus } from '@/types'

export interface CustomerDocument extends Document {
  name: string
  phone: string
  location?: string
  customerType: CustomerType
  registeredBranch: Types.ObjectId
  createdBy?: Types.ObjectId
  paikariConfig: {
    deliveryMethod: 'Pickup' | 'Send'
    deliveryTime: string
    dailyRequirementLiters: number
    fixedProductRates: Array<{
      productId: Types.ObjectId
      variantId: string
      lockedRate: number
      dailyQty: number
    }>
  }
  approvalStatus: CustomerApprovalStatus
  approvalRequestedBy?: Types.ObjectId
  approvalRequestedAt?: Date
  approvalNote?: string
  khata: {
    currentDue: number
    lastPaymentDate?: Date
    creditLimit: number
  }
  createdAt: Date
  updatedAt: Date
}

const FixedRateSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: String, required: true },
    lockedRate: { type: Number, required: true },
    dailyQty: { type: Number, default: 1 }
  },
  { _id: false }
)

const CustomerSchema = new Schema<CustomerDocument>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: false, unique: true, sparse: true, trim: true },
    location: { type: String, trim: true },
    customerType: {
      type: String,
      enum: ['Retail', 'Paikari'],
      required: true
    },
    registeredBranch: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    paikariConfig: {
      deliveryMethod: { type: String, enum: ['Pickup', 'Send'], default: 'Pickup' },
      // Preferred pickup/delivery time in 24h "HH:mm". Standing default; a single day can
      // be overridden per-call via DailyOrderLog.overrideDeliveryTime.
      deliveryTime: { type: String, default: '06:00' },
      dailyRequirementLiters: { type: Number, default: 0 },
      fixedProductRates: { type: [FixedRateSchema], default: [] }
    },
    // Permanent-customer lifecycle. Existing rows have no value → treated as 'approved'
    // everywhere (migration-safe queries use $ne/$nin, never { approvalStatus: 'approved' }).
    approvalStatus: {
      type: String,
      enum: ['approved', 'pending', 'rejected', 'temporary'],
      default: 'approved',
      index: true
    },
    approvalRequestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvalRequestedAt: { type: Date },
    approvalNote: { type: String, trim: true },
    khata: {
      currentDue: { type: Number, default: 0 },
      lastPaymentDate: { type: Date },
      creditLimit: { type: Number, default: 5000 }
    }
  },
  { timestamps: true }
)

CustomerSchema.index({ customerType: 1 })
CustomerSchema.index({ 'khata.currentDue': 1 })

const Customer =
  mongoose.models.Customer ||
  mongoose.model<CustomerDocument>('Customer', CustomerSchema)

export default Customer
