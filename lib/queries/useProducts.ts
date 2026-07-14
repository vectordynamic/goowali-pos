'use client'

import { useQuery } from '@tanstack/react-query'

// Shared cache for a branch's product catalog. POSTerminal, ZReport, and DailyOrders all
// fetch the exact same `/api/products?branchId=` response — previously each did its own
// independent fetch on mount with no cache, so navigating between those pages within the
// same session re-fetched the whole catalog every time. StockManager uses a different query
// param (`context=stock`, which changes the response shape — buying price is always
// included there) so it gets its own cache entry, not shared with the other three.
export function useProducts(branchId: string, opts?: { context?: 'stock' }) {
  return useQuery({
    queryKey: ['products', branchId, opts?.context ?? null],
    queryFn: async () => {
      const params = new URLSearchParams({ branchId })
      if (opts?.context) params.set('context', opts.context)
      const res = await fetch(`/api/products?${params}`)
      if (!res.ok) throw new Error('পণ্য লোড হয়নি')
      return res.json()
    },
    enabled: !!branchId,
  })
}

// Admin global catalog view (`?all=1`) — shared by ProductManager and RegularOrderManager,
// which both previously fetched this exact same endpoint independently.
export function useAllProducts() {
  return useQuery({
    queryKey: ['products', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/products?all=1')
      if (!res.ok) throw new Error('Failed to load products')
      return res.json()
    },
  })
}
