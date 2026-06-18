import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import POSHeader from '@/components/layout/POSHeader'
import SalesLog from '@/components/pos/SalesLog'

export default async function TransactionsPage({
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
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      <POSHeader branchId={branchId} userId={id} userName={name ?? ''} role={role} />
      <div className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-100">Sales Log</h1>
          <p className="text-slate-400 text-sm mt-1">Daily transaction history for this branch</p>
        </div>
        <SalesLog branchId={branchId} role={role} />
      </div>
    </div>
  )
}
