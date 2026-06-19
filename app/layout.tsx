import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import SessionProvider from '@/components/providers/SessionProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Shop Management System',
  description: 'Multi-branch POS & Inventory Management'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0f] text-slate-100 antialiased" suppressHydrationWarning>
        <SessionProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1e2230',
                color: '#e2e8f0',
                border: '1px solid #334155'
              }
            }}
          />
        </SessionProvider>
      </body>
    </html>
  )
}
