import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import dbConnect from '@/lib/db'
import BranchReport from '@/components/admin/BranchReport'

export default async function BranchDashboardPage({
  params,
}: {
  params: { branchId: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role === 'MANAGER') redirect('/')

  const { role, assignedBranches } = session.user
  const { branchId } = params

  await dbConnect()
  const Branch = (await import('@/models/Branch')).default
  const filter = role === 'SUPER_ADMIN' ? {} : { _id: { $in: assignedBranches } }
  const raw = await Branch.find(filter).select('_id name').lean() as any[]
  const branches = raw.map((b: any) => ({ _id: b._id.toString(), name: b.name }))

  return (
    <BranchReport
      role={role}
      branches={branches}
      assignedBranches={assignedBranches}
      defaultBranchId={branchId}
    />
  )
}
