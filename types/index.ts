import type { Types } from 'mongoose'

export type Role = 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'MANAGER'

export type CustomerType = 'Retail' | 'Paikari'

export type CustomerApprovalStatus = 'approved' | 'pending' | 'rejected' | 'temporary'

export type CallStatus = 'not_called' | 'called' | 'no_answer' | 'skipped'

export type UnitType = 'Liquid' | 'Weight' | 'Fixed'

export type TransactionType =
  | 'Cash Sale'
  | 'Credit Sale'
  | 'Partial Payment'
  | 'Due Collection'
  | 'Expense'
  | 'Procurement'
  | 'Owner Purchase'      // stock funded by a branch admin's own money — never touches drawer cash
  | 'Owner Withdrawal'    // cash taken from the drawer by a branch admin — reduces drawer cash

export type DayStatus = 'Pending' | 'Open' | 'Locked'

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
    deliveryTime: string
    dailyRequirementLiters: number
    fixedProductRates: IFixedRate[]
  }
  approvalStatus: CustomerApprovalStatus
  approvalRequestedBy?: Types.ObjectId
  approvalRequestedAt?: Date
  approvalNote?: string
  khata: {
    currentDue: number
    lastPaymentDate?: Date
    creditLimit: number
  }
  createdAt: Date
  updatedAt: Date
}

// ─── Daily Order Log (call sheet + dispatch) ────────────────────────────────

export interface IConfirmedItem {
  productId: Types.ObjectId
  variantId: string
  quantity: number
}

export interface IDailyOrderLog {
  _id: Types.ObjectId
  branchId: Types.ObjectId
  date: string
  customerId: Types.ObjectId
  status: 'pending' | 'taken' | 'skipped'
  callStatus: CallStatus
  confirmedItems: IConfirmedItem[]
  overrideDeliveryTime?: string
  callNotes?: string
  calledBy?: Types.ObjectId
  calledAt?: Date
  isTemporary: boolean
  transactionId?: Types.ObjectId
  updatedBy?: Types.ObjectId
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
  portionSize?: number
  branchDetails: IBranchDetail[]
}

export interface IPooledStockEntry {
  branchId: Types.ObjectId
  stockQty: number
  buyingPrice: number
}

export interface IProduct {
  _id: Types.ObjectId
  name: string
  category?: string
  unitType: UnitType
  isOpenLoose: boolean
  isPooled: boolean
  variants: IVariant[]
  pooledStock: IPooledStockEntry[]
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
  ownerId?: Types.ObjectId | null    // which branch admin funded/withdrew (Owner Purchase / Owner Withdrawal only)
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
    procurementCost: number
    ownerWithdrawals: number
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
