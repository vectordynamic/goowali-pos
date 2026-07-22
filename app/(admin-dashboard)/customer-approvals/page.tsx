import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CustomerApprovalManager from '@/components/admin/CustomerApprovalManager'

export default async function CustomerApprovalsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role === 'MANAGER') redirect('/')

  const { role, assignedBranches } = session.user

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Customer Approvals</h1>
        <p className="text-slate-400 text-sm mt-1">
          Managers request temporary customers to become permanent Paikari customers — review and approve
        </p>
      </div>
      <CustomerApprovalManager role={role} assignedBranches={assignedBranches} />
    </div>
  )
}
