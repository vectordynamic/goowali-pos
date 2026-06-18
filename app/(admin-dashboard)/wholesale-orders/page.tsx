import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import WholesaleOrderManager from '@/components/admin/WholesaleOrderManager'

export default async function WholesaleOrdersPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { role, assignedBranches } = session.user

  if (role === 'MANAGER') redirect('/login')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Wholesale Orders</h1>
        <p className="text-slate-400 text-sm mt-1">
          Configure daily orders for Paikari customers — product, quantity, and locked price
        </p>
      </div>
      <WholesaleOrderManager role={role} assignedBranches={assignedBranches} />
    </div>
  )
}
