import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import POSHeader from '@/components/layout/POSHeader'
import ZReport from '@/components/pos/ZReport'

export default async function ZReportPage({
  params
}: {
  params: Promise<{ branchId: string }>
}) {
  const { branchId } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { role, assignedBranches, id, name } = session.user

  if (role !== 'SUPER_ADMIN' && !assignedBranches.includes(branchId)) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      <POSHeader branchId={branchId} userId={id} userName={name ?? ''} role={role} />
      <div className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-100">Daily Z-Report</h1>
          <p className="text-slate-400 text-sm">End-of-day cash & stock reconciliation</p>
        </div>
        <ZReport branchId={branchId} />
      </div>
    </div>
  )
}
