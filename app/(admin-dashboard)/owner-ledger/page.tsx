import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import dbConnect from '@/lib/db'
import OwnerLedger from '@/components/admin/OwnerLedger'

export default async function OwnerLedgerPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { role, assignedBranches } = session.user
  if (role === 'MANAGER') redirect('/')

  await dbConnect()
  const Branch = (await import('@/models/Branch')).default
  const filter = role === 'SUPER_ADMIN' ? {} : { _id: { $in: assignedBranches } }
  const rawBranches = await Branch.find(filter).select('_id name').lean() as any[]
  const branches = rawBranches.map((b: any) => ({ _id: b._id.toString(), name: b.name }))

  return <OwnerLedger role={role} branches={branches} assignedBranches={assignedBranches} />
}
