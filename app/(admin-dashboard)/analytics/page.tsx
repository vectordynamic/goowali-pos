import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import AnalyticsDashboard from '@/components/dashboard/AnalyticsDashboard'

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Analytics</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {session?.user.role === 'SUPER_ADMIN'
            ? 'Global performance across all branches'
            : 'Performance for your branch'}
        </p>
      </div>
      <AnalyticsDashboard role={session!.user.role} />
    </div>
  )
}
