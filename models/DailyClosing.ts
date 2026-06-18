import mongoose, { Schema, Document, Types } from 'mongoose'
import type { DayStatus } from '@/types'

export interface DailyClosingDocument extends Document {
  branchId: Types.ObjectId
  date: string
  status: DayStatus
  mathematicalSystemTotals: {
    openingCash: number
    cashSales: number
    dueCollections: number
    expensesLogged: number
    expectedDrawerCash: number
  }
  managerSubmittedTotals: {
    physicalCashCounted: number
    remainingMilkStock: number
  }
  discrepancies: {
    cashShortage: number
    stockMismatch: number
  }
  submittedBy?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const DailyClosingSchema = new Schema<DailyClosingDocument>(
  {
    branchId: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true
    },
    date: { type: String, required: true }, // YYYY-MM-DD
    status: { type: String, enum: ['Open', 'Locked'], default: 'Open' },

    mathematicalSystemTotals: {
      openingCash: { type: Number, default: 0 },
      cashSales: { type: Number, default: 0 },
      dueCollections: { type: Number, default: 0 },
      expensesLogged: { type: Number, default: 0 },
      expectedDrawerCash: { type: Number, default: 0 }
    },
    managerSubmittedTotals: {
      physicalCashCounted: { type: Number, default: 0 },
      remainingMilkStock: { type: Number, default: 0 }
    },
    discrepancies: {
      cashShortage: { type: Number, default: 0 },
      stockMismatch: { type: Number, default: 0 }
    },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
)

// One closing record per branch per day
DailyClosingSchema.index({ branchId: 1, date: 1 }, { unique: true })

const DailyClosing =
  mongoose.models.DailyClosing ||
  mongoose.model<DailyClosingDocument>('DailyClosing', DailyClosingSchema)

export default DailyClosing
