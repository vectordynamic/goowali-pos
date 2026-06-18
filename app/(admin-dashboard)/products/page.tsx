import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import ProductManager from '@/components/admin/ProductManager'

export default async function ProductsPage() {
  const session = await getServerSession(authOptions)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Product Management</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Global products with branch-specific pricing and stock
        </p>
      </div>
      <ProductManager role={session!.user.role} assignedBranches={session!.user.assignedBranches} />
    </div>
  )
}
