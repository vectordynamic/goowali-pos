import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import RegularOrderManager from '@/components/admin/RegularOrderManager'

export default async function RegularOrdersPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { role, assignedBranches } = session.user

  if (role === 'MANAGER') redirect('/login')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Regular Orders</h1>
        <p className="text-slate-400 text-sm mt-1">
          Configure standing daily orders for customers — product, quantity, and locked price
        </p>
      </div>
      <RegularOrderManager role={role} assignedBranches={assignedBranches} />
    </div>
  )
}
