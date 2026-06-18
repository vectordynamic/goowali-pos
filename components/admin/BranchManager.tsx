'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Plus, Pencil, X, MapPin, Phone, GitBranch, RefreshCw, PowerOff } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'

interface Branch {
  _id: string
  name: string
  address?: string
  contactPhone?: string
  isActive: boolean
  createdAt: string
}

export default function BranchManager() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'create' | Branch>(null)
  const [toggleTarget, setToggleTarget] = useState<Branch | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/branches')
      .then((r) => r.json())
      .then((data) => setBranches(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Failed to load branches'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleToggleActive(branch: Branch) {
    const loadingToast = toast.loading(
      branch.isActive ? `Deactivating ${branch.name}…` : `Activating ${branch.name}…`
    )
    const res = await fetch(`/api/branches/${branch._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !branch.isActive })
    })
    toast.dismiss(loadingToast)

    if (res.ok) {
      toast.success(
        branch.isActive ? `${branch.name} deactivated` : `${branch.name} activated`
      )
      setToggleTarget(null)
      load()
    } else {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to update branch')
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{branches.length} branches</span>
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
          New Branch
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12 text-sm">Loading branches…</div>
      ) : branches.length === 0 ? (
        <div className="text-center py-16">
          <GitBranch className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No branches yet</p>
          <p className="text-slate-600 text-sm mt-1">Create your first branch to get started</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map((branch) => (
            <div key={branch._id} className="card p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-violet-900/30 flex items-center justify-center">
                  <GitBranch className="w-4 h-4 text-violet-400" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={branch.isActive ? 'badge-success' : 'badge-danger'}>
                    {branch.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => setModal(branch)}
                    className="p-1.5 text-slate-500 hover:text-slate-100 hover:bg-slate-700 rounded transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setToggleTarget(branch)}
                    className={`p-1.5 rounded transition-colors ${
                      branch.isActive
                        ? 'text-slate-500 hover:text-rose-400 hover:bg-rose-900/20'
                        : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20'
                    }`}
                    title={branch.isActive ? 'Deactivate' : 'Activate'}
                  >
                    <PowerOff className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <h3 className="text-sm font-bold text-slate-100 mb-1.5">{branch.name}</h3>

              {branch.address && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{branch.address}</span>
                </div>
              )}
              {branch.contactPhone && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Phone className="w-3 h-3 flex-shrink-0" />
                  {branch.contactPhone}
                </div>
              )}

              <p className="text-xs text-slate-700 mt-3 font-mono truncate">{branch._id}</p>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <BranchModal
          branch={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load() }}
        />
      )}

      {toggleTarget && (
        <ConfirmModal
          title={toggleTarget.isActive ? 'Deactivate branch?' : 'Activate branch?'}
          message={
            toggleTarget.isActive
              ? `${toggleTarget.name} will be deactivated. Managers assigned to it won't be able to use the POS.`
              : `${toggleTarget.name} will be reactivated.`
          }
          confirmLabel={toggleTarget.isActive ? 'Deactivate' : 'Activate'}
          danger={toggleTarget.isActive}
          onConfirm={() => handleToggleActive(toggleTarget)}
          onCancel={() => setToggleTarget(null)}
        />
      )}
    </div>
  )
}

function BranchModal({
  branch,
  onClose,
  onSave
}: {
  branch: Branch | null
  onClose: () => void
  onSave: () => void
}) {
  const [name, setName] = useState(branch?.name ?? '')
  const [address, setAddress] = useState(branch?.address ?? '')
  const [phone, setPhone] = useState(branch?.contactPhone ?? '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const payload = { name, address, contactPhone: phone }
    const res = branch
      ? await fetch(`/api/branches/${branch._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      : await fetch('/api/branches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

    setSubmitting(false)

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to save branch')
      return
    }

    toast.success(branch ? `${name} updated` : `${name} created`)
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">
            {branch ? 'Edit Branch' : 'New Branch'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Branch Name *</label>
            <input
              className="input-base"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Mirpur Branch"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Address</label>
            <input
              className="input-base"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 12/A Mirpur Road, Dhaka"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Contact Phone</label>
            <input
              className="input-base"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
            />
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">
              {submitting ? 'Saving…' : branch ? 'Update Branch' : 'Create Branch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
