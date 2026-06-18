import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { Role } from '@/types'

export default async function RootPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const role = session.user.role as Role
  const assignedBranches = session.user.assignedBranches as string[]

  if (role === 'MANAGER') {
    const branchId = assignedBranches[0]
    if (branchId) redirect(`/${branchId}/pos`)
    redirect('/login')
  }

  redirect('/analytics')
}
