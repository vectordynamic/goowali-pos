import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import { assertBranchAccess, branchDenied, today } from '@/lib/utils'
import { validate, NextDayOrderSchema, TempCustomerBookingSchema } from '@/lib/validators'
import type { Role } from '@/types'

function tomorrowStr() {
  const t = today()
  const d = new Date(t + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })
}


// Permanent Paikari customers eligible for the standing call sheet: has at least one fixed
// rate configured and is not a one-time / pending / rejected booking. Existing customers
// predate approvalStatus (undefined) so $nin keeps them in — never filter on equality.
const PERMANENT_FILTER = {
  'paikariConfig.fixedProductRates.0': { $exists: true },
  approvalStatus: { $nin: ['temporary', 'pending', 'rejected'] }
}

// GET /api/next-day-orders?branchId=&date=YYYY-MM-DD
// Returns the call sheet for a date: every approved Paikari customer (auto-creating a
// not_called log where missing) plus any temporary customers already booked for that date.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  const sp = req.nextUrl.searchParams
  const branchId = sp.get('branchId')
  const date = sp.get('date') ?? tomorrowStr()

  if (!branchId) return NextResponse.json({ error: 'branchId required' }, { status: 400 })
  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const { default: Customer } = await import('@/models/Customer')
  const { default: DailyOrderLog } = await import('@/models/DailyOrderLog')

  const permanent = await Customer.find({ registeredBranch: branchId, ...PERMANENT_FILTER })
    .select('_id')
    .lean()

  // Seed a not_called log for each permanent customer that doesn't have one for this date.
  if (permanent.length > 0) {
    await DailyOrderLog.bulkWrite(
      permanent.map((c: any) => ({
        updateOne: {
          filter: { branchId, date, customerId: c._id },
          update: {
            $setOnInsert: {
              branchId, date, customerId: c._id,
              status: 'pending', callStatus: 'not_called', isTemporary: false
            }
          },
          upsert: true
        }
      }))
    )
  }

  const logs = await DailyOrderLog.find({ branchId, date })
    .populate('customerId', 'name phone location customerType paikariConfig approvalStatus approvalNote khata')
    .populate('calledBy', 'name')
    .sort({ isTemporary: 1, createdAt: 1 })
    .lean()

  // Drop logs whose customer is gone or (for permanent, non-temp rows) is no longer eligible —
  // e.g. a customer whose fixed rates were cleared. Temporary rows always stay for their date.
  const visible = logs.filter((log: any) => {
    const c = log.customerId
    if (!c) return false
    if (log.isTemporary) return true
    return (c.approvalStatus ?? 'approved') !== 'rejected'
  })

  return NextResponse.json(visible)
}

// PATCH /api/next-day-orders — record the outcome of a call for one customer/date.
// Body: NextDayOrderSchema
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches, id: userId } = session.user as {
    role: Role
    assignedBranches: string[]
    id: string
  }

  const parsed = validate(NextDayOrderSchema, await req.json())
  if (!parsed.success) return parsed.response

  const { branchId, date, customerId, callStatus, noOrder, confirmedItems, overrideDeliveryTime, callNotes } = parsed.data

  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const { default: DailyOrderLog } = await import('@/models/DailyOrderLog')

  const log = await DailyOrderLog.findOne({ branchId, date, customerId })
  if (!log) return NextResponse.json({ error: 'Order log not found' }, { status: 404 })

  // Once dispatched, the call sheet can't rewrite it (except lifting a prior "won't take" back
  // to pending, since a skipped-from-call day was never actually dispatched).
  if (log.status === 'taken') {
    return NextResponse.json({ error: 'Order already dispatched' }, { status: 409 })
  }

  log.callStatus = callStatus

  if (noOrder) {
    // Reached them, they declined tomorrow → skip the day, clear any prior confirmed qty.
    log.status = 'skipped'
    log.confirmedItems = [] as any
  } else {
    // Re-confirming an order re-opens a day previously marked "won't take".
    log.status = 'pending'
    if (confirmedItems !== undefined) log.confirmedItems = confirmedItems as any
  }

  if (overrideDeliveryTime !== undefined) log.overrideDeliveryTime = overrideDeliveryTime
  if (callNotes !== undefined) log.callNotes = callNotes
  log.calledBy = userId as any
  log.calledAt = new Date()
  log.updatedBy = userId as any
  await log.save()

  return NextResponse.json({ log })
}

