import { useState, useEffect, useRef } from 'react'
import type { WorkoutSet } from '../db'
import { useSwipeAction } from '../lib/useSwipeAction'
import { haptic } from '../lib/haptic'
import { AnimatedCheck } from './AnimatedCheck'

interface Props {
  idx: number
  current?: WorkoutSet
  lastSet?: WorkoutSet         // previous-session reference at same setIndex
  prescription?: { reps?: number; weight?: number; repsText?: string }
  units: 'imperial' | 'metric'
  isActive?: boolean           // is this the next set to log? (UI highlight)
  onSet: (values: { weight: number; reps: number }, completed: boolean) => Promise<{ isPr: boolean }> | void
  onDelete?: () => void
  onComplete?: () => void      // hook for auto-focus on next set
}

// Fitbod-style row:
//   SET | PREVIOUS | LB | REPS | ✓
// All inline editable. PREVIOUS is tappable to copy. Quick +5/-5 chips on weight focus.
export function SetRow({ idx, current, lastSet, prescription, units, isActive, onSet, onDelete, onComplete }: Props) {
  const completed = current?.completed === 1
  const isPr = current?.isPr === 1
  const [weight, setWeight] = useState(String(current?.weight ?? ''))
  const [reps, setReps] = useState(String(current?.reps ?? ''))
  const [focused, setFocused] = useState<'weight' | 'reps' | null>(null)
  const [flash, setFlash] = useState(false)
  const weightRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setWeight(String(current?.weight ?? '')) }, [current?.weight])
  useEffect(() => { setReps(String(current?.reps ?? '')) }, [current?.reps])

  // Auto-focus weight input when this row becomes the active one
  useEffect(() => {
    if (isActive && !completed && !weight && !reps) {
      weightRef.current?.focus()
    }
  }, [isActive])

  const swipe = useSwipeAction({
    onLeft: () => { if (onDelete) { haptic('tap'); onDelete() } },
  })

  const wn = Number(weight) || 0
  const rn = Number(reps) || 0
  const step = units === 'metric' ? 2.5 : 5
  const unitLabel = units === 'metric' ? 'kg' : 'lb'

  async function persist(values: { weight: number; reps: number }, complete: boolean) {
    const res = await onSet(values, complete)
    if (res && res.isPr) {
      setFlash(true)
      setTimeout(() => setFlash(false), 720)
    }
  }

  async function toggleComplete() {
    if (completed) {
      await persist({ weight: wn, reps: rn }, false)
      return
    }
    // Fill missing values from prescription/last set on complete
    const useW = wn || lastSet?.weight || prescription?.weight || 0
    const useR = rn || lastSet?.reps || prescription?.reps || 0
    if (useW <= 0 && useR <= 0) return
    if (wn === 0 && useW > 0) setWeight(String(useW))
    if (rn === 0 && useR > 0) setReps(String(useR))
    await persist({ weight: useW, reps: useR }, true)
    haptic('success')
    onComplete?.()
  }

  function fillFromPrevious() {
    if (completed) return
    if (lastSet?.weight) setWeight(String(lastSet.weight))
    if (lastSet?.reps) setReps(String(lastSet.reps))
    haptic('tap')
    persist({ weight: lastSet?.weight ?? wn, reps: lastSet?.reps ?? rn }, false)
  }

  function bumpWeight(d: number) {
    const base = wn || lastSet?.weight || prescription?.weight || 0
    const next = Math.max(0, base + d)
    setWeight(String(next))
    persist({ weight: next, reps: rn }, completed)
    haptic('tap')
  }

  const previousLabel = lastSet
    ? `${lastSet.weight || '—'}${lastSet.weight ? ` × ${lastSet.reps}` : ''}`
    : prescription?.weight
      ? `${prescription.weight} × ${prescription.reps ?? '?'}`
      : '—'

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Red delete tile revealed on swipe-left */}
      {onDelete && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-end pr-4 text-white text-xs font-bold uppercase tracking-wider"
          style={{ background: 'var(--color-accent)', width: Math.max(0, -swipe.dx) }}
        >
          {swipe.dx <= -60 ? 'Release' : null}
        </div>
      )}
      <div
        {...(onDelete ? swipe.bind : {})}
        style={{
          transform: swipe.dx < 0 ? `translateX(${swipe.dx}px)` : undefined,
          transition: swipe.active ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className={`relative px-1 py-1.5 ${completed ? 'opacity-65' : ''} ${isActive && !completed ? 'bg-[var(--color-accent-soft)]/30' : ''} ${flash ? 'animate-pr-flash' : ''} rounded-xl`}
      >
        <div className="grid items-center gap-2" style={{ gridTemplateColumns: '28px 78px 1fr 1fr 44px' }}>
          {/* Set number */}
          <div className={`text-center text-sm font-bold tabnum ${completed ? 'text-[var(--color-text-dim)]' : 'text-[var(--color-text)]'}`}>
            {isPr && <div className="text-[8px] text-[var(--color-accent)] font-black leading-none">PR</div>}
            <span className="leading-none">{idx}</span>
          </div>

          {/* PREVIOUS — tappable to copy */}
          <button
            onClick={fillFromPrevious}
            className="text-[11px] text-[var(--color-text-faint)] tabnum text-left truncate px-1 py-1 rounded active:bg-[var(--color-surface-2)]"
            aria-label="Use previous values"
          >
            {previousLabel}
          </button>

          {/* WEIGHT */}
          <input
            ref={weightRef}
            type="number"
            inputMode="decimal"
            value={weight}
            onFocus={() => setFocused('weight')}
            onBlur={() => { setFocused(null); persist({ weight: wn, reps: rn }, completed) }}
            onChange={(e) => setWeight(e.target.value)}
            placeholder={String(lastSet?.weight ?? prescription?.weight ?? unitLabel)}
            className={`bg-[var(--color-surface-2)] border rounded-lg px-2 py-2.5 tabnum text-center display-num focus:border-[var(--color-accent)] placeholder:text-[var(--color-text-faint)]/40 outline-none ${
              completed ? 'border-[var(--color-border)] text-[var(--color-text-dim)]' : 'border-[var(--color-border)]'
            }`}
            style={{ fontSize: 17 }}
          />

          {/* REPS */}
          <input
            type="number"
            inputMode="numeric"
            value={reps}
            onFocus={() => setFocused('reps')}
            onBlur={() => { setFocused(null); persist({ weight: wn, reps: rn }, completed) }}
            onChange={(e) => setReps(e.target.value)}
            placeholder={String(lastSet?.reps ?? prescription?.reps ?? 'reps')}
            className={`bg-[var(--color-surface-2)] border rounded-lg px-2 py-2.5 tabnum text-center display-num focus:border-[var(--color-accent)] placeholder:text-[var(--color-text-faint)]/40 outline-none ${
              completed ? 'border-[var(--color-border)] text-[var(--color-text-dim)]' : 'border-[var(--color-border)]'
            }`}
            style={{ fontSize: 17 }}
          />

          {/* CHECK */}
          <button
            onClick={toggleComplete}
            className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
              completed
                ? 'bg-[var(--color-accent)] text-white shadow-[0_4px_12px_-4px_var(--color-accent)]'
                : 'bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-dim)]'
            }`}
            aria-label={completed ? 'Mark incomplete' : 'Complete set'}
          >
            <AnimatedCheck checked={completed} size={18} strokeWidth={3} />
          </button>
        </div>

        {/* Quick +/- chips on weight focus */}
        {focused === 'weight' && !completed && (
          <div className="mt-1.5 flex gap-1.5 justify-end pr-12 animate-fade-in">
            {[-step, +step, +step * 2].map((delta) => (
              <button
                key={delta}
                onMouseDown={(e) => { e.preventDefault(); bumpWeight(delta) }}
                onTouchStart={(e) => { e.preventDefault(); bumpWeight(delta) }}
                className="px-2.5 py-1 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[10px] font-bold text-[var(--color-text-dim)] active:scale-90 transition-transform"
              >{delta > 0 ? '+' : ''}{delta}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
