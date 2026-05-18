import { useEffect, type ReactNode } from 'react'

interface Props {
  open: boolean
  title?: ReactNode
  onClose: () => void
  children: ReactNode
  fullHeight?: boolean
}

export function Sheet({ open, title, onClose, children, fullHeight }: Props) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative mt-auto bg-[var(--color-surface)] rounded-t-3xl border-t border-[var(--color-border)] animate-slide-up flex flex-col ${
          fullHeight ? 'h-[92dvh]' : 'max-h-[92dvh]'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto mt-2 mb-1 h-1.5 w-10 rounded-full bg-[var(--color-surface-3)]" />
        {title && (
          <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              onClick={onClose}
              className="text-[var(--color-text-dim)] px-2 -mr-2 text-sm"
            >Close</button>
          </header>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
