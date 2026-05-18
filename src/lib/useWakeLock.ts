import { useEffect, useRef } from 'react'

interface WakeLockSentinelLike {
  released: boolean
  release(): Promise<void>
  addEventListener?(type: 'release', listener: () => void): void
}

// Keep the screen on while active. iOS Safari 16.4+ supports navigator.wakeLock.
// Re-acquires on visibilitychange (iOS drops the lock when backgrounded).
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    if (!active) return
    if (typeof navigator === 'undefined') return
    const wl = (navigator as unknown as { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock
    if (!wl) return

    let cancelled = false

    async function acquire() {
      try {
        const s = await wl!.request('screen')
        if (cancelled) {
          s.release().catch(() => {})
          return
        }
        sentinelRef.current = s
      } catch { /* user denied or unsupported */ }
    }

    function onVis() {
      if (document.visibilityState === 'visible' && active) {
        if (!sentinelRef.current || sentinelRef.current.released) {
          acquire()
        }
      }
    }

    acquire()
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      sentinelRef.current?.release().catch(() => {})
      sentinelRef.current = null
    }
  }, [active])
}
