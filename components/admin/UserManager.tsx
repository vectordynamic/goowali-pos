'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, X, RefreshCw, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import ConfirmModal from '@/components/ui/ConfirmModal'
import type { Role } from '@/types'

interface Branch {
  _id: string
  name: string
}

interface User {
  _id: string
  name: string
  phone: string
  role: Role
  assignedBranches: string[]
  isActive: boolean
}

interface Props {
  role: Role
  assignedBranches: string[]
}

const ROLE_COLORS: Record<Role, string> = {
  SUPER_ADMIN: 'bg-violet-900/50 text-violet-400',
  BRANCH_ADMIN: 'bg-blue-900/50 text-blue-400',
  MANAGER: 'bg-slate-700 text-slate-400'
}

export default function UserManager({ role: actorRole, assignedBranches: actorBranches }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'create' | User>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  function load() {
    setLoading(true)
    Promise.all([
      fetch('/api/users').then((r) => r.json()),
      fetch('/api/branches').then((r) => r.json())
    ])
      .then(([u, b]) => {
        setUsers(Array.isArray(u) ? u : [])
        setBranches(Array.isArray(b) ? b : [])
      })
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleDelete(user: User) {
    const loadingToast = toast.loading(`Deactivating ${user.name}…`)
    const res = await fetch(`/api/users/${user._id}`, { method: 'DELETE' })
    toast.dismiss(loadingToast)

    if (res.ok) {
      toast.success(`${user.name} deactivated`)
      setDeleteTarget(null)
      load()
    } else {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to deactivate user')
    }
  }

  function branchName(id: string) {
    return branches.find((b) => b._id === id)?.name ?? `…${id.slice(-4)}`
  }

  // Mirrors the backend's getActorAndTarget rule: a branch admin can edit/deactivate
  // managers, but never a fellow admin (or themselves) — only super admin can.
  function canManage(user: User) {
    return actorRole === 'SUPER_ADMIN' || user.role === 'MANAGER'
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{users.length} users</span>
          <button
            onClick={load}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onClick={() => setModal('create')}
          className="btn-primary flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Add User
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="text-center text-slate-500 py-12 text-sm">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="text-center text-slate-500 py-12 text-sm">No users yet</div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Role</th>
                {actorRole === 'SUPER_ADMIN' && <th>Branches</th>}
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id}>
                  <td className="font-medium text-slate-100">{user.name}</td>
                  <td className="font-mono text-xs">{user.phone}</td>
                  <td>
                    <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', ROLE_COLORS[user.role])}>
                      {user.role === 'SUPER_ADMIN' ? 'Super Admin'
                        : user.role === 'BRANCH_ADMIN' ? 'Admin'
                        : 'Manager'}
                    </span>
                  </td>
                  {actorRole === 'SUPER_ADMIN' && (
                    <td className="text-xs">
                      {user.role === 'SUPER_ADMIN' ? (
                        <span className="text-violet-400">All branches</span>
                      ) : user.assignedBranches.length === 0 ? (
                        <span className="text-slate-600">None assigned</span>
                      ) : (
                        user.assignedBranches.map((b) => (
                          <span
                            key={b}
                            className="inline-block bg-slate-800 rounded px-1.5 py-0.5 mr-1 mb-0.5 text-slate-400"
                          >
                            {branchName(b)}
                          </span>
                        ))
                      )}
                    </td>
                  )}
                  <td>
                    <span className={user.isActive ? 'badge-success' : 'badge-danger'}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    {canManage(user) && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setModal(user)}
                          className="p-1.5 text-slate-500 hover:text-slate-100 hover:bg-slate-700 rounded transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(user)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-900/20 rounded transition-colors"
                          title="Deactivate"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <UserModal
          actorRole={actorRole}
          actorBranches={actorBranches}
          branches={branches}
          user={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load() }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Deactivate user?"
          message={`${deleteTarget.name} will be deactivated and can no longer sign in.`}
          confirmLabel="Deactivate"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

function UserModal({
  actorRole,
  actorBranches,
  branches,
  user,
  onClose,
  onSave
}: {
  actorRole: Role
  actorBranches: string[]
  branches: Branch[]
  user: User | null
  onClose: () => void
  onSave: () => void
}) {
  // A branch admin operates on exactly one branch in practice — never show them
  // a picker or let them know other branches exist. Falls back to a picker only
  // in the unusual case a branch admin is assigned to more than one branch.
  const isBranchAdmin = actorRole === 'BRANCH_ADMIN'
  const needsBranchPicker = !isBranchAdmin || branches.length !== 1

  // A branch admin's own branch(es) — applies regardless of which non-SUPER_ADMIN role
  // is being created, so switching between Manager/Admin never loses the auto-fill.
  function defaultBranchesFor(targetRole: Role) {
    if (targetRole === 'SUPER_ADMIN') return []
    if (isBranchAdmin && branches.length === 1) return [branches[0]._id]
    if (isBranchAdmin) return actorBranches
    return []
  }

  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [role, setRole] = useState<Role>(user?.role ?? 'MANAGER')
  const [selectedBranches, setSelectedBranches] = useState<string[]>(
    user?.assignedBranches ?? defaultBranchesFor(role)
  )
  const [phoneError, setPhoneError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const availableRoles: Role[] =
    actorRole === 'SUPER_ADMIN'
      ? ['SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER']
      : ['MANAGER', 'BRANCH_ADMIN']

  function validatePhone(value: string) {
    if (value && !/^01[3-9]\d{8}$/.test(value)) {
      setPhoneError('Must be 11 digits, starting with 013–019')
    } else {
      setPhoneError('')
    }
  }

  function toggleBranch(id: string) {
    setSelectedBranches((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (phoneError) return

    setSubmitting(true)

    const payload: Record<string, unknown> = {
      name,
      phone,
      role,
      assignedBranches: selectedBranches
    }
    if (password) payload.password = password

    const res = user
      ? await fetch(`/api/users/${user._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      : await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, password })
        })

    setSubmitting(false)

    if (!res.ok) {
      const err = await res.json()
      if (err.errors?.length) {
        toast.error(err.errors[0].message)
      } else {
        toast.error(err.error ?? 'Failed to save user')
      }
      return
    }

    toast.success(user ? `${name} updated` : `${name} created`)
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <h2 className="text-base font-semibold text-slate-100">
            {user ? 'Edit User' : 'Add User'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Full Name *</label>
            <input
              className="input-base"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Ahmed Hossain"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Phone *</label>
            <input
              className={`input-base ${phoneError ? 'border-rose-500' : ''}`}
              value={phone}
              onChange={(e) => { setPhone(e.target.value); validatePhone(e.target.value) }}
              onBlur={() => validatePhone(phone)}
              required
              placeholder="01XXXXXXXXX"
              maxLength={11}
            />
            {phoneError && <p className="text-rose-400 text-xs mt-1">{phoneError}</p>}
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">
              Password {user && <span className="text-slate-600">(leave blank to keep current)</span>}
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                className="input-base pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!user}
                placeholder={user ? 'Leave blank to keep current' : 'Set a password'}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Role *</label>
            <select
              className="input-base"
              value={role}
              onChange={(e) => {
                const newRole = e.target.value as Role
                setRole(newRole)
                setSelectedBranches(defaultBranchesFor(newRole))
              }}
            >
              {availableRoles.map((r) => (
                <option key={r} value={r}>
                  {r === 'SUPER_ADMIN' ? 'Super Admin' : r === 'BRANCH_ADMIN' ? 'Admin' : 'Manager'}
                </option>
              ))}
            </select>
          </div>

          {role !== 'SUPER_ADMIN' && needsBranchPicker && (
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                {role === 'MANAGER' ? 'Branch *' : 'Assigned Branches *'}
                <span className="text-slate-600 ml-1">(required)</span>
              </label>
              {branches.length === 0 ? (
                <p className="text-xs text-rose-400 italic">No branches created yet. Create a branch first.</p>
              ) : role === 'MANAGER' ? (
                <>
                  <select
                    className={`input-base ${selectedBranches.length === 0 ? 'border-rose-500' : ''}`}
                    value={selectedBranches[0] ?? ''}
                    onChange={(e) => setSelectedBranches(e.target.value ? [e.target.value] : [])}
                  >
                    <option value="">Select a branch…</option>
                    {branches.map((b) => (
                      <option key={b._id} value={b._id}>{b.name}</option>
                    ))}
                  </select>
                  {selectedBranches.length === 0 && (
                    <p className="text-rose-400 text-xs mt-1">Select a branch</p>
                  )}
                </>
              ) : (
                <>
                  <div className={`space-y-1.5 max-h-40 overflow-y-auto border rounded-lg p-2 bg-slate-800/30 ${
                    selectedBranches.length === 0 ? 'border-rose-500' : 'border-slate-700'
                  }`}>
                    {branches.map((b) => (
                      <label key={b._id} className="flex items-center gap-2 cursor-pointer py-0.5">
                        <input
                          type="checkbox"
                          checked={selectedBranches.includes(b._id)}
                          onChange={() => toggleBranch(b._id)}
                          className="accent-blue-500"
                        />
                        <span className="text-sm text-slate-300">{b.name}</span>
                      </label>
                    ))}
                  </div>
                  {selectedBranches.length === 0 && (
                    <p className="text-rose-400 text-xs mt-1">Select at least one branch</p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !!phoneError || (role !== 'SUPER_ADMIN' && selectedBranches.length === 0)}
              className="btn-primary flex-1"
            >
              {submitting ? 'Saving…' : user ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
