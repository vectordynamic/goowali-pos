import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import ExpenseEntry from '@/components/pos/ExpenseEntry'
import type { Role } from '@/types'
import { assertBranchAccess } from '@/lib/utils'

export default async function ExpensesPage({ params }: { params: { branchId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { role, assignedBranches, name: userName } = session.user as {
    role: Role
    assignedBranches: string[]
    name: string
  }

  if (!assertBranchAccess(role, assignedBranches, params.branchId)) {
    redirect('/analytics')
  }

  return <ExpenseEntry branchId={params.branchId} userName={userName} />
}
