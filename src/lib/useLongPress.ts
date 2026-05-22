import { useRef, useCallback } from 'react'

interface Options {
  onLongPress: () => void
  onClick?: () => void
  ms?: number
  movementThreshold?: number  // px — finger moved more than this cancels long-press
}

interface Bind {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
  onTouchCancel: (e: React.TouchEvent) => void
  onMouseDown: (e: React.MouseEvent) => void
  onMouseUp: (e: React.MouseEvent) => void
  onMouseLeave: (e: React.MouseEvent) => void
}

// Long-press hook. Fires onLongPress after `ms` of sustained touch.
// Cancels if the finger moves more than `movementThreshold`.
// Falls through to onClick (if provided) when a short tap is detected.
export function useLongPress({ onLongPress, onClick, ms = 500, movementThreshold = 10 }: Options): Bind {
  const timer = useRef<number | null>(null)
  const fired = useRef(false)
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)

  const start = useCallback((x: number, y: number) => {
    fired.current = false
    startX.current = x
    startY.current = y
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      fired.current = true
      onLongPress()
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(12)
    }, ms)
  }, [onLongPress, ms])

  const clear = useCallback(() => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null }
  }, [])

  const move = useCallback((x: number, y: number) => {
    if (startX.current == null || startY.current == null) return
    const dx = Math.abs(x - startX.current)
    const dy = Math.abs(y - startY.current)
    if (dx > movementThreshold || dy > movementThreshold) clear()
  }, [movementThreshold, clear])

  const end = useCallback(() => {
    clear()
    if (!fired.current && onClick) onClick()
    startX.current = null
    startY.current = null
  }, [clear, onClick])

  return {
    onTouchStart: (e) => start(e.touches[0].clientX, e.touches[0].clientY),
    onTouchMove: (e) => move(e.touches[0].clientX, e.touches[0].clientY),
    onTouchEnd: end,
    onTouchCancel: () => { clear(); startX.current = null; startY.current = null },
    onMouseDown: (e) => start(e.clientX, e.clientY),
    onMouseUp: end,
    onMouseLeave: () => { clear(); startX.current = null; startY.current = null },
  }
}
