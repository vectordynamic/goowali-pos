import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import type { Role } from '@/types'

export default withAuth(
  function proxy(req) {
    const token = req.nextauth.token
    const { pathname } = req.nextUrl
    const role = token?.role as Role | undefined
    const assignedBranches = (token?.assignedBranches as string[]) ?? []

    if (!role) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    // /branches — SUPER_ADMIN only; anyone else gets a redirect (no 403 page — don't reveal it exists)
    if (pathname === '/branches' || pathname.startsWith('/branches/')) {
      if (role !== 'SUPER_ADMIN') {
        return NextResponse.redirect(new URL('/', req.url))
      }
    }

    // Admin-only pages: MANAGERs get silently sent to their POS
    const adminOnlyPaths = ['/analytics', '/users', '/products', '/customers', '/customer-approvals', '/regular-orders', '/wholesale-orders', '/due', '/branches']
    if (adminOnlyPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
      if (role === 'MANAGER') {
        const branchId = assignedBranches[0]
        return NextResponse.redirect(
          new URL(branchId ? `/${branchId}/pos` : '/login', req.url)
        )
      }
    }

    // /[branchId]/(pos|transactions|customers|stock|due|z-report)
    const posMatch = pathname.match(/^\/([a-f0-9]{24})\/(pos|transactions|customers|stock|due|z-report|next-day-orders)/)
    if (posMatch) {
      const branchId = posMatch[1]
      const section = posMatch[2]

      // Branch access check
      if (role !== 'SUPER_ADMIN' && !assignedBranches.includes(branchId)) {
        return NextResponse.redirect(new URL('/', req.url))
      }

    }

    // Block any path that looks like /<24-hex-char-id>/... that isn't a valid POS route
    const branchPathMatch = pathname.match(/^\/([a-f0-9]{24})(?:\/|$)/)
    if (branchPathMatch && !posMatch) {
      const branchId = branchPathMatch[1]
      if (role !== 'SUPER_ADMIN' && !assignedBranches.includes(branchId)) {
        return NextResponse.redirect(new URL('/', req.url))
      }
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token
    }
  }
)

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|login).*)']
}
