import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  durationMs?: number
  format?: (n: number) => string
  className?: string
  style?: React.CSSProperties
}

// Tweens a numeric value over time using rAF. Defaults to no-op when value is
// the same as before (avoids flicker on initial render).
export function Ticker({ value, durationMs = 600, format, className, style }: Props) {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (value === shown) return
    const from = fromRef.current
    const to = value
    startRef.current = performance.now()

    function step(t: number) {
      const elapsed = t - (startRef.current ?? t)
      const p = Math.min(1, elapsed / durationMs)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3)
      const cur = from + (to - from) * eased
      setShown(cur)
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        fromRef.current = to
        setShown(to)
      }
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs])

  const display = format ? format(shown) : Math.round(shown).toLocaleString()
  return <span className={className} style={style}>{display}</span>
}
