import mongoose, { Schema, Document, Types } from 'mongoose'

export type DailyOrderStatus = 'pending' | 'taken' | 'skipped'
export type CallStatus = 'not_called' | 'called' | 'no_answer' | 'skipped'

export interface ConfirmedItem {
  productId: Types.ObjectId
  variantId: string
  quantity: number
}

export interface DailyOrderLogDocument extends Document {
  branchId: Types.ObjectId
  date: string
  customerId: Types.ObjectId
  status: DailyOrderStatus
  // ── Call-sheet (next-day planning) fields ──────────────────────────────────
  callStatus: CallStatus
  confirmedItems: ConfirmedItem[]
  overrideDeliveryTime?: string
  callNotes?: string
  calledBy?: Types.ObjectId
  calledAt?: Date
  isTemporary: boolean
  transactionId?: Types.ObjectId
  updatedBy?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const ConfirmedItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: String, required: true },
    quantity: { type: Number, required: true }
  },
  { _id: false }
)

const DailyOrderLogSchema = new Schema<DailyOrderLogDocument>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    date: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    status: { type: String, enum: ['pending', 'taken', 'skipped'], default: 'pending' },
    callStatus: {
      type: String,
      enum: ['not_called', 'called', 'no_answer', 'skipped'],
      default: 'not_called'
    },
    confirmedItems: { type: [ConfirmedItemSchema], default: [] },
    overrideDeliveryTime: { type: String },
    callNotes: { type: String, trim: true },
    calledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    calledAt: { type: Date },
    // true = one-time booking of a temporary customer for this date only
    isTemporary: { type: Boolean, default: false },
    transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
)

// One log per customer per branch per day
DailyOrderLogSchema.index({ branchId: 1, date: 1, customerId: 1 }, { unique: true })
DailyOrderLogSchema.index({ branchId: 1, date: 1 })

const DailyOrderLog =
  mongoose.models.DailyOrderLog ||
  mongoose.model<DailyOrderLogDocument>('DailyOrderLog', DailyOrderLogSchema)

export default DailyOrderLog
