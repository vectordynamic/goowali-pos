'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  // Created once per browser session (useState, not module scope) so server-rendered
  // requests never share a client across users; stable across re-renders on the client.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // POS/admin data changes from other staff/devices fairly often — a short
            // staleTime avoids the "everyone else's screen is stale until they refresh"
            // problem without going back to fetch-on-every-render.
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      })
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
