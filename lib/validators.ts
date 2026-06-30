import { z } from 'zod'

// ─── Bangladesh phone: exactly 11 digits, starts 013-019 ──────────────────────
export const bdPhone = z
  .string()
  .trim()
  .regex(/^01[3-9]\d{8}$/, 'Phone must be 11 digits and start with 013–019')

// ─── MongoDB ObjectId ─────────────────────────────────────────────────────────
export const objectId = z
  .string()
  .regex(/^[a-f0-9]{24}$/, 'Invalid ID format')

// ─── Branch ───────────────────────────────────────────────────────────────────
export const BranchCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  address: z.string().trim().max(200).optional(),
  contactPhone: bdPhone.optional().or(z.literal(''))
})

export const BranchUpdateSchema = BranchCreateSchema.partial().extend({
  isActive: z.boolean().optional()
})

// ─── User ─────────────────────────────────────────────────────────────────────
export const UserCreateSchema = z.object({
  name: z.string().trim().min(2, 'Name too short').max(100),
  phone: bdPhone,
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  role: z.enum(['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER']),
  assignedBranches: z.array(objectId).default([])
})

export const UserUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: bdPhone.optional(),
  password: z.string().min(6).max(100).optional(),
  role: z.enum(['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER']).optional(),
  assignedBranches: z.array(objectId).optional(),
  isActive: z.boolean().optional()
})

// ─── Customer ─────────────────────────────────────────────────────────────────
export const CustomerCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  phone: bdPhone,
  location: z.string().trim().max(200).optional(),
  customerType: z.enum(['Retail', 'Paikari']),
  registeredBranch: objectId.optional(),
  paikariConfig: z.object({
    deliveryMethod: z.enum(['Pickup', 'Send']).default('Pickup'),
    dailyRequirementLiters: z.number().min(0).default(0),
    fixedProductRates: z.array(z.object({
      productId: objectId,
      variantId: z.string().min(1),
      lockedRate: z.number().min(0),
      dailyQty: z.number().min(0).default(1)
    })).default([])
  }).default(() => ({ deliveryMethod: 'Pickup' as const, dailyRequirementLiters: 0, fixedProductRates: [] }))
})

// Used by POS quick-create: phone optional, type defaults to Retail
export const QuickCustomerCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  phone: bdPhone.optional(),
  customerType: z.enum(['Retail', 'Paikari']).default('Retail'),
})

export const CustomerUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: bdPhone.optional(),
  location: z.string().trim().max(200).optional(),
  customerType: z.enum(['Retail', 'Paikari']).optional(),
  registeredBranch: objectId.optional(),
  isActive: z.boolean().optional(),
  paikariConfig: z.object({
    deliveryMethod: z.enum(['Pickup', 'Send']).default('Pickup'),
    dailyRequirementLiters: z.number().min(0).default(0),
    fixedProductRates: z.array(z.object({
      productId: objectId,
      variantId: z.string().min(1),
      lockedRate: z.number().min(0),
      dailyQty: z.number().min(0).default(1)
    })).default([])
  }).optional()
})

// ─── Product ──────────────────────────────────────────────────────────────────
export const BranchDetailSchema = z.object({
  branchId: objectId,
  stockLevel: z.number().min(0).default(0),
  buyingPrice: z.number().min(0),
  mrpPrice: z.number().min(0).default(0)
})

export const VariantSchema = z.object({
  variantId: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9_]+$/, 'Variant ID: lowercase letters, numbers, underscores only'),
  sizeLabel: z.string().trim().max(50).optional(),
  portionSize: z.number().min(0).default(0),
  branchDetails: z.array(BranchDetailSchema).default([])
})

export const PooledStockEntrySchema = z.object({
  branchId: objectId,
  stockQty: z.number().min(0).default(0),
  buyingPrice: z.number().min(0).default(0)
})

export const ProductCreateSchema = z.object({
  productCode: z.string().trim().min(1, 'Product code is required').max(50).toUpperCase(),
  name: z.string().trim().min(1, 'Name is required').max(200),
  category: z.string().trim().max(100).optional(),
  unitType: z.enum(['Liquid', 'Weight', 'Fixed']),
  isOpenLoose: z.boolean().default(false),
  isPooled: z.boolean().default(false),
  variants: z.array(VariantSchema).default([]),
  pooledStock: z.array(PooledStockEntrySchema).default([])
})

export const ProductUpdateSchema = ProductCreateSchema.partial()

export const BranchPricingSchema = z.object({
  variantId: z.string().min(1),
  branchId: objectId,
  buyingPrice: z.number().min(0),
  mrpPrice: z.number().min(0).optional(),
  stockLevel: z.number().min(0).optional()
})

// ─── Transaction ──────────────────────────────────────────────────────────────
export const TransactionItemSchema = z.object({
  productId: objectId,
  variantId: z.string().min(1),
  quantity: z.number().positive('Quantity must be > 0'),
  rateApplied: z.number().min(0)
})

export const TransactionCreateSchema = z.object({
  branchId: objectId,
  customerId: objectId.nullable().optional(),
  transactionType: z.enum([
    'Cash Sale', 'Credit Sale', 'Partial Payment',
    'Due Collection', 'Expense', 'Procurement'
  ]),
  items: z.array(TransactionItemSchema).min(1, 'At least one item required'),
  discount: z.number().min(0).optional(),
  cashPaid: z.number().min(0).optional(),
  notes: z.string().trim().max(500).optional()
})

// ─── Wholesale dispatch ───────────────────────────────────────────────────────
export const DispatchItemSchema = z.object({
  productId: objectId,
  variantId: z.string().min(1),
  quantity: z.number().min(0),
  rateApplied: z.number().min(0),
  skipped: z.boolean().default(false)
})

export const DispatchSchema = z.object({
  branchId: objectId,
  items: z.array(DispatchItemSchema).min(1)
})

export const DueCollectionSchema = z.object({
  branchId: objectId,
  amountCollected: z.number().positive('Amount must be > 0'),
  notes: z.string().trim().max(500).optional()
})

// ─── Daily closing ────────────────────────────────────────────────────────────
export const DailyClosingSubmitSchema = z.object({
  branchId: objectId,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  physicalCashCounted: z.number().min(0),
  remainingMilkStock: z.number().min(0).optional()
})

// ─── Helper: parse and return 400 on failure ─────────────────────────────────
import { NextResponse } from 'next/server'

export function validate<T>(schema: z.ZodType<T>, data: unknown):
  | { success: true; data: T }
  | { success: false; response: NextResponse } {
  const result = schema.safeParse(data)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message
    }))
    return {
      success: false,
      response: NextResponse.json({ error: 'Validation failed', errors }, { status: 400 })
    }
  }
  return { success: true, data: result.data }
}
