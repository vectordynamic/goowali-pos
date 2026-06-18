import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import DailyClosing from '@/models/DailyClosing'
import Transaction from '@/models/Transaction'
import mongoose from 'mongoose'
import { assertBranchAccess, branchDenied, today } from '@/lib/utils'
import { validate, DailyClosingSubmitSchema } from '@/lib/validators'
import type { Role } from '@/types'

async function computeSystemTotals(branchId: string, date: string) {
  const start = new Date(date)
  const end = new Date(date)
  end.setDate(end.getDate() + 1)

  const branchOid = new mongoose.Types.ObjectId(branchId)

  const [result] = await Transaction.aggregate([
    { $match: { branchId: branchOid, createdAt: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: null,
        cashSales: {
          $sum: {
            $cond: [
              { $in: ['$transactionType', ['Cash Sale', 'Partial Payment']] },
              '$financials.cashPaid',
              0
            ]
          }
        },
        dueCollections: {
          $sum: {
            $cond: [
              { $eq: ['$transactionType', 'Due Collection'] },
              '$financials.cashPaid',
              0
            ]
          }
        },
        expensesLogged: {
          $sum: {
            $cond: [
              { $eq: ['$transactionType', 'Expense'] },
              '$financials.totalBill',
              0
            ]
          }
        }
      }
    }
  ])

  const cashSales = result?.cashSales ?? 0
  const dueCollections = result?.dueCollections ?? 0
  const expensesLogged = result?.expensesLogged ?? 0
  const openingCash = 0
  const expectedDrawerCash = openingCash + cashSales + dueCollections - expensesLogged

  return { openingCash, cashSales, dueCollections, expensesLogged, expectedDrawerCash }
}

// GET /api/daily-closing?branchId=xxx&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  const branchId = req.nextUrl.searchParams.get('branchId')
  const date = req.nextUrl.searchParams.get('date') ?? today()

  if (!branchId) return NextResponse.json({ error: 'branchId required' }, { status: 400 })
  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const systemTotals = await computeSystemTotals(branchId, date)
  let closing = await DailyClosing.findOne({ branchId, date })

  if (!closing) {
    closing = await DailyClosing.create({
      branchId,
      date,
      status: 'Open',
      mathematicalSystemTotals: systemTotals,
      managerSubmittedTotals: { physicalCashCounted: 0, remainingMilkStock: 0 },
      discrepancies: { cashShortage: 0, stockMismatch: 0 }
    })
  } else if (closing.status === 'Open') {
    closing.mathematicalSystemTotals = systemTotals as any
    await closing.save()
  }

  return NextResponse.json(closing)
}

// POST /api/daily-closing — Manager submits Z-Report
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches, id: userId } = session.user as {
    role: Role
    assignedBranches: string[]
    id: string
  }

  const body = await req.json()
  const parsed = validate(DailyClosingSubmitSchema, body)
  if (!parsed.success) return parsed.response

  const { branchId, date, physicalCashCounted, remainingMilkStock } = parsed.data
  const targetDate = date ?? today()

  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const systemTotals = await computeSystemTotals(branchId, targetDate)
  let closing = await DailyClosing.findOne({ branchId, date: targetDate })
  if (!closing) {
    closing = new DailyClosing({ branchId, date: targetDate })
  }

  if (closing.status === 'Locked') {
    return NextResponse.json({ error: 'Day already locked' }, { status: 409 })
  }

  const cashShortage = systemTotals.expectedDrawerCash - physicalCashCounted

  closing.mathematicalSystemTotals = systemTotals as any
  closing.managerSubmittedTotals = { physicalCashCounted, remainingMilkStock }
  closing.discrepancies = { cashShortage, stockMismatch: 0 }
  closing.status = 'Locked'
  closing.submittedBy = userId as any

  await closing.save()
  return NextResponse.json(closing)
}
