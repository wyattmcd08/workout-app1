import { useEffect, useRef, useState } from 'react'

// Simple stopwatch hook. Starts paused. Returns elapsed seconds.
export function useStopwatch(running: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)
  const baseRef = useRef(0)

  useEffect(() => {
    if (!running) {
      if (startRef.current != null) {
        baseRef.current += (Date.now() - startRef.current) / 1000
        startRef.current = null
      }
      return
    }
    startRef.current = Date.now()
    const i = setInterval(() => {
      if (startRef.current != null) {
        setElapsed(baseRef.current + (Date.now() - startRef.current) / 1000)
      }
    }, 100)
    return () => {
      clearInterval(i)
      if (startRef.current != null) {
        baseRef.current += (Date.now() - startRef.current) / 1000
        startRef.current = null
      }
    }
  }, [running])

  return elapsed
}

// Countdown timer. Returns seconds remaining and an `expired` flag.
export function useCountdown(totalSec: number, running: boolean): { remaining: number; expired: boolean } {
  const [remaining, setRemaining] = useState(totalSec)
  const startRef = useRef<number | null>(null)
  const baseRef = useRef(totalSec)

  // Reset when totalSec changes
  useEffect(() => {
    baseRef.current = totalSec
    setRemaining(totalSec)
    startRef.current = null
  }, [totalSec])

  useEffect(() => {
    if (!running) {
      if (startRef.current != null) {
        baseRef.current = Math.max(0, baseRef.current - (Date.now() - startRef.current) / 1000)
        startRef.current = null
      }
      return
    }
    startRef.current = Date.now()
    const i = setInterval(() => {
      if (startRef.current != null) {
        const r = Math.max(0, baseRef.current - (Date.now() - startRef.current) / 1000)
        setRemaining(r)
      }
    }, 100)
    return () => {
      clearInterval(i)
      if (startRef.current != null) {
        baseRef.current = Math.max(0, baseRef.current - (Date.now() - startRef.current) / 1000)
        startRef.current = null
      }
    }
  }, [running])

  return { remaining, expired: remaining <= 0 }
}

export function formatMMSS(sec: number): string {
  const total = Math.max(0, Math.floor(sec))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
