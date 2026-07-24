import mongoose, { Schema, Document, Types } from 'mongoose'

export interface DailySummaryDocument extends Document {
  branchId: Types.ObjectId
  date: string // YYYY-MM-DD

  // Sales
  salesRevenue: number      // totalBill from Cash Sale + Credit Sale
  cogs: number              // cost of goods sold (revenue - gross profit)
  grossProfit: number       // netProfitAmount sum on sales
  salesCount: number

  // Procurement (stock buying)
  procurementCost: number   // totalBill from Procurement transactions (store cash)
  procurementCount: number
  ownerPurchaseCost: number // totalBill from Owner Purchase transactions (owner's own money, not store cash)
  ownerWithdrawals: number  // cashPaid from Owner Withdrawal transactions (store cash taken by an admin)

  // Expenses
  expenses: number          // totalBill from Expense transactions (Shop Cash + Owner Funded)
  ownerFundedExpenses: number // totalBill from Expense transactions where fundingSource = 'Owner Funded'

  // Net
  netProfit: number         // grossProfit - expenses

  // Cash flow
  cashIn: number            // cashPaid: Cash Sale + Partial Payment + Due Collection
  cashOut: number           // cashPaid: Procurement + Expense
  khataAdded: number        // credit sold (added to customer due)
  khataCollected: number    // cashPaid from Due Collection

  txCount: number
  updatedAt: Date

  // Volume sold by unit type
  liquidSold: number
  weightSold: number
  liquidProcured: number
  weightProcured: number
}

const DailySummarySchema = new Schema<DailySummaryDocument>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    date: { type: String, required: true },

    salesRevenue: { type: Number, default: 0 },
    cogs: { type: Number, default: 0 },
    grossProfit: { type: Number, default: 0 },
    salesCount: { type: Number, default: 0 },

    procurementCost: { type: Number, default: 0 },
    procurementCount: { type: Number, default: 0 },
    ownerPurchaseCost: { type: Number, default: 0 },
    ownerWithdrawals: { type: Number, default: 0 },

    expenses: { type: Number, default: 0 },
    ownerFundedExpenses: { type: Number, default: 0 },
    netProfit: { type: Number, default: 0 },

    cashIn: { type: Number, default: 0 },
    cashOut: { type: Number, default: 0 },
    khataAdded: { type: Number, default: 0 },
    khataCollected: { type: Number, default: 0 },

    txCount: { type: Number, default: 0 },

  // Volume sold by unit type
  liquidSold: { type: Number, default: 0 },      // total litres SOLD (Liquid products)
  weightSold: { type: Number, default: 0 },      // total kg SOLD (Weight products)
  liquidProcured: { type: Number, default: 0 },  // total litres BOUGHT (Procurement)
  weightProcured: { type: Number, default: 0 },  // total kg BOUGHT (Procurement)
  },
  { timestamps: true }
)

DailySummarySchema.index({ branchId: 1, date: 1 }, { unique: true })
DailySummarySchema.index({ date: 1 })

const DailySummary =
  mongoose.models.DailySummary ||
  mongoose.model<DailySummaryDocument>('DailySummary', DailySummarySchema)

export default DailySummary
