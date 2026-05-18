import { useRef, useState, useCallback } from 'react'

interface Options {
  onLeft?: () => void
  onRight?: () => void
  threshold?: number
}

interface Result {
  dx: number
  active: boolean
  bind: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchMove: (e: React.TouchEvent) => void
    onTouchEnd: (e: React.TouchEvent) => void
    onTouchCancel: (e: React.TouchEvent) => void
  }
}

// Horizontal swipe gesture for rows. Used for swipe-to-delete:
// onLeft fires when the user swipes the row left past `threshold` px.
export function useSwipeAction({ onLeft, onRight, threshold = 80 }: Options): Result {
  const [dx, setDx] = useState(0)
  const [active, setActive] = useState(false)
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const locked = useRef<'h' | 'v' | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    locked.current = null
    setActive(true)
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (startX.current == null || startY.current == null) return
    const ddx = e.touches[0].clientX - startX.current
    const ddy = e.touches[0].clientY - startY.current
    if (locked.current == null) {
      if (Math.abs(ddx) > 8 || Math.abs(ddy) > 8) {
        locked.current = Math.abs(ddx) > Math.abs(ddy) ? 'h' : 'v'
      }
    }
    if (locked.current === 'h') {
      setDx(ddx)
    } else if (locked.current === 'v') {
      setDx(0)
    }
  }, [])

  const onTouchEnd = useCallback(() => {
    if (locked.current === 'h') {
      if (dx <= -threshold && onLeft) onLeft()
      else if (dx >= threshold && onRight) onRight()
    }
    setDx(0)
    setActive(false)
    startX.current = null
    startY.current = null
    locked.current = null
  }, [dx, threshold, onLeft, onRight])

  return {
    dx,
    active,
    bind: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
  }
}
