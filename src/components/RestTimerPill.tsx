import { useState, useEffect, useRef } from 'react'
import { haptic } from '../lib/haptic'
import { sound } from '../lib/sound'
import { getSettings } from '../db'

interface Props {
  initialSec: number
  onClose: () => void
}

// Floating rest-timer pill. Auto-counts down, vibrates + dings on zero,
// then switches to a count-up so you know how long you've actually rested.
// Tap +30 / -10 / Skip to adjust.
export function RestTimerPill({ initialSec, onClose }: Props) {
  const [remaining, setRemaining] = useState(initialSec)
  const [overshoot, setOvershoot] = useState(0)
  const [paused, setPaused] = useState(false)
  const chimedRef = useRef(false)

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      setRemaining((s) => {
        const next = s - 1
        if (next === 0 && !chimedRef.current) {
          chimedRef.current = true
          haptic('chime')
          getSettings().then((cfg) => { if (cfg.soundOn) sound.ding() }).catch(() => {})
        }
        if (next < 0) setOvershoot((o) => o + 1)
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [paused])

  const countingUp = remaining <= 0
  const display = countingUp ? overshoot : Math.max(0, remaining)
  const m = Math.floor(display / 60)
  const s = display % 60
  const isWarning = remaining > 0 && remaining <= 5

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40 animate-pop-in"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 152px)' }}
    >
      <div className="glass rounded-full pl-2 pr-1 py-1 flex items-center gap-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.85)] border border-[var(--color-border-strong)]">
        <button
          onClick={() => { setRemaining((s) => Math.max(0, s - 10)); haptic('tap') }}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-dim)] text-xs font-bold active:bg-[var(--color-surface-2)]"
          aria-label="Subtract 10 seconds"
        >−10</button>

        <button
          onClick={() => { setPaused((p) => !p); haptic('tap') }}
          className="px-3 flex items-center gap-2 min-w-[110px] justify-center active:bg-[var(--color-surface-2)] rounded-full py-1"
          aria-label={paused ? 'Resume rest timer' : 'Pause rest timer'}
        >
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
            {paused ? 'Paused' : countingUp ? 'Rested' : 'Rest'}
          </span>
          <span className={`display-num tabnum ${isWarning && !paused ? 'text-[var(--color-accent)] animate-pulse' : paused ? 'text-[var(--color-text-dim)]' : ''}`} style={{ fontSize: 18 }}>
            {m}:{String(s).padStart(2, '0')}
          </span>
        </button>

        <button
          onClick={() => { setRemaining((s) => s + 30); haptic('tap'); chimedRef.current = false }}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-dim)] text-xs font-bold active:bg-[var(--color-surface-2)]"
          aria-label="Add 30 seconds"
        >+30</button>

        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-faint)] active:bg-[var(--color-surface-2)]"
          aria-label="Skip rest"
        >×</button>
      </div>
    </div>
  )
}
