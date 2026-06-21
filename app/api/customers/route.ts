import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Customer from '@/models/Customer'
import { validate, CustomerCreateSchema, QuickCustomerCreateSchema } from '@/lib/validators'
import type { Role } from '@/types'

// GET /api/customers?type=Retail|Paikari&search=&branchId=&confirm=1&due=1
// SUPER_ADMIN: all customers
// BRANCH_ADMIN: customers from their branches
// MANAGER (normal): only customers they created (createdBy = their userId)
// MANAGER (confirm=1): customers with regular orders configured — name+qty+type only
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches, id: userId } = session.user as {
    role: Role
    assignedBranches: string[]
    id: string
  }

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

  const posLookup = sp.get('pos') === '1'

  if (role === 'MANAGER') {
    if (confirm) {
      // Dispatch view: customers with at least one regular order (any type)
      filter['paikariConfig.fixedProductRates.0'] = { $exists: true }
    } else if (dueOnly) {
      // Due page: all branch customers with outstanding dues — no createdBy restriction
      if (type) filter.customerType = type
    } else if (posLookup) {
      // POS search: find any customer in branch by name/phone (for attaching to transactions)
      if (type) filter.customerType = type
    } else {
      // Customer list: only customers this manager created (privacy — hides other customers' contact info)
      filter.createdBy = userId
    }
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

  // Strip sensitive fields for manager dispatch confirmation — name + type + qty only
  if (role === 'MANAGER' && confirm) {
    return NextResponse.json(
      customers.map((c: any) => ({
        _id: c._id,
        name: c.name,
        customerType: c.customerType,
        dailyLitres: c.paikariConfig?.dailyRequirementLiters ?? 0
      }))
    )
  }

  return NextResponse.json(customers)
}

// POST /api/customers
// MANAGER can only create Retail customers; createdBy is always set.
// ?quick=1 — POS fast-create: phone optional, type defaults to Retail, branch auto-resolved
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches, id: userId } = session.user as {
    role: Role
    assignedBranches: string[]
    id: string
  }

  const quick = req.nextUrl.searchParams.get('quick') === '1'
  const body = await req.json()

  if (quick) {
    const parsed = validate(QuickCustomerCreateSchema, body)
    if (!parsed.success) return parsed.response

    const registeredBranch = assignedBranches.length === 1
      ? assignedBranches[0]
      : body.registeredBranch ?? assignedBranches[0]

    if (!registeredBranch) {
      return NextResponse.json({ error: 'Cannot determine branch' }, { status: 400 })
    }

    await dbConnect()

    if (parsed.data.phone) {
      const existing = await Customer.findOne({ phone: parsed.data.phone })
      if (existing) {
        return NextResponse.json({ error: 'Phone already registered', existing }, { status: 409 })
      }
    }

    const customer = await Customer.create({
      name: parsed.data.name,
      ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
      customerType: parsed.data.customerType,
      registeredBranch,
      createdBy: userId,
    })
    return NextResponse.json(customer, { status: 201 })
  }

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

  const customer = await Customer.create({ ...parsed.data, registeredBranch, createdBy: userId })
  return NextResponse.json(customer, { status: 201 })
}
