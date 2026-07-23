import mongoose from 'mongoose'
import dbConnect from './db'

export async function updateDailySummary(branchId: string, date: string) {
  await dbConnect()
  const { default: Transaction } = await import('@/models/Transaction')
  const { default: DailySummary } = await import('@/models/DailySummary')

  const start = new Date(date)
  const end = new Date(date)
  end.setDate(end.getDate() + 1)

  const branchOid = new mongoose.Types.ObjectId(branchId)
  const saleTypes = ['Cash Sale', 'Credit Sale', 'Partial Payment']

  const [agg] = await Transaction.aggregate([
    { $match: { branchId: branchOid, createdAt: { $gte: start, $lt: end }, status: { $ne: 'voided' } } },
    {
      $group: {
        _id: null,
        txCount: { $sum: 1 },
        salesRevenue: {
          $sum: { $cond: [{ $in: ['$transactionType', ['Cash Sale', 'Credit Sale']] }, '$financials.totalBill', 0] }
        },
        grossProfit: {
          $sum: { $cond: [{ $in: ['$transactionType', ['Cash Sale', 'Credit Sale']] }, '$financials.netProfitAmount', 0] }
        },
        salesCount: {
          $sum: { $cond: [{ $in: ['$transactionType', ['Cash Sale', 'Credit Sale']] }, 1, 0] }
        },
        procurementCost: {
          $sum: { $cond: [{ $eq: ['$transactionType', 'Procurement'] }, '$financials.totalBill', 0] }
        },
        procurementCount: {
          $sum: { $cond: [{ $eq: ['$transactionType', 'Procurement'] }, 1, 0] }
        },
        ownerPurchaseCost: {
          $sum: { $cond: [{ $eq: ['$transactionType', 'Owner Purchase'] }, '$financials.totalBill', 0] }
        },
        ownerWithdrawals: {
          $sum: { $cond: [{ $eq: ['$transactionType', 'Owner Withdrawal'] }, '$financials.cashPaid', 0] }
        },
        expenses: {
          $sum: { $cond: [{ $eq: ['$transactionType', 'Expense'] }, '$financials.totalBill', 0] }
        },
        cashIn: {
          $sum: { $cond: [{ $in: ['$transactionType', ['Cash Sale', 'Partial Payment', 'Due Collection']] }, '$financials.cashPaid', 0] }
        },
        cashOut: {
          $sum: { $cond: [{ $in: ['$transactionType', ['Procurement', 'Expense']] }, '$financials.cashPaid', 0] }
        },
        khataAdded: { $sum: '$financials.amountAddedToKhata' },
        khataCollected: {
          $sum: { $cond: [{ $eq: ['$transactionType', 'Due Collection'] }, '$financials.cashPaid', 0] }
        },
      }
    }
  ])

  // Volume by unit type — separate lookup for sold vs procured
  const volumeLookup = (types: string[]) => Transaction.aggregate([
    { $match: { branchId: branchOid, createdAt: { $gte: start, $lt: end }, transactionType: { $in: types } } },
    { $unwind: '$items' },
    { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $group: { _id: '$product.unitType', totalQty: { $sum: '$items.quantity' } } }
  ])

  const [soldVol, procuredVol] = await Promise.all([
    volumeLookup(saleTypes),
    volumeLookup(['Procurement']),
  ])

  const liquidSold = soldVol.find((v) => v._id === 'Liquid')?.totalQty ?? 0
  const weightSold = soldVol.find((v) => v._id === 'Weight')?.totalQty ?? 0
  const liquidProcured = procuredVol.find((v) => v._id === 'Liquid')?.totalQty ?? 0
  const weightProcured = procuredVol.find((v) => v._id === 'Weight')?.totalQty ?? 0

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id: _ignored, ...rest } = agg ?? {
    txCount: 0, salesRevenue: 0, grossProfit: 0, salesCount: 0,
    procurementCost: 0, procurementCount: 0, ownerPurchaseCost: 0, ownerWithdrawals: 0, expenses: 0,
    cashIn: 0, cashOut: 0, khataAdded: 0, khataCollected: 0,
  }

  const cogs = rest.salesRevenue - rest.grossProfit
  const netProfit = rest.grossProfit - rest.expenses

  await DailySummary.findOneAndUpdate(
    { branchId: branchOid, date },
    { $set: { ...rest, cogs, netProfit, liquidSold, weightSold, liquidProcured, weightProcured, branchId: branchOid, date } },
    { upsert: true, new: true }
  )
}
