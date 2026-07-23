import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import Transaction from '@/models/Transaction'
import Product from '@/models/Product'
import Customer from '@/models/Customer'
import DailyClosing from '@/models/DailyClosing'
import DailyOrderLog from '@/models/DailyOrderLog'
import {
  assertBranchAccess,
  branchDenied,
  generateInvoiceId,
} from '@/lib/utils'
import { updateDailySummary } from '@/lib/update-daily-summary'
import type { Role } from '@/types'
import mongoose from 'mongoose'

// POST /api/transactions/[id]/void
// Body: { reason: string, correction?: { transactionType, cashPaid, items, notes } }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, assignedBranches, id: userId } = session.user as {
    role: Role
    assignedBranches: string[]
    id: string
  }

  if (!['MANAGER', 'BRANCH_ADMIN', 'SUPER_ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  const { id: txId } = await params
  if (!txId || !/^[a-f0-9]{24}$/.test(txId)) {
    return NextResponse.json({ error: 'Invalid transaction ID' }, { status: 400 })
  }

  const body = await req.json()
  const { reason, correction } = body

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return NextResponse.json({ error: 'বাতিলের কারণ লিখুন' }, { status: 400 })
  }

  await dbConnect()

  const original = await Transaction.findById(txId)
  if (!original) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

  if (!assertBranchAccess(role, assignedBranches, original.branchId.toString())) {
    return branchDenied()
  }

  if (original.status === 'voided') {
    return NextResponse.json({ error: 'এই লেনদেন ইতোমধ্যে বাতিল করা হয়েছে' }, { status: 409 })
  }

  // Block if day is Locked
  const txDate = original.createdAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })
  const dayClosing = await DailyClosing.findOne({
    branchId: original.branchId,
    date: txDate,
  }).lean() as any

  if (dayClosing?.status === 'Locked') {
    return NextResponse.json(
      { error: 'এই দিনের হিসাব বন্ধ করা হয়েছে। বাতিল করা যাবে না।' },
      { status: 403 }
    )
  }

  // Reverse stock
  const stockDeductingTypes = ['Cash Sale', 'Credit Sale', 'Partial Payment', 'Procurement']
  if (stockDeductingTypes.includes(original.transactionType) && original.items.length > 0) {
    const uniqueProductIds = [...new Set(original.items.map((i: any) => i.productId.toString()))]
    const products = await Product.find({ _id: { $in: uniqueProductIds } })
    const productMap = new Map(products.map((p: any) => [p._id.toString(), p]))

    for (const item of original.items) {
      const product = productMap.get(item.productId.toString())
      if (!product) continue
      const variant = product.variants.find((v: any) => v.variantId === item.variantId)
      if (!variant) continue

      if (product.isPooled) {
        const poolEntry = product.pooledStock.find(
          (p: any) => p.branchId.toString() === original.branchId.toString()
        )
        if (poolEntry) {
          const portion = variant.portionSize ?? 1
          poolEntry.stockQty += portion * item.quantity
        }
      } else {
        const branchDetail = variant.branchDetails.find(
          (bd: any) => bd.branchId.toString() === original.branchId.toString()
        )
        if (branchDetail) {
          branchDetail.stockLevel += item.quantity
        }
      }
      await product.save()
    }
  }

  // Reverse khata
  if (original.customerId && original.financials.amountAddedToKhata > 0) {
    await Customer.findByIdAndUpdate(original.customerId, {
      $inc: { 'khata.currentDue': -original.financials.amountAddedToKhata },
    })
  }

  // Mark as voided
  original.status = 'voided'
  original.voidedAt = new Date()
  original.voidedBy = new mongoose.Types.ObjectId(userId)
  original.voidReason = reason.trim()
  await original.save()

  // Revert linked DailyOrderLog
  const linkedLog = await DailyOrderLog.findOne({ transactionId: original._id })
  if (linkedLog) {
    linkedLog.status = 'pending'
    linkedLog.transactionId = undefined
    linkedLog.updatedBy = new mongoose.Types.ObjectId(userId)
    await linkedLog.save()
  }

  // Create correction transaction if requested
  let correctionTx: any = null
  if (correction && typeof correction === 'object') {
    const {
      transactionType,
      cashPaid: correctionCashPaid,
      items: correctionItems,
      notes: correctionNotes,
    } = correction

    const validTypes = ['Cash Sale', 'Credit Sale', 'Partial Payment', 'Due Collection', 'Expense', 'Procurement']
    if (!validTypes.includes(transactionType)) {
      return NextResponse.json({ error: 'Invalid transaction type' }, { status: 400 })
    }
    if (!Array.isArray(correctionItems) || correctionItems.length === 0) {
      return NextResponse.json({ error: 'Correction items required' }, { status: 400 })
    }

    const stockDeductingCorrTypes = ['Cash Sale', 'Credit Sale', 'Partial Payment', 'Procurement']
    const corrProcessedItems: any[] = []
    let corrTotalBill = 0
    let corrTotalCOGS = 0

    if (stockDeductingCorrTypes.includes(transactionType)) {
      const corrUniqueIds = [...new Set(correctionItems.map((i: any) => i.productId))]
      const corrProducts = await Product.find({ _id: { $in: corrUniqueIds } })
      const corrProductMap = new Map(corrProducts.map((p: any) => [p._id.toString(), p]))

      for (const item of correctionItems) {
        const product = corrProductMap.get(item.productId)
        if (!product) continue
        const variant = product.variants.find((v: any) => v.variantId === item.variantId)
        if (!variant) continue
        const qty = Number(item.quantity)
        if (!qty || qty <= 0) continue

        if (product.isPooled) {
          const poolEntry = product.pooledStock.find(
            (p: any) => p.branchId.toString() === original.branchId.toString()
          )
          if (!poolEntry) continue
          const portion = variant.portionSize ?? 1
          const totalDeduction = portion * qty
          if (poolEntry.stockQty < totalDeduction) {
            return NextResponse.json(
              { error: `স্টক কম: ${product.name}` },
              { status: 400 }
            )
          }
          poolEntry.stockQty -= totalDeduction
          const bd = variant.branchDetails.find((b: any) => b.branchId.toString() === original.branchId.toString())
          const mrp = bd?.mrpPrice > 0 ? bd.mrpPrice : item.rateApplied
          corrTotalBill += mrp * qty
          corrTotalCOGS += (poolEntry.buyingPrice ?? 0) * totalDeduction
          corrProcessedItems.push({ productId: item.productId, variantId: item.variantId, quantity: qty, rateApplied: mrp, isCustomOverride: false })
          await product.save()
        } else {
          const bd = variant.branchDetails.find((b: any) => b.branchId.toString() === original.branchId.toString())
          if (!bd) continue
          if (bd.stockLevel < qty) {
            return NextResponse.json({ error: `স্টক কম: ${product.name}` }, { status: 400 })
          }
          const mrp = bd.mrpPrice > 0 ? bd.mrpPrice : item.rateApplied
          corrTotalBill += mrp * qty
          corrTotalCOGS += bd.buyingPrice * qty
          bd.stockLevel -= qty
          corrProcessedItems.push({ productId: item.productId, variantId: item.variantId, quantity: qty, rateApplied: mrp, isCustomOverride: false })
          await product.save()
        }
      }
    } else {
      // Non-stock types (Due Collection, Expense) — use provided amount directly
      corrTotalBill = Number(correctionCashPaid ?? 0)
    }

    const corrCash =
      transactionType === 'Cash Sale' ? corrTotalBill :
      transactionType === 'Partial Payment' ? Math.min(Number(correctionCashPaid ?? 0), corrTotalBill) :
      ['Due Collection', 'Expense', 'Procurement'].includes(transactionType) ? Number(correctionCashPaid ?? corrTotalBill) : 0

    const corrAddedToKhata = Math.max(0, corrTotalBill - corrCash)
    const corrNetProfit = corrTotalBill - corrTotalCOGS

    if (original.customerId && corrAddedToKhata > 0) {
      await Customer.findByIdAndUpdate(original.customerId, {
        $inc: { 'khata.currentDue': corrAddedToKhata },
      })
    }

    correctionTx = await Transaction.create({
      invoiceId: generateInvoiceId(original.branchId.toString()),
      branchId: original.branchId,
      recordedBy: new mongoose.Types.ObjectId(userId),
      customerId: original.customerId ?? null,
      transactionType,
      items: corrProcessedItems.length > 0 ? corrProcessedItems : correctionItems,
      financials: {
        totalBill: corrTotalBill,
        discount: 0,
        cashPaid: corrCash,
        amountAddedToKhata: corrAddedToKhata,
        netProfitAmount: corrNetProfit,
      },
      notes: correctionNotes ?? `সংশোধন — মূল: ${original.invoiceId}`,
      correctedFromId: original._id,
    })

    // Back-link on original
    original.correctedById = correctionTx._id
    await original.save()

    // Re-link the DailyOrderLog to the correction tx if it was a regular order
    if (linkedLog) {
      linkedLog.status = 'taken'
      linkedLog.transactionId = correctionTx._id
      await linkedLog.save()
    }
  }

  updateDailySummary(original.branchId.toString(), txDate).catch(() => {})

  return NextResponse.json({
    success: true,
    voided: original.toObject(),
    correction: correctionTx?.toObject() ?? null,
  })
}
