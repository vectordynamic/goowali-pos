'use client'

import { AlertTriangle, X } from 'lucide-react'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  danger = true
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm">
        <div className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
              danger ? 'bg-rose-900/50' : 'bg-amber-900/50'
            }`}>
              <AlertTriangle className={`w-4 h-4 ${danger ? 'text-rose-400' : 'text-amber-400'}`} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
              <p className="text-sm text-slate-400 mt-1">{message}</p>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={onCancel} className="btn-secondary px-4 py-1.5 text-xs">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                danger
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-amber-600 hover:bg-amber-500 text-white'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
