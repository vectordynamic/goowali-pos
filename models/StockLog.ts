import mongoose, { Schema, Document, Types } from 'mongoose'

export type StockAction = 'add' | 'set'

export interface StockLogDocument extends Document {
  branchId: Types.ObjectId
  productId: Types.ObjectId
  variantId: string
  action: StockAction
  quantityBefore: number
  quantityChange: number
  quantityAfter: number
  buyingPriceBefore?: number
  buyingPriceAfter?: number
  paidFromCash: boolean
  totalPurchaseCost?: number
  notes?: string
  recordedBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const StockLogSchema = new Schema<StockLogDocument>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: String, required: true },
    action: { type: String, enum: ['add', 'set'], required: true },
    quantityBefore: { type: Number, required: true },
    quantityChange: { type: Number, required: true },
    quantityAfter: { type: Number, required: true },
    buyingPriceBefore: { type: Number },
    buyingPriceAfter: { type: Number },
    paidFromCash: { type: Boolean, default: false },
    totalPurchaseCost: { type: Number },
    notes: { type: String, trim: true, maxlength: 300 },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
)

StockLogSchema.index({ branchId: 1, createdAt: -1 })
StockLogSchema.index({ productId: 1, variantId: 1, createdAt: -1 })

const StockLog =
  mongoose.models.StockLog ||
  mongoose.model<StockLogDocument>('StockLog', StockLogSchema)

export default StockLog
