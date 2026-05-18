import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  open: boolean
  title?: ReactNode
  onClose: () => void
  children: ReactNode
  fullHeight?: boolean
}

const DRAG_THRESHOLD = 90      // pixels to dismiss
const VELOCITY_THRESHOLD = 0.6 // px/ms — quick flick dismisses earlier

export function Sheet({ open, title, onClose, children, fullHeight }: Props) {
  const [dragY, setDragY] = useState(0)
  const startY = useRef<number | null>(null)
  const startT = useRef<number | null>(null)
  const dragging = useRef(false)
  const lastY = useRef(0)
  const lastT = useRef(0)

  useEffect(() => {
    if (!open) {
      setDragY(0)
      return
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY
    startT.current = performance.now()
    lastY.current = startY.current
    lastT.current = startT.current
    dragging.current = true
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current || startY.current == null) return
    const y = e.touches[0].clientY
    const dy = y - startY.current
    if (dy < 0) {
      setDragY(0) // don't allow drag-up past origin
    } else {
      setDragY(dy)
    }
    lastY.current = y
    lastT.current = performance.now()
  }

  function onTouchEnd() {
    if (!dragging.current || startY.current == null || startT.current == null) return
    dragging.current = false
    const totalDy = lastY.current - startY.current
    const totalDt = Math.max(1, lastT.current - startT.current)
    const velocity = totalDy / totalDt // px per ms
    if (totalDy > DRAG_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      onClose()
    } else {
      setDragY(0)
    }
    startY.current = null
    startT.current = null
  }

  if (!open) return null

  const sheetStyle: React.CSSProperties = {
    paddingBottom: 'env(safe-area-inset-bottom)',
    transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
    transition: dragging.current ? 'none' : 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-fade-in" onClick={onClose}>
      <div
        className="absolute inset-0 bg-black/60 transition-opacity"
        style={{ opacity: 1 - Math.min(0.7, dragY / 400) }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative mt-auto bg-[var(--color-surface)] rounded-t-3xl border-t border-[var(--color-border)] animate-sheet-up flex flex-col ${
          fullHeight ? 'h-[92dvh]' : 'max-h-[92dvh]'
        }`}
        style={sheetStyle}
      >
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          className="pt-3 pb-1 px-4 cursor-grab active:cursor-grabbing"
        >
          <div className="mx-auto h-1.5 w-12 rounded-full bg-[var(--color-surface-3)]" />
        </div>
        {title && (
          <header className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)]">
            <h2 className="text-lg font-bold tracking-tight">{title}</h2>
            <button
              onClick={onClose}
              className="text-[var(--color-text-dim)] px-2 -mr-2 text-sm font-semibold"
            >Close</button>
          </header>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
