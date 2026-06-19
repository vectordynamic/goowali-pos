import mongoose, { Schema, Document, Types } from 'mongoose'

export type DailyOrderStatus = 'pending' | 'taken' | 'skipped'

export interface DailyOrderLogDocument extends Document {
  branchId: Types.ObjectId
  date: string
  customerId: Types.ObjectId
  status: DailyOrderStatus
  transactionId?: Types.ObjectId
  updatedBy?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const DailyOrderLogSchema = new Schema<DailyOrderLogDocument>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    date: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    status: { type: String, enum: ['pending', 'taken', 'skipped'], default: 'pending' },
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
