import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import UserManager from '@/components/admin/UserManager'

export default async function UsersPage() {
  const session = await getServerSession(authOptions)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">User Management</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {session?.user.role === 'SUPER_ADMIN'
            ? 'Manage all users and roles system-wide'
            : 'Manage managers for your branches'}
        </p>
      </div>
      <UserManager role={session!.user.role} />
    </div>
  )
}
