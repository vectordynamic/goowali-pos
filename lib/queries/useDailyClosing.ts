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

// Resolves the day the manager must act on in the Z-Report: the earliest still-Open day
// (a stale unclosed day that must be closed before a new one can start), else today. Kept
// separate from useDailyClosing so the Z-Report can target a prior open date even after the
// system date has rolled over past it.
export function useActiveClosingDate(branchId: string) {
  return useQuery({
    queryKey: ['daily-closing-active', branchId],
    queryFn: async (): Promise<string> => {
      const res = await fetch(`/api/daily-closing?branchId=${branchId}&active=1`)
      if (!res.ok) throw new Error('হিসাব লোড হয়নি')
      const data = await res.json()
      return data.activeDate as string
    },
    enabled: !!branchId,
  })
}
