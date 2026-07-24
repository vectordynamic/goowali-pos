import mongoose, { Schema, Document, Types } from 'mongoose'
import type { TransactionType, ExpenseCategory, ExpenseFundingSource } from '@/types'

export interface TransactionItemDocument {
  productId: Types.ObjectId
  variantId: string
  quantity: number
  rateApplied: number
  isCustomOverride: boolean
}

export interface TransactionDocument extends Document {
  invoiceId: string
  branchId: Types.ObjectId
  recordedBy: Types.ObjectId
  customerId?: Types.ObjectId | null
  ownerId?: Types.ObjectId | null
  transactionType: TransactionType
  items: TransactionItemDocument[]
  expenseCategory?: ExpenseCategory | null
  expenseFundingSource?: ExpenseFundingSource | null
  financials: {
    totalBill: number
    discount: number
    cashPaid: number
    amountAddedToKhata: number
    netProfitAmount: number
  }
  notes?: string
  // Void / correction audit trail
  status: 'active' | 'voided'
  voidedAt?: Date
  voidedBy?: Types.ObjectId
  voidReason?: string
  correctedFromId?: Types.ObjectId  // this tx replaces another (points to the original)
  correctedById?: Types.ObjectId    // this tx was replaced by another (points to the correction)
  createdAt: Date
  updatedAt: Date
}

const TransactionItemSchema = new Schema<TransactionItemDocument>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: String, required: true },
    quantity: { type: Number, required: true },
    rateApplied: { type: Number, required: true },
    isCustomOverride: { type: Boolean, default: false }
  },
  { _id: false }
)

const TransactionSchema = new Schema<TransactionDocument>(
  {
    invoiceId: { type: String, unique: true, required: true, index: true },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      default: null
    },
    // Which branch admin funded an Owner Purchase or made an Owner Withdrawal.
    // Not used by any other transaction type.
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    transactionType: {
      type: String,
      enum: [
        'Cash Sale', 'Credit Sale', 'Partial Payment', 'Due Collection', 'Expense', 'Procurement',
        'Owner Purchase', 'Owner Withdrawal'
      ],
      required: true
    },
    expenseCategory: {
      type: String,
      enum: ['Rent', 'Utilities', 'Fuel', 'Food', 'Supplies', 'Salary', 'Transport', 'Maintenance', 'Other'],
      default: null
    },
    expenseFundingSource: {
      type: String,
      enum: ['Shop Cash', 'Owner Funded'],
      default: null
    },
    items: { type: [TransactionItemSchema], default: [] },
    financials: {
      totalBill: { type: Number, default: 0 },
      cashPaid: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      amountAddedToKhata: { type: Number, default: 0 },
      netProfitAmount: { type: Number, required: true }
    },
    notes: { type: String },
    // Void / correction audit trail
    status: { type: String, enum: ['active', 'voided'], default: 'active', index: true },
    voidedAt: { type: Date },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    voidReason: { type: String, trim: true },
    correctedFromId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
    correctedById: { type: Schema.Types.ObjectId, ref: 'Transaction' }
  },
  { timestamps: true }
)

TransactionSchema.index({ branchId: 1, createdAt: -1 })
TransactionSchema.index({ customerId: 1, createdAt: -1 })

const Transaction =
  mongoose.models.Transaction ||
  mongoose.model<TransactionDocument>('Transaction', TransactionSchema)

export default Transaction
