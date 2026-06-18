import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import POSTerminal from '@/components/pos/POSTerminal'
import POSHeader from '@/components/layout/POSHeader'

export default async function POSPage({
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
      <POSTerminal branchId={branchId} userId={id} />
    </div>
  )
}
