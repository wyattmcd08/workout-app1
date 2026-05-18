import { useRef, useState, useCallback, useEffect } from 'react'

interface Options {
  threshold?: number
  resistance?: number
  onRefresh: () => Promise<void> | void
}

interface Result {
  pull: number          // pixels pulled (already with resistance applied)
  ratio: number         // 0..1 toward threshold
  refreshing: boolean
}

// Touch-based pull-to-refresh. Returns current pull state — caller renders
// the spinner / decoration however it likes. Only activates when the scroll
// container is at the top.
export function usePullToRefresh({ threshold = 80, resistance = 2.5, onRefresh }: Options): Result {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const activeRef = useRef(false)

  const onStart = useCallback((e: TouchEvent) => {
    if (refreshing) return
    if (window.scrollY > 0) return
    startY.current = e.touches[0].clientY
    activeRef.current = true
  }, [refreshing])

  const onMove = useCallback((e: TouchEvent) => {
    if (!activeRef.current || startY.current == null) return
    const dy = e.touches[0].clientY - startY.current
    if (dy <= 0) { setPull(0); return }
    setPull(dy / resistance)
  }, [resistance])

  const onEnd = useCallback(async () => {
    if (!activeRef.current) return
    activeRef.current = false
    const distance = pull
    setPull(0)
    startY.current = null
    if (distance >= threshold) {
      setRefreshing(true)
      try { await onRefresh() } finally { setRefreshing(false) }
    }
  }, [pull, threshold, onRefresh])

  useEffect(() => {
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [onStart, onMove, onEnd])

  return { pull, ratio: Math.min(1, pull / threshold), refreshing }
}
