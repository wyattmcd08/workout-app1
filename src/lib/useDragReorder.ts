import { useRef, useState, useCallback } from 'react'

interface Args<T> {
  items: T[]
  getId: (item: T) => string
  onCommit: (newOrder: T[]) => void | Promise<void>
}

interface ReorderApi<T> {
  draggingId: string | null
  dragY: number
  displayed: T[]                   // current display order while dragging
  bindHandle: (id: string) => {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchMove: (e: React.TouchEvent) => void
    onTouchEnd: (e: React.TouchEvent) => void
    onTouchCancel: (e: React.TouchEvent) => void
  }
  registerEl: (id: string, el: HTMLElement | null) => void
}

// Touch-driven drag-to-reorder for a list. Caller maintains a stable
// `items` array (e.g. from props), provides an id extractor, and gets back a
// `displayed` array that reflects the live drag order. On release, the new
// order is handed to `onCommit` for persistence.
//
// Visual responsibility:
//   - Render `displayed` instead of `items`.
//   - For each item, apply a vertical translate of `dragY` to the one whose
//     id === draggingId; this makes the dragging card follow the finger.
//   - Pass `bindHandle(id)` to the drag-handle element of each card.
//   - Pass `registerEl(id, el)` to the outer card element (for measuring).
export function useDragReorder<T>({ items, getId, onCommit }: Args<T>): ReorderApi<T> {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragY, setDragY] = useState(0)
  const [localOrder, setLocalOrder] = useState<T[] | null>(null)

  const startY = useRef(0)
  const els = useRef<Record<string, HTMLElement | null>>({})

  const registerEl = useCallback((id: string, el: HTMLElement | null) => {
    els.current[id] = el
  }, [])

  const bindHandle = useCallback((id: string) => ({
    onTouchStart: (e: React.TouchEvent) => {
      startY.current = e.touches[0].clientY
      // Snapshot items as our working order for this drag.
      setLocalOrder(items.slice())
      setDraggingId(id)
      setDragY(0)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(8)
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (!draggingId) return
      e.preventDefault?.()
      const y = e.touches[0].clientY
      const dy = y - startY.current
      setDragY(dy)

      // Decide if we should swap with a neighbor.
      const order = localOrder ?? items
      const myIdx = order.findIndex((it) => getId(it) === draggingId)
      if (myIdx < 0) return

      const myEl = els.current[draggingId]
      if (!myEl) return
      const myRect = myEl.getBoundingClientRect()
      const myCenter = myRect.top + myRect.height / 2 + dy

      // Find first neighbor whose midpoint we've crossed
      for (let i = 0; i < order.length; i++) {
        if (i === myIdx) continue
        const otherId = getId(order[i])
        const el = els.current[otherId]
        if (!el) continue
        const r = el.getBoundingClientRect()
        const center = r.top + r.height / 2
        const crossedUp = i < myIdx && myCenter < center
        const crossedDown = i > myIdx && myCenter > center
        if (crossedUp || crossedDown) {
          const next = order.slice()
          const [taken] = next.splice(myIdx, 1)
          next.splice(i, 0, taken)
          setLocalOrder(next)
          // After swap, the dragging card occupies a new slot; reset baseline so
          // the visual offset starts from the new position.
          startY.current = y
          setDragY(0)
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(4)
          break
        }
      }
    },
    onTouchEnd: () => {
      if (!draggingId) return
      const finalOrder = localOrder ?? items
      // Only persist if the order actually changed
      const same = finalOrder.length === items.length &&
        finalOrder.every((it, i) => getId(it) === getId(items[i]))
      if (!same) {
        Promise.resolve(onCommit(finalOrder)).catch(() => {})
      }
      setDraggingId(null)
      setDragY(0)
      setLocalOrder(null)
    },
    onTouchCancel: () => {
      setDraggingId(null)
      setDragY(0)
      setLocalOrder(null)
    },
  }), [items, getId, onCommit, draggingId, localOrder])

  const displayed = localOrder ?? items

  return { draggingId, dragY, displayed, bindHandle, registerEl }
}
