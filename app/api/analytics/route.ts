import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
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

  if (role === 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const params = req.nextUrl.searchParams
  const from = params.get('from')
  const to = params.get('to')
  const branchId = params.get('branchId')

  await dbConnect()

  // Build allowed branch list — BRANCH_ADMIN never leaks other branch IDs
  let allowedBranches: string[]
  if (role === 'SUPER_ADMIN') {
    allowedBranches = branchId ? [branchId] : []  // empty = all
  } else {
    allowedBranches = branchId && assignedBranches.includes(branchId)
      ? [branchId]
      : assignedBranches
  }

  const matchStage: Record<string, unknown> = {}
  if (allowedBranches.length > 0) {
    matchStage.branchId = {
      $in: allowedBranches.map((b) => new mongoose.Types.ObjectId(b))
    }
  }

  if (from || to) {
    matchStage.createdAt = {}
    if (from) (matchStage.createdAt as any).$gte = new Date(from)
    if (to) {
      const toDate = new Date(to)
      toDate.setDate(toDate.getDate() + 1)
      ;(matchStage.createdAt as any).$lt = toDate
    }
  }

  // Total summary
  const [summary] = await Transaction.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$financials.totalBill' },
        totalCashCollected: { $sum: '$financials.cashPaid' },
        totalNetProfit: { $sum: '$financials.netProfitAmount' },
        totalKhataAdded: { $sum: '$financials.amountAddedToKhata' },
        txCount: { $sum: 1 }
      }
    }
  ])

  // Daily trend
  const trend = await Transaction.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$financials.totalBill' },
        profit: { $sum: '$financials.netProfitAmount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } },
    { $limit: 30 }
  ])

  // By transaction type
  const byType = await Transaction.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$transactionType',
        total: { $sum: '$financials.totalBill' },
        count: { $sum: 1 }
      }
    }
  ])

  // Per-branch breakdown — only includes branches the caller is allowed to see
  const byBranch = await Transaction.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$branchId',
        revenue: { $sum: '$financials.totalBill' },
        profit: { $sum: '$financials.netProfitAmount' },
        txCount: { $sum: 1 }
      }
    }
  ])

  // Enrich byBranch with branch names
  const branchIds = byBranch.map((b) => b._id)
  const branches = await Branch.find({ _id: { $in: branchIds } }).select('name').lean()
  const branchMap = Object.fromEntries(branches.map((b: any) => [b._id.toString(), b.name]))

  const byBranchNamed = byBranch.map((b) => ({
    branchId: b._id.toString(),
    branchName: branchMap[b._id.toString()] ?? 'Unknown',
    revenue: b.revenue,
    profit: b.profit,
    txCount: b.txCount
  }))

  // Custom override audit
  const overrides = await Transaction.find({
    ...matchStage,
    'items.isCustomOverride': true
  })
    .populate('recordedBy', 'name')
    .populate('customerId', 'name phone')
    .select('invoiceId branchId recordedBy customerId items financials createdAt')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()

  // Total outstanding khata — scoped to visible branches
  const khataFilter = allowedBranches.length > 0
    ? { registeredBranch: { $in: allowedBranches.map((b) => new mongoose.Types.ObjectId(b)) } }
    : {}
  const [khataTotal] = await Customer.aggregate([
    { $match: khataFilter },
    { $group: { _id: null, totalDue: { $sum: '$khata.currentDue' } } }
  ])

  // Branches available to the caller (for the dropdown) — never reveals unauthorized branches
  const visibleBranches = await Branch.find(
    role === 'SUPER_ADMIN' ? {} : { _id: { $in: assignedBranches } }
  ).select('_id name').lean()

  return NextResponse.json({
    summary: summary ?? {
      totalRevenue: 0, totalCashCollected: 0,
      totalNetProfit: 0, totalKhataAdded: 0, txCount: 0
    },
    trend,
    byType,
    byBranch: byBranchNamed,
    overrides,
    totalOutstandingKhata: khataTotal?.totalDue ?? 0,
    visibleBranches
  })
}
