import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CustomerManager from '@/components/admin/CustomerManager'

export default async function CustomersPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role === 'MANAGER') redirect('/')

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Customers</h1>
        <p className="text-slate-400 text-sm mt-1">
          {session.user.role === 'SUPER_ADMIN'
            ? 'All customers across all branches'
            : 'Customers registered to your branches'}
        </p>
      </div>

      <CustomerManager
        role={session.user.role as any}
        assignedBranches={session.user.assignedBranches ?? []}
      />
    </div>
  )
}
