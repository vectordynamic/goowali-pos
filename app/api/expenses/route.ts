import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Transaction from '@/models/Transaction'
import DailyClosing from '@/models/DailyClosing'
import {
  assertBranchAccess,
  branchDenied,
  stripSensitiveTransactionData,
  generateInvoiceId,
  today
} from '@/lib/utils'
import { updateDailySummary } from '@/lib/update-daily-summary'
import { validate, ExpenseCreateSchema } from '@/lib/validators'
import type { Role } from '@/types'

// GET /api/expenses?branchId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD&category=xxx
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  const params = req.nextUrl.searchParams
  const branchId = params.get('branchId')
  const from = params.get('from')
  const to = params.get('to')
  const category = params.get('category')

  if (!branchId) return NextResponse.json({ error: 'branchId required' }, { status: 400 })

  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const filter: Record<string, unknown> = { branchId, transactionType: 'Expense' }
  if (category) filter.expenseCategory = category
  
  if (from || to) {
    filter.createdAt = {}
    if (from) (filter.createdAt as any).$gte = new Date(from)
    if (to) { 
      const end = new Date(to)
      end.setDate(end.getDate() + 1)
      ;(filter.createdAt as any).$lt = end 
    }
  }

  const transactions = await Transaction.find(filter)
    .populate('recordedBy', 'name')
    .populate('voidedBy', 'name')
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean()

  const sanitized = stripSensitiveTransactionData(transactions, role)
  return NextResponse.json(sanitized)
}

// POST /api/expenses
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches, id: userId } = session.user as {
    role: Role
    assignedBranches: string[]
    id: string
  }

  const body = await req.json()
  const parsed = validate(ExpenseCreateSchema, body)
  if (!parsed.success) return parsed.response

  const { branchId, amount, category, fundingSource, description, notes } = parsed.data

  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  // ── Day-status gate: block logging if day not Open ─────────────────────────────────
  let dayClosing = await DailyClosing.findOne({ branchId, status: 'Open', date: { $lte: today() } })
    .sort({ date: 1 })
    .lean() as any

  if (!dayClosing) {
    dayClosing = await DailyClosing.findOne({ branchId, date: today() }).lean() as any
  }

  if (!dayClosing || dayClosing.status === 'Pending') {
    return NextResponse.json(
      { error: 'আজকের হিসাব শুরু হয়নি। খরচ এন্ট্রি করতে প্রথমে "দিন শুরু করুন" বাটন চাপুন।' },
      { status: 403 }
    )
  }
  if (dayClosing.status === 'Locked') {
    return NextResponse.json(
      { error: 'আজকের হিসাব বন্ধ করা হয়েছে। আর খরচ এন্ট্রি করা যাবে না।' },
      { status: 403 }
    )
  }

  const cashPaid = fundingSource === 'Shop Cash' ? amount : 0

  const fullNotes = description + (notes ? `\n\n${notes}` : '')

  const transaction = await Transaction.create({
    invoiceId: generateInvoiceId(branchId),
    branchId,
    recordedBy: userId,
    transactionType: 'Expense',
    expenseCategory: category,
    expenseFundingSource: fundingSource,
    items: [],
    financials: {
      totalBill: amount,
      discount: 0,
      cashPaid,
      amountAddedToKhata: 0,
      netProfitAmount: -amount // expense reduces profit
    },
    notes: fullNotes
  })

  // Update pre-computed daily summary (non-blocking)
  updateDailySummary(branchId, dayClosing.date).catch(() => {})

  const result = transaction.toObject()
  if (role === 'MANAGER') {
    delete (result.financials as any).netProfitAmount
  }

  return NextResponse.json(result, { status: 201 })
}
