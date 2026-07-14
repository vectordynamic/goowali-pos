'use client'

import { useQuery } from '@tanstack/react-query'

// Shared cache for the branch list. Eight separate admin components each independently
// fetched `/api/branches` with identical parameters (none) and got an identical response for
// a given session — this collapses them onto one cache entry instead of one request per
// component per mount.
export function useBranches(enabled = true) {
  return useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const res = await fetch('/api/branches')
      if (!res.ok) throw new Error('Failed to load branches')
      return res.json()
    },
    enabled,
  })
}
