import { useEffect, useState } from 'react'
import { toast, type ToastRecord, type ToastVariant } from '../lib/toast'

interface Active extends ToastRecord {
  state: 'in' | 'out'
}

const DEFAULT_MS = 2400

export function Toaster() {
  const [items, setItems] = useState<Active[]>([])

  useEffect(() => {
    const unsub = toast.subscribe((rec) => {
      setItems((prev) => [...prev, { ...rec, state: 'in' }])
      const dur = rec.durationMs ?? DEFAULT_MS
      setTimeout(() => {
        setItems((prev) => prev.map((it) => (it.id === rec.id ? { ...it, state: 'out' } : it)))
      }, dur)
      setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.id !== rec.id))
      }, dur + 280)
    })
    return unsub
  }, [])

  if (items.length === 0) return null

  return (
    <div
      className="fixed left-0 right-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
    >
      {items.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  )
}

const VARIANT_BAR: Record<ToastVariant, string> = {
  default: 'var(--color-text-faint)',
  success: 'var(--color-good)',
  accent: 'var(--color-accent)',
  error: 'var(--color-danger)',
}

function ToastItem({ t }: { t: Active }) {
  const bar = VARIANT_BAR[t.variant ?? 'default']
  return (
    <div
      className={`pointer-events-auto glass rounded-2xl shadow-[0_12px_40px_-12px_rgba(0,0,0,0.7)] flex items-stretch overflow-hidden ${
        t.state === 'in' ? 'animate-toast-in' : 'animate-toast-out'
      }`}
      style={{ minWidth: 220, maxWidth: '92vw' }}
    >
      <div className="w-1" style={{ background: bar }} />
      <div className="px-4 py-3 min-w-0">
        <div className="font-bold text-sm tracking-tight">{t.title}</div>
        {t.detail && (
          <div className="text-xs text-[var(--color-text-dim)] mt-0.5 truncate">{t.detail}</div>
        )}
      </div>
    </div>
  )
}
