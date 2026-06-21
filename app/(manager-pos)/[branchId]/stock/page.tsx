import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import POSHeader from '@/components/layout/POSHeader'
import StockManager from '@/components/pos/StockManager'

export default async function StockPage({
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <POSHeader branchId={branchId} userId={id} userName={name ?? ''} role={role} />
      <div className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-800">স্টক ম্যানেজমেন্ট</h1>
          <p className="text-gray-500 mt-1">পণ্য গ্রহণ ও স্টক আপডেট করুন</p>
        </div>
        <StockManager branchId={branchId} />
      </div>
    </div>
  )
}
