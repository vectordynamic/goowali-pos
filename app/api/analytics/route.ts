import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import DailySummary from '@/models/DailySummary'
import Transaction from '@/models/Transaction'
import Customer from '@/models/Customer'
import Branch from '@/models/Branch'
import mongoose from 'mongoose'
import type { Role } from '@/types'

// GET /api/analytics?branchId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  if (role === 'MANAGER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const params = req.nextUrl.searchParams
  const from = params.get('from')
  const to = params.get('to')
  const branchId = params.get('branchId')

  await dbConnect()

  // Build branch filter
  let allowedBranches: mongoose.Types.ObjectId[]
  if (role === 'SUPER_ADMIN') {
    if (branchId) {
      allowedBranches = [new mongoose.Types.ObjectId(branchId)]
    } else {
      const all = await Branch.find({}).select('_id').lean() as any[]
      allowedBranches = all.map((b: any) => new mongoose.Types.ObjectId(b._id))
    }
  } else {
    const ids = branchId && assignedBranches.includes(branchId)
      ? [branchId]
      : assignedBranches
    allowedBranches = ids.map((b) => new mongoose.Types.ObjectId(b))
  }

  const matchStage: Record<string, unknown> = {
    branchId: { $in: allowedBranches }
  }
  if (from) matchStage.date = { $gte: from }
  if (to) matchStage.date = { ...(matchStage.date as object ?? {}), $lte: to }

  // ── Product-wise breakdown match stage (independent of matchStage above) ──
  const txMatchStage: Record<string, unknown> = {
    branchId: { $in: allowedBranches },
    transactionType: { $in: ['Cash Sale', 'Credit Sale', 'Partial Payment'] },
  }
  if (from || to) {
    txMatchStage.createdAt = {}
    if (from) (txMatchStage.createdAt as any).$gte = new Date(from)
    if (to) {
      const toDate = new Date(to); toDate.setDate(toDate.getDate() + 1)
      ;(txMatchStage.createdAt as any).$lt = toDate
    }
  }

  const khataFilter = allowedBranches.length > 0
    ? { registeredBranch: { $in: allowedBranches } }
    : {}

  // None of the 6 reads below depend on each other's results — run them concurrently
  // instead of one after another (previously ~7 sequential round trips for this endpoint).
  const [summaryResult, trend, byBranchRaw, byProduct, khataResult, visibleBranchesRaw, expensesByCategoryRaw] = await Promise.all([
    // ── Fast aggregate from pre-computed DailySummary ──
    DailySummary.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          salesRevenue: { $sum: '$salesRevenue' },
          cogs: { $sum: '$cogs' },
          grossProfit: { $sum: '$grossProfit' },
          procurementCost: { $sum: '$procurementCost' },
          expenses: { $sum: '$expenses' },
          ownerFundedExpenses: { $sum: '$ownerFundedExpenses' },
          netProfit: { $sum: '$netProfit' },
          cashIn: { $sum: '$cashIn' },
          cashOut: { $sum: '$cashOut' },
          khataAdded: { $sum: '$khataAdded' },
          khataCollected: { $sum: '$khataCollected' },
          salesCount: { $sum: '$salesCount' },
          procurementCount: { $sum: '$procurementCount' },
          txCount: { $sum: '$txCount' },
          liquidSold: { $sum: '$liquidSold' },
          weightSold: { $sum: '$weightSold' },
          liquidProcured: { $sum: '$liquidProcured' },
          weightProcured: { $sum: '$weightProcured' },
        }
      }
    ]),
    // ── Daily trend from DailySummary ──
    DailySummary.aggregate([
      { $match: matchStage },
      {
        $project: {
          date: 1,
          salesRevenue: 1,
          cogs: 1,
          grossProfit: 1,
          netProfit: 1,
          expenses: 1,
          ownerFundedExpenses: 1,
          procurementCost: 1,
          cashIn: 1,
        }
      },
      { $sort: { date: 1 } },
      { $limit: 30 }
    ]),
    // ── Per-branch breakdown ──
    DailySummary.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$branchId',
          salesRevenue: { $sum: '$salesRevenue' },
          grossProfit: { $sum: '$grossProfit' },
          netProfit: { $sum: '$netProfit' },
          procurementCost: { $sum: '$procurementCost' },
          txCount: { $sum: '$txCount' },
        }
      }
    ]),
    // ── Product-wise breakdown — from transactions directly (acceptable for admin) ──
    Transaction.aggregate([
      { $match: txMatchStage },
      { $unwind: '$items' },
      {
        $group: {
          _id: { productId: '$items.productId', variantId: '$items.variantId' },
          qtySold: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.quantity', '$items.rateApplied'] } },
          grossProfit: { $sum: '$financials.netProfitAmount' },
          txCount: { $sum: 1 },
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          productId: '$_id.productId',
          variantId: '$_id.variantId',
          productName: '$product.name',
          sizeLabel: {
            $let: {
              vars: {
                v: {
                  $first: {
                    $filter: {
                      input: '$product.variants',
                      as: 'v',
                      cond: { $eq: ['$$v.variantId', '$_id.variantId'] }
                    }
                  }
                }
              },
              in: '$$v.sizeLabel'
            }
          },
          unitType: '$product.unitType',
          qtySold: 1, revenue: 1, grossProfit: 1, txCount: 1,
        }
      },
      { $sort: { revenue: -1 } },
    ]),
    // ── Outstanding khata ──
    Customer.aggregate([
      { $match: khataFilter },
      { $group: { _id: null, totalDue: { $sum: '$khata.currentDue' } } }
    ]),
    // ── Visible branches for dropdown ──
    Branch.find(
      role === 'SUPER_ADMIN' ? {} : { _id: { $in: assignedBranches } }
    ).select('_id name').lean(),
    // ── Expense Category breakdown ──
    Transaction.aggregate([
      { $match: {
          branchId: { $in: allowedBranches },
          transactionType: 'Expense',
          ...(from || to ? {
            createdAt: {
              ...(from ? { $gte: new Date(from) } : {}),
              ...(to ? { $lt: (() => { const d = new Date(to); d.setDate(d.getDate() + 1); return d })() } : {})
            }
          } : {})
      } },
      {
        $group: {
          _id: '$expenseCategory',
          total: { $sum: '$financials.totalBill' }
        }
      }
    ])
  ])

  const summary = summaryResult[0]
  const khataTotal = khataResult[0]
  const visibleBranches = visibleBranchesRaw as any[]
  
  const expensesByCategory = expensesByCategoryRaw.map((e: any) => ({
    category: e._id || 'Other',
    total: e.total
  }))

  // Branch-name lookup genuinely depends on byBranchRaw's result — must run after.
  const branchIds = byBranchRaw.map((b) => b._id)
  const branches = await Branch.find({ _id: { $in: branchIds } }).select('name').lean() as any[]
  const branchMap = Object.fromEntries(branches.map((b: any) => [b._id.toString(), b.name]))

  const byBranch = byBranchRaw.map((b) => ({
    branchId: b._id.toString(),
    branchName: branchMap[b._id.toString()] ?? 'Unknown',
    salesRevenue: b.salesRevenue,
    grossProfit: b.grossProfit,
    netProfit: b.netProfit,
    procurementCost: b.procurementCost,
    txCount: b.txCount,
  }))

  const emptySummary = {
    salesRevenue: 0, cogs: 0, grossProfit: 0,
    procurementCost: 0, expenses: 0, ownerFundedExpenses: 0, netProfit: 0,
    cashIn: 0, cashOut: 0, khataAdded: 0, khataCollected: 0,
    salesCount: 0, procurementCount: 0, txCount: 0,
  }

  return NextResponse.json({
    summary: summary ?? emptySummary,
    trend,
    byBranch,
    byProduct,
    expensesByCategory,
    totalOutstandingKhata: khataTotal?.totalDue ?? 0,
    visibleBranches: visibleBranches.map((b: any) => ({ _id: b._id.toString(), name: b.name })),
  })
}
