import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { getServerSession } from 'next-auth'
import { authOptions } from './auth'
import type { Role } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function getSession() {
  return getServerSession(authOptions)
}

export function requireRole(userRole: Role, ...allowed: Role[]) {
  return allowed.includes(userRole)
}

// Strips buyingPrice from product variants for MANAGER role
export function stripSensitiveProductData(products: any[], role: Role) {
  if (role !== 'MANAGER') return products

  return products.map((product) => ({
    ...product,
    variants: product.variants?.map((variant: any) => ({
      ...variant,
      branchDetails: variant.branchDetails?.map((bd: any) => {
        const { buyingPrice: _bp, ...safe } = bd
        return safe
      })
    })),
    pooledStock: product.pooledStock?.map((ps: any) => {
      const { buyingPrice: _bp, ...safe } = ps
      return safe
    })
  }))
}

// Strips netProfitAmount from transactions for MANAGER role
export function stripSensitiveTransactionData(transactions: any[], role: Role) {
  if (role !== 'MANAGER') return transactions

  return transactions.map((tx) => {
    const { financials, ...rest } = tx
    const { netProfitAmount: _np, ...safeFinancials } = financials ?? {}
    return { ...rest, financials: safeFinancials }
  })
}

// Returns branches the user is allowed to query
// SUPER_ADMIN: null (no filter = all)
// BRANCH_ADMIN / MANAGER: their assignedBranches array
export function getBranchFilter(role: Role, assignedBranches: string[]) {
  if (role === 'SUPER_ADMIN') return null
  return assignedBranches
}

export function assertBranchAccess(
  role: Role,
  assignedBranches: string[],
  branchId: string
): boolean {
  if (role === 'SUPER_ADMIN') return true
  return assignedBranches.includes(branchId)
}

// Returns a 404 response for unauthorized branch access.
// We return 404 (not 403) so callers cannot infer whether the branch exists.
import { NextResponse } from 'next/server'
export function branchDenied() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export function generateInvoiceId(branchId: string): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase()
  return `INV-${branchId.slice(-4).toUpperCase()}-${ts}-${rand}`
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 0
  }).format(amount)
}

export function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })
}

