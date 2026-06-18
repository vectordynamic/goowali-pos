import type { Types } from 'mongoose'

export type Role = 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'MANAGER'

export type CustomerType = 'Retail' | 'Paikari'

export type UnitType = 'Liquid' | 'Weight' | 'Fixed'

export type TransactionType =
  | 'Cash Sale'
  | 'Credit Sale'
  | 'Partial Payment'
  | 'Due Collection'
  | 'Expense'
  | 'Procurement'

export type DayStatus = 'Open' | 'Locked'

// ─── Session ──────────────────────────────────────────────────────────────────

export interface SessionUser {
  id: string
  name: string
  phone: string
  role: Role
  assignedBranches: string[]
}

// ─── Branch ───────────────────────────────────────────────────────────────────

export interface IBranch {
  _id: Types.ObjectId
  name: string
  address?: string
  contactPhone?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// ─── User ─────────────────────────────────────────────────────────────────────

export interface IUser {
  _id: Types.ObjectId
  name: string
  phone: string
  passwordHash: string
  role: Role
  assignedBranches: Types.ObjectId[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export interface IFixedRate {
  productId: Types.ObjectId
  variantId: string
  lockedRate: number
}

export interface ICustomer {
  _id: Types.ObjectId
  name: string
  phone: string
  location?: string
  customerType: CustomerType
  paikariConfig: {
    deliveryMethod: 'Pickup' | 'Send'
    dailyRequirementLiters: number
    fixedProductRates: IFixedRate[]
  }
  khata: {
    currentDue: number
    lastPaymentDate?: Date
    creditLimit: number
  }
  createdAt: Date
  updatedAt: Date
}

// ─── Product ──────────────────────────────────────────────────────────────────

export interface IBranchDetail {
  branchId: Types.ObjectId
  stockLevel: number
  buyingPrice: number
  mrpPrice: number
}

export interface IVariant {
  variantId: string
  sizeLabel?: string
  branchDetails: IBranchDetail[]
}

export interface IProduct {
  _id: Types.ObjectId
  name: string
  category?: string
  unitType: UnitType
  isOpenLoose: boolean
  variants: IVariant[]
  createdAt: Date
  updatedAt: Date
}

// ─── Transaction ──────────────────────────────────────────────────────────────

export interface ITransactionItem {
  productId: Types.ObjectId
  variantId: string
  quantity: number
  rateApplied: number
  isCustomOverride: boolean
}

export interface ITransaction {
  _id: Types.ObjectId
  invoiceId: string
  branchId: Types.ObjectId
  recordedBy: Types.ObjectId
  customerId?: Types.ObjectId | null
  transactionType: TransactionType
  items: ITransactionItem[]
  financials: {
    totalBill: number
    cashPaid: number
    amountAddedToKhata: number
    netProfitAmount: number
  }
  notes?: string
  createdAt: Date
  updatedAt: Date
}

// ─── Daily Closing ────────────────────────────────────────────────────────────

export interface IDailyClosing {
  _id: Types.ObjectId
  branchId: Types.ObjectId
  date: string
  status: DayStatus
  mathematicalSystemTotals: {
    openingCash: number
    cashSales: number
    dueCollections: number
    expensesLogged: number
    expectedDrawerCash: number
  }
  managerSubmittedTotals: {
    physicalCashCounted: number
    remainingMilkStock: number
  }
  discrepancies: {
    cashShortage: number
    stockMismatch: number
  }
  submittedBy?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

// ─── API response helpers ─────────────────────────────────────────────────────

export interface ApiError {
  error: string
  code?: number
}

export type ApiResponse<T> = T | ApiError
