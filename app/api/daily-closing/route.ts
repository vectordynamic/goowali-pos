import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import DailyClosing from '@/models/DailyClosing'
import Transaction from '@/models/Transaction'
import mongoose from 'mongoose'
import { assertBranchAccess, branchDenied, today } from '@/lib/utils'
import type { Role } from '@/types'

function prevDate(date: string) {
  const d = new Date(date)
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

async function computeSystemTotals(branchId: string, date: string, openingCash = 0) {
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
              0,
            ],
          },
        },
        dueCollections: {
          $sum: {
            $cond: [{ $eq: ['$transactionType', 'Due Collection'] }, '$financials.cashPaid', 0],
          },
        },
        expensesLogged: {
          $sum: {
            $cond: [{ $eq: ['$transactionType', 'Expense'] }, '$financials.totalBill', 0],
          },
        },
        procurementCost: {
          $sum: {
            $cond: [{ $eq: ['$transactionType', 'Procurement'] }, '$financials.cashPaid', 0],
          },
        },
      },
    },
  ])

  const cashSales = result?.cashSales ?? 0
  const dueCollections = result?.dueCollections ?? 0
  const expensesLogged = result?.expensesLogged ?? 0
  const procurementCost = result?.procurementCost ?? 0
  const expectedDrawerCash = openingCash + cashSales + dueCollections - expensesLogged - procurementCost

  return { openingCash, cashSales, dueCollections, expensesLogged, procurementCost, expectedDrawerCash }
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

  // Opening cash = yesterday's night cash count (automatic carryover, no manual input needed)
  const yesterday = await DailyClosing.findOne({ branchId, date: prevDate(date) })
  const openingCash = yesterday?.nightCashCounted ?? yesterday?.mathematicalSystemTotals?.openingCash ?? 0

  const systemTotals = await computeSystemTotals(branchId, date, openingCash)

  let closing = await DailyClosing.findOne({ branchId, date })

  if (!closing) {
    closing = await DailyClosing.create({
      branchId,
      date,
      status: 'Open',
      mathematicalSystemTotals: systemTotals,
      managerSubmittedTotals: { physicalCashCounted: 0, remainingMilkStock: 0 },
      discrepancies: { cashShortage: 0, stockMismatch: 0 },
      nightCashCounted: null,
      physicalStock: [],
      tomorrowPreOrders: [],
    })
  } else if (closing.status === 'Open') {
    closing.mathematicalSystemTotals = systemTotals as any
    await closing.save()
  }

  // Also return yesterday's pre-orders (for "what was expected today" comparison)
  const yesterdayPreOrders = yesterday?.tomorrowPreOrders ?? []

  return NextResponse.json({ ...closing.toObject(), yesterdayPreOrders })
}

// PATCH /api/daily-closing
// action: 'nightCash'      → { branchId, date, action, nightCash }
// action: 'physicalStock'  → { branchId, date, action, physicalStock: [{productId, variantId, physicalQty, systemQty}] }
// action: 'preOrders'      → { branchId, date, action, preOrders: [{productId, variantId, productName, quantity}] }
// (legacy) no action       → { branchId, date, openingCash }  — kept for any old callers
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  const body = await req.json()
  const { branchId, date, action } = body

  if (!branchId) return NextResponse.json({ error: 'branchId required' }, { status: 400 })
  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()
  const targetDate = date ?? today()

  if (action === 'nightCash') {
    const nightCash = Number(body.nightCash ?? 0)
    const closing = await DailyClosing.findOneAndUpdate(
      { branchId, date: targetDate },
      { $set: { nightCashCounted: nightCash } },
      { new: true, upsert: true }
    )
    return NextResponse.json(closing)
  }

  if (action === 'physicalStock') {
    const physicalStock = Array.isArray(body.physicalStock) ? body.physicalStock : []
    const closing = await DailyClosing.findOneAndUpdate(
      { branchId, date: targetDate },
      { $set: { physicalStock } },
      { new: true, upsert: true }
    )
    return NextResponse.json(closing)
  }

  if (action === 'preOrders') {
    const preOrders = Array.isArray(body.preOrders) ? body.preOrders : []
    const closing = await DailyClosing.findOneAndUpdate(
      { branchId, date: targetDate },
      { $set: { tomorrowPreOrders: preOrders } },
      { new: true, upsert: true }
    )
    return NextResponse.json(closing)
  }

  // Save reason when cash gap > ৳30
  if (action === 'cashReason') {
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    const closing = await DailyClosing.findOneAndUpdate(
      { branchId, date: targetDate },
      { $set: { cashCheckReason: reason || null } },
      { new: true, upsert: true }
    )
    return NextResponse.json(closing)
  }

  // Save reason for a specific stock gap > 1 unit
  if (action === 'stockReason') {
    const { productId, variantId, reason } = body
    if (!productId || !variantId) {
      return NextResponse.json({ error: 'productId and variantId required' }, { status: 400 })
    }
    const trimmed = typeof reason === 'string' ? reason.trim() : ''
    // Pull existing entry for this product/variant, then push new one if non-empty
    await DailyClosing.findOneAndUpdate(
      { branchId, date: targetDate },
      { $pull: { stockCheckReasons: { productId, variantId } } as any },
      { upsert: true }
    )
    if (trimmed) {
      await DailyClosing.findOneAndUpdate(
        { branchId, date: targetDate },
        { $push: { stockCheckReasons: { productId, variantId, reason: trimmed } } as any }
      )
    }
    return NextResponse.json({ ok: true })
  }

  // Legacy: opening cash (kept for backward compat with any admin-facing callers)
  if (body.openingCash !== undefined) {
    const openingCash = Number(body.openingCash)
    const systemTotals = await computeSystemTotals(branchId, targetDate, openingCash)
    const closing = await DailyClosing.findOneAndUpdate(
      { branchId, date: targetDate },
      { $set: { mathematicalSystemTotals: systemTotals } },
      { new: true, upsert: true }
    )
    return NextResponse.json(closing)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// POST /api/daily-closing — Manager submits Z-Report (lock day)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches, id: userId } = session.user as {
    role: Role
    assignedBranches: string[]
    id: string
  }

  const { branchId, date, physicalCashCounted, remainingMilkStock } = await req.json()
  const targetDate = date ?? today()

  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const systemTotals = await computeSystemTotals(branchId, targetDate)
  let closing = await DailyClosing.findOne({ branchId, date: targetDate })
  if (!closing) closing = new DailyClosing({ branchId, date: targetDate })

  if (closing.status === 'Locked') {
    return NextResponse.json({ error: 'Day already locked' }, { status: 409 })
  }

  const cashShortage = systemTotals.expectedDrawerCash - (physicalCashCounted ?? 0)
  closing.mathematicalSystemTotals = systemTotals as any
  closing.managerSubmittedTotals = { physicalCashCounted: physicalCashCounted ?? 0, remainingMilkStock: remainingMilkStock ?? 0 }
  closing.discrepancies = { cashShortage, stockMismatch: 0 }
  closing.status = 'Locked'
  closing.submittedBy = userId as any

  await closing.save()
  return NextResponse.json(closing)
}