// POST /api/next-day-orders — book a brand-new temporary customer for a date.
// Creates a Customer (approvalStatus: 'temporary') plus a DailyOrderLog (isTemporary: true).
// Body: TempCustomerBookingSchema
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches, id: userId } = session.user as {
    role: Role
    assignedBranches: string[]
    id: string
  }

  const parsed = validate(TempCustomerBookingSchema, await req.json())
  if (!parsed.success) return parsed.response

  const { branchId, date, name, phone, location, deliveryMethod, deliveryTime, items } = parsed.data

  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const { default: Customer } = await import('@/models/Customer')
  const { default: DailyOrderLog } = await import('@/models/DailyOrderLog')

  if (phone) {
    const existing = await Customer.findOne({ phone })
    if (existing) {
      return NextResponse.json({ error: 'Phone already registered' }, { status: 409 })
    }
  }

  // Item price is locked into the customer's fixedProductRates so the morning dispatch
  // (shared /api/daily-orders logic) reuses the exact same server-side pricing path.
  const fixedProductRates = items.map((it) => ({
    productId: it.productId,
    variantId: it.variantId,
    lockedRate: it.rate,
    dailyQty: it.quantity
  }))

  const customer = await Customer.create({
    name,
    ...(phone ? { phone } : {}),
    location,
    customerType: 'Paikari',
    registeredBranch: branchId,
    createdBy: userId,
    approvalStatus: 'temporary',
    paikariConfig: {
      deliveryMethod,
      deliveryTime,
      dailyRequirementLiters: items.reduce((s, it) => s + it.quantity, 0),
      fixedProductRates
    }
  })

  const log = await DailyOrderLog.create({
    branchId,
    date,
    customerId: customer._id,
    status: 'pending',
    callStatus: 'called',
    isTemporary: true,
    confirmedItems: items.map((it) => ({
      productId: it.productId,
      variantId: it.variantId,
      quantity: it.quantity
    })),
    overrideDeliveryTime: deliveryTime,
    calledBy: userId,
    calledAt: new Date(),
    updatedBy: userId
  })

  return NextResponse.json({ customer, log }, { status: 201 })
}

// DELETE /api/next-day-orders?branchId=&date=&customerId= — cancel a temporary booking.
// Removes the one-time customer and its log. Only allowed while still 'temporary' (a booking
// already sent for approval or promoted to permanent can't be silently dropped here).
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  const sp = req.nextUrl.searchParams
  const branchId = sp.get('branchId')
  const date = sp.get('date')
  const customerId = sp.get('customerId')

  if (!branchId || !date || !customerId) {
    return NextResponse.json({ error: 'branchId, date, customerId required' }, { status: 400 })
  }
  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const { default: Customer } = await import('@/models/Customer')
  const { default: DailyOrderLog } = await import('@/models/DailyOrderLog')

  const customer = await Customer.findById(customerId)
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  if (customer.registeredBranch?.toString() !== branchId) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }
  if (customer.approvalStatus !== 'temporary') {
    return NextResponse.json({ error: 'Only a temporary booking can be cancelled' }, { status: 400 })
  }

  const log = await DailyOrderLog.findOne({ branchId, date, customerId, isTemporary: true })
  if (log && log.status !== 'pending') {
    return NextResponse.json({ error: 'Order already dispatched' }, { status: 409 })
  }

  await DailyOrderLog.deleteOne({ branchId, date, customerId, isTemporary: true })
  await Customer.deleteOne({ _id: customerId })

  return NextResponse.json({ ok: true })
}
