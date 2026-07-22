import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import { assertBranchAccess, branchDenied, today } from '@/lib/utils'
import type { Role } from '@/types'

// GET /api/delivery-pdf?branchId=&date=YYYY-MM-DD
// Today's pending regular-order deliveries with resolved product names, location, time and
// total due. Read-only — does not auto-create logs (that is /api/daily-orders' job). Feeds the
// Delivery Run Sheet PDF.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }
  const sp = req.nextUrl.searchParams
  const branchId = sp.get('branchId')
  const date = sp.get('date') ?? today()


  if (!branchId) return NextResponse.json({ error: 'branchId required' }, { status: 400 })
  if (!assertBranchAccess(role, assignedBranches, branchId)) return branchDenied()

  await dbConnect()

  const { default: DailyOrderLog } = await import('@/models/DailyOrderLog')
  const { default: Product } = await import('@/models/Product')

  const logs = await DailyOrderLog.find({ branchId, date, status: 'pending' })
    .populate('customerId', 'name phone location paikariConfig khata')
    .lean()

  if (logs.length === 0) return NextResponse.json({ orders: [] })

  // Resolve every referenced product once for readable line items.
  const productIds = [
    ...new Set(
      (logs as any[]).flatMap((log) =>
        ((log.customerId as any)?.paikariConfig?.fixedProductRates ?? []).map((r: any) =>
          r.productId?.toString()
        )
      ).filter(Boolean)
    )
  ]
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } }).select('name variants.variantId variants.sizeLabel').lean()
    : []
  const productMap = new Map((products as any[]).map((p) => [p._id.toString(), p]))

  function label(productId: any, variantId: string): string {
    const p = productMap.get(productId?.toString())
    const variant = p?.variants?.find((v: any) => v.variantId === variantId)
    return variant?.sizeLabel ? `${p.name} ${variant.sizeLabel}` : (p?.name ?? variantId)
  }

  const orders = (logs as any[]).map((log) => {
    const cust = (log.customerId as any) ?? {}
    const rates = cust.paikariConfig?.fixedProductRates ?? []
    const confirmed: any[] = log.confirmedItems ?? []

    // Confirmed-on-call quantity is the real need if the customer was called last night,
    // else the standing daily default.
    const items = rates
      .map((r: any) => {
        const conf = confirmed.find(
          (ci: any) => ci.productId?.toString() === r.productId?.toString() && ci.variantId === r.variantId
        )
        const qty = conf ? Number(conf.quantity) : (r.dailyQty || 1)
        if (!qty || qty <= 0) return null
        return `${label(r.productId, r.variantId)} ×${qty}`
      })
      .filter(Boolean)

    const time = log.overrideDeliveryTime || cust.paikariConfig?.deliveryTime || '06:00'

    return {
      name: cust.name ?? '—',
      phone: cust.phone ?? '',
      location: cust.location ?? '',
      time,
      items,
      totalDue: cust.khata?.currentDue ?? 0,
      // Was this delivery confirmed on last night's call, or is it just the standing order?
      confirmed: log.callStatus === 'called'
    }
  })

  // Earliest deliveries first — matches the real-world route order.
  orders.sort((a, b) => a.time.localeCompare(b.time))

  return NextResponse.json({ orders })
}
