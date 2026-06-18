import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Customer from '@/models/Customer'
import { validate, CustomerCreateSchema } from '@/lib/validators'
import type { Role } from '@/types'

// GET /api/customers?type=Paikari&search=&branchId=&confirm=1
// SUPER_ADMIN: all customers
// BRANCH_ADMIN: only customers from their branches
// MANAGER (normal): Retail only
// MANAGER (confirm=1): Paikari names-only for dispatch notification
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }

  const sp = req.nextUrl.searchParams
  const type = sp.get('type')
  const search = sp.get('search')
  const branchId = sp.get('branchId')
  const confirm = sp.get('confirm') === '1'
  const dueOnly = sp.get('due') === '1'

  await dbConnect()

  const filter: Record<string, unknown> = {}

  // Branch scoping — non-SUPER_ADMIN never sees outside their branches
  if (role === 'SUPER_ADMIN') {
    if (branchId) filter.registeredBranch = branchId
  } else {
    const allowed = branchId && assignedBranches.includes(branchId)
      ? [branchId]
      : assignedBranches
    filter.registeredBranch = { $in: allowed }
  }

  // MANAGER:
  //   normal view  → Retail only
  //   confirm=1    → Paikari names for dispatch confirmation (no sensitive data)
  if (role === 'MANAGER') {
    filter.customerType = confirm ? 'Paikari' : 'Retail'
  } else if (type) {
    filter.customerType = type
  }

  if (dueOnly) {
    filter['khata.currentDue'] = { $gt: 0 }
  }

  if (search && !confirm) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ]
  }

  const customers = await Customer.find(filter).sort({ name: 1 }).lean()

  // Strip ALL sensitive fields for manager dispatch confirmation — name + _id only
  if (role === 'MANAGER' && confirm) {
    return NextResponse.json(
      customers.map((c: any) => ({
        _id: c._id,
        name: c.name,
        dailyLitres: c.paikariConfig?.dailyRequirementLiters ?? 0
      }))
    )
  }

  return NextResponse.json(customers)
}

// POST /api/customers
// Branch is always required.
// MANAGER can only create Retail customers.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }

  const body = await req.json()
  const parsed = validate(CustomerCreateSchema, body)
  if (!parsed.success) return parsed.response

  if (role === 'MANAGER' && parsed.data.customerType !== 'Retail') {
    return NextResponse.json({ error: 'Managers can only create Retail customers' }, { status: 403 })
  }

  let registeredBranch: string | undefined = parsed.data.registeredBranch

  if (role === 'SUPER_ADMIN') {
    if (!registeredBranch) {
      return NextResponse.json({ error: 'registeredBranch is required' }, { status: 400 })
    }
  } else {
    if (registeredBranch && !assignedBranches.includes(registeredBranch)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    registeredBranch = registeredBranch ?? (assignedBranches.length === 1 ? assignedBranches[0] : undefined)
    if (!registeredBranch) {
      return NextResponse.json({ error: 'Please select a branch for this customer' }, { status: 400 })
    }
  }

  await dbConnect()

  const existing = await Customer.findOne({ phone: parsed.data.phone })
  if (existing) {
    return NextResponse.json({ error: 'Phone already registered' }, { status: 409 })
  }

  const customer = await Customer.create({ ...parsed.data, registeredBranch })
  return NextResponse.json(customer, { status: 201 })
}
