import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import AdminLayoutWrapper from '@/components/layout/AdminLayoutWrapper'
import dbConnect from '@/lib/db'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role === 'MANAGER') redirect('/')

  const { role, assignedBranches } = session.user

  // Fetch branch names for the sidebar — only what the caller is allowed to see
  let branchList: { _id: string; name: string }[] = []
  try {
    await dbConnect()
    const Branch = (await import('@/models/Branch')).default
    const filter = role === 'SUPER_ADMIN' ? {} : { _id: { $in: assignedBranches } }
    const branches = await Branch.find(filter).select('_id name').lean() as any[]
    branchList = branches.map((b: any) => ({ _id: b._id.toString(), name: b.name }))
  } catch {
    // non-fatal — sidebar shows hex IDs as fallback
  }

  return (
    <AdminLayoutWrapper
      role={role}
      assignedBranches={assignedBranches}
      branchList={branchList}
    >
      {children}
    </AdminLayoutWrapper>
  )
}
