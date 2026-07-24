import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import ExpenseManager from '@/components/admin/ExpenseManager'
import type { Role } from '@/types'

export default async function AdminExpensesPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }

  if (role === 'MANAGER') redirect('/')

  await dbConnect()
  const { default: Branch } = await import('@/models/Branch')
  
  const filter = role === 'SUPER_ADMIN' ? {} : { _id: { $in: assignedBranches } }
  const branches = await Branch.find(filter).select('name').sort({ name: 1 }).lean()
  
  const formattedBranches = branches.map((b: any) => ({ _id: b._id.toString(), name: b.name }))

  return <ExpenseManager role={role} branches={formattedBranches} />
}
