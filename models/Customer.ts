import mongoose, { Schema, Document, Types } from 'mongoose'
import type { CustomerType } from '@/types'

export interface CustomerDocument extends Document {
  name: string
  phone: string
  location?: string
  customerType: CustomerType
  registeredBranch?: Types.ObjectId
  createdBy?: Types.ObjectId
  paikariConfig: {
    deliveryMethod: 'Pickup' | 'Send'
    dailyRequirementLiters: number
    fixedProductRates: Array<{
      productId: Types.ObjectId
      variantId: string
      lockedRate: number
      dailyQty: number
    }>
  }
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
    phone: { type: String, required: true, unique: true, trim: true, index: true },
    location: { type: String, trim: true },
    customerType: {
      type: String,
      enum: ['Retail', 'Paikari'],
      required: true
    },
    registeredBranch: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    paikariConfig: {
      deliveryMethod: { type: String, enum: ['Pickup', 'Send'], default: 'Pickup' },
      dailyRequirementLiters: { type: Number, default: 0 },
      fixedProductRates: { type: [FixedRateSchema], default: [] }
    },
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
