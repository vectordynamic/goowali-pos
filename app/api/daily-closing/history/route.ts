import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import DailyClosing from '@/models/DailyClosing'
import { assertBranchAccess, branchDenied, today } from '@/lib/utils'
import type { Role } from '@/types'

// GET /api/daily-closing/history?branchId=&days=7&endDate=YYYY-MM-DD
// Returns last N days of closing records (descending), for admin branch reports
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  const sp = req.nextUrl.searchParams
  const branchId = sp.get('branchId')
  const days = Math.min(Number(sp.get('days') ?? 7), 30)
  const endDate = sp.get('endDate') ?? today()

  if (!branchId) return NextResponse.json({ error: 'branchId required' }, { status: 400 })
  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const records = await DailyClosing.find({ branchId, date: { $lte: endDate } })
    .sort({ date: -1 })
    .limit(days)
    .lean()

  return NextResponse.json(records)
}
