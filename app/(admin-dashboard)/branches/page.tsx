import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import BranchManager from '@/components/admin/BranchManager'

export default async function BranchesPage() {
  const session = await getServerSession(authOptions)
  if (session?.user.role !== 'SUPER_ADMIN') redirect('/analytics')

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Branch Management</h1>
        <p className="text-slate-400 text-sm mt-0.5">Create and manage all branches</p>
      </div>
      <BranchManager />
    </div>
  )
}
