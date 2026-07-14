'use client'

import { useQuery } from '@tanstack/react-query'

// Shared cache for one branch+date's daily-closing record. POSTerminal and ZReport both
// fetch `/api/daily-closing?branchId=&date=` for today's date; BranchReport fetches the same
// endpoint for an admin-selected date. Keying the cache on both branchId and date means
// today's-record lookups (POSTerminal/ZReport) share a cache entry with each other while a
// BranchReport lookup for a past date gets its own entry, never colliding.
export function useDailyClosing(branchId: string, date: string) {
  return useQuery({
    queryKey: ['daily-closing', branchId, date],
    queryFn: async () => {
      const res = await fetch(`/api/daily-closing?branchId=${branchId}&date=${date}`)
      if (!res.ok) throw new Error('হিসাব লোড হয়নি')
      return res.json()
    },
    enabled: !!branchId && !!date,
  })
}
