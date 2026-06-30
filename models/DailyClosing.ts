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
  // New fields
  nightCashCounted: number | null
  cashCheckReason: string | null        // reason when |cash gap| > ৳30
  physicalStock: Array<{
    productId: Types.ObjectId
    variantId: string
    physicalQty: number
    systemQty: number
  }>
  stockCheckReasons: Array<{            // reason when |stock gap| > 1 unit
    productId: Types.ObjectId
    variantId: string
    reason: string
  }>
  tomorrowPreOrders: Array<{
    productId: Types.ObjectId
    variantId: string
    productName: string
    quantity: number
  }>
  submittedBy?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const DailyClosingSchema = new Schema<DailyClosingDocument>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    date: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Open', 'Locked'], default: 'Pending' },

    mathematicalSystemTotals: {
      openingCash: { type: Number, default: 0 },
      cashSales: { type: Number, default: 0 },
      dueCollections: { type: Number, default: 0 },
      expensesLogged: { type: Number, default: 0 },
      expectedDrawerCash: { type: Number, default: 0 },
    },
    managerSubmittedTotals: {
      physicalCashCounted: { type: Number, default: 0 },
      remainingMilkStock: { type: Number, default: 0 },
    },
    discrepancies: {
      cashShortage: { type: Number, default: 0 },
      stockMismatch: { type: Number, default: 0 },
    },

    // Night cash count (end-of-day physical count)
    nightCashCounted: { type: Number, default: null },
    cashCheckReason: { type: String, default: null },

    // Physical stock count per product/variant
    physicalStock: {
      type: [
        {
          productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
          variantId: { type: String, required: true },
          physicalQty: { type: Number, required: true },
          systemQty: { type: Number, required: true },
          _id: false,
        },
      ],
      default: [],
    },

    // Reasons for stock gaps > 1 unit
    stockCheckReasons: {
      type: [
        {
          productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
          variantId: { type: String, required: true },
          reason: { type: String, required: true },
          _id: false,
        },
      ],
      default: [],
    },

    // Tomorrow's pre-orders (milk only, but stored generically)
    tomorrowPreOrders: {
      type: [
        {
          productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
          variantId: { type: String, required: true },
          productName: { type: String, required: true },
          quantity: { type: Number, required: true },
          _id: false,
        },
      ],
      default: [],
    },

    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

DailyClosingSchema.index({ branchId: 1, date: 1 }, { unique: true })

const DailyClosing =
  mongoose.models.DailyClosing ||
  mongoose.model<DailyClosingDocument>('DailyClosing', DailyClosingSchema)

export default DailyClosing
