import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import { validate, WithdrawalCreateSchema } from '@/lib/validators'
import { generateInvoiceId, today } from '@/lib/utils'
import { updateDailySummary } from '@/lib/update-daily-summary'
import type { Role } from '@/types'

// GET /api/withdrawals?branchId=&from=&to=
// SUPER_ADMIN: all branches (optionally filtered to one), full visibility.
// BRANCH_ADMIN: their own branch only, regardless of any branchId query param.
// MANAGER: 403 — withdrawals are an admin-only concern.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  if (role === 'MANAGER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const branchIdParam = sp.get('branchId')
  const from = sp.get('from')
  const to = sp.get('to')

  await dbConnect()
  const { default: Transaction } = await import('@/models/Transaction')

  const filter: Record<string, unknown> = { transactionType: 'Owner Withdrawal' }

  if (role === 'SUPER_ADMIN') {
    if (branchIdParam) filter.branchId = branchIdParam
  } else {
    // BRANCH_ADMIN — never honor a client-supplied branchId, always their own
    filter.branchId = { $in: assignedBranches }
  }

  if (from || to) {
    filter.createdAt = {}
    if (from) (filter.createdAt as any).$gte = new Date(from)
    if (to) { const end = new Date(to); end.setDate(end.getDate() + 1); (filter.createdAt as any).$lt = end }
  }

  const withdrawals = await Transaction.find(filter)
    .populate('ownerId', 'name')
    .populate('branchId', 'name')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean()

  return NextResponse.json(withdrawals)
}

// POST /api/withdrawals — BRANCH_ADMIN only, records cash taken from their own branch's drawer
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches, id: userId } = session.user as {
    role: Role
    assignedBranches: string[]
    id: string
  }

  if (role !== 'BRANCH_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const branchId = assignedBranches[0]
  if (!branchId) return NextResponse.json({ error: 'No branch assigned' }, { status: 400 })

  const body = await req.json()
  const parsed = validate(WithdrawalCreateSchema, body)
  if (!parsed.success) return parsed.response

  await dbConnect()
  const { default: Transaction } = await import('@/models/Transaction')

  const { amount, notes } = parsed.data

  const transaction = await Transaction.create({
    invoiceId: generateInvoiceId(branchId),
    branchId,
    recordedBy: userId,
    ownerId: userId,
    transactionType: 'Owner Withdrawal',
    items: [],
    financials: { totalBill: amount, cashPaid: amount, amountAddedToKhata: 0, netProfitAmount: 0 },
    notes
  })

  updateDailySummary(branchId, today()).catch(() => {})

  return NextResponse.json(transaction, { status: 201 })
}
