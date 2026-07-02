import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DuePage from '@/components/pos/DuePage'

export default async function AdminDuePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { role, assignedBranches } = session.user

  if (role === 'MANAGER') redirect('/login')

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Outstanding Dues</h1>
        <p className="text-slate-400 text-sm mt-1">
          {role === 'SUPER_ADMIN'
            ? 'All branches — retail and wholesale due collection'
            : 'Your branch — retail and wholesale due collection'}
        </p>
      </div>
      <DuePage role={role} assignedBranches={assignedBranches} />
    </div>
  )
}
