import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import dbConnect from '@/lib/db'
import Branch from '@/models/Branch'
import StockLogViewer from '@/components/admin/StockLogViewer'
import type { Role } from '@/types'

export default async function StockLogPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { role, assignedBranches } = session.user as { role: Role; assignedBranches: string[] }

  await dbConnect()
  const allBranches = await Branch.find({ isActive: true }).lean()

  // BRANCH_ADMIN sees only their branches
  const visibleBranches = role === 'SUPER_ADMIN'
    ? allBranches
    : allBranches.filter((b: any) => assignedBranches.includes(b._id.toString()))

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Stock Log</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          All stock additions and corrections recorded by managers and admins
        </p>
      </div>
      <StockLogViewer
        role={role as 'SUPER_ADMIN' | 'BRANCH_ADMIN'}
        assignedBranches={assignedBranches}
        branches={visibleBranches.map((b: any) => ({ _id: b._id.toString(), name: b.name }))}
      />
    </div>
  )
}
