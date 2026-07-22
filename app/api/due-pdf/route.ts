import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Customer from '@/models/Customer'
import Transaction from '@/models/Transaction'
import type { Role } from '@/types'

// GET /api/due-pdf?branchId=&type=Retail|Paikari
// Returns every customer with an outstanding due plus their dated khata breakdown,
// in a single pass (no per-customer statement fetch). Feeds the Due Collection Sheet PDF.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }

  const sp = req.nextUrl.searchParams
  const type = sp.get('type')
  const branchId = sp.get('branchId')

  await dbConnect()

  // Branch scoping — mirrors /api/customers due list: non-SUPER_ADMIN is confined to
  // their assigned branches regardless of the requested branchId.
  const filter: Record<string, unknown> = { 'khata.currentDue': { $gt: 0 } }
  if (role === 'SUPER_ADMIN') {
    if (branchId) filter.registeredBranch = branchId
  } else {
    const allowed = branchId && assignedBranches.includes(branchId) ? [branchId] : assignedBranches
    filter.registeredBranch = { $in: allowed }
  }
  if (type === 'Retail' || type === 'Paikari') filter.customerType = type
  filter.approvalStatus = { $nin: ['temporary', 'pending', 'rejected'] }

  const customers = await Customer.find(filter)
    .select('name phone location khata.currentDue')
    .sort({ 'khata.currentDue': -1 }) // highest due first — most important collections at top
    .limit(500)
    .lean()

  if (customers.length === 0) return NextResponse.json({ customers: [] })

  const customerIds = customers.map((c: any) => c._id)

  // Single query for every relevant khata movement across all due customers — avoids the N+1
  // the UI incurs by fetching ?statement=1 per expanded row.
  const rows = await Transaction.find({
    customerId: { $in: customerIds },
    transactionType: { $in: ['Credit Sale', 'Partial Payment', 'Due Collection'] }
  })
    .select('customerId createdAt transactionType items financials.amountAddedToKhata financials.cashPaid notes')
    .sort({ createdAt: 1 })
    .lean()

  // Resolve product names once for readable line items ("দুধ 1 লিটার ×10" instead of raw ids).
  const { default: Product } = await import('@/models/Product')
  const productIds = [
    ...new Set(
      (rows as any[]).flatMap((r) => (r.items ?? []).map((it: any) => it.productId?.toString()).filter(Boolean))
    )
  ]
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } }).select('name variants.variantId variants.sizeLabel').lean()
    : []
  const productMap = new Map((products as any[]).map((p) => [p._id.toString(), p]))

  function itemsText(r: any): string {
    if (r.transactionType === 'Due Collection') return 'টাকা আদায়'
    const parts = (r.items ?? []).map((it: any) => {
      const p = productMap.get(it.productId?.toString())
      const variant = p?.variants?.find((v: any) => v.variantId === it.variantId)
      const label = variant?.sizeLabel ? `${p.name} ${variant.sizeLabel}` : (p?.name ?? it.variantId)
      return `${label} ×${it.quantity}`
    })
    return parts.length > 0 ? parts.join(', ') : (r.notes || '—')
  }

  // Group movements by customer.
  const breakdownByCustomer = new Map<string, Array<{ date: string; items: string; amount: number }>>()
  for (const r of rows as any[]) {
    const cid = r.customerId?.toString()
    if (!cid) continue
    const isCollection = r.transactionType === 'Due Collection'
    const amount = isCollection
      ? -(r.financials?.cashPaid ?? 0)
      : (r.financials?.amountAddedToKhata ?? 0)
    if (!breakdownByCustomer.has(cid)) breakdownByCustomer.set(cid, [])
    breakdownByCustomer.get(cid)!.push({ date: r.createdAt, items: itemsText(r), amount })
  }

  const result = (customers as any[]).map((c) => ({
    name: c.name,
    phone: c.phone ?? '',
    location: c.location ?? '',
    totalDue: c.khata?.currentDue ?? 0,
    breakdown: breakdownByCustomer.get(c._id.toString()) ?? []
  }))

  return NextResponse.json({ customers: result })
}
