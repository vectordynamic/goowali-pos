import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import POSHeader from '@/components/layout/POSHeader'
import DuePage from '@/components/pos/DuePage'

export default async function DuePageRoute({
  params
}: {
  params: Promise<{ branchId: string }>
}) {
  const { branchId } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { role, assignedBranches, id, name } = session.user

  if (role !== 'SUPER_ADMIN' && !assignedBranches.includes(branchId)) {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <POSHeader branchId={branchId} userId={id} userName={name ?? ''} role={role} />
      <div className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-800">বাকির তালিকা</h1>
          <p className="text-gray-500 mt-1">কাস্টমারের কাছ থেকে বাকি আদায় করুন</p>
        </div>
        <DuePage role={role} assignedBranches={assignedBranches} forceBranchId={branchId} lightMode />
      </div>
    </div>
  )
}
