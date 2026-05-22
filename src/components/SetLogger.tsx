import { useState, useEffect } from 'react'
import type { Exercise, BlockExercise, WorkoutSet, ExerciseMetric } from '../db'
import { estimated1RM } from '../lib/format'
import { useSwipeAction } from '../lib/useSwipeAction'
import { haptic } from '../lib/haptic'
import { AnimatedCheck } from './AnimatedCheck'

export interface SetLoggerProps {
  idx: number
  exercise: Exercise
  blockExercise?: BlockExercise
  lastSet?: WorkoutSet              // for autofill placeholders
  current?: WorkoutSet              // existing logged set (if any)
  units: 'imperial' | 'metric'
  onSet: (values: SetValues, completed: boolean) => Promise<{ isPr: boolean }> | void
  onDelete?: () => void
}

export type SetValues = Partial<Record<ExerciseMetric, number>>

// Reads exercise.metrics to decide which input columns to render.
function activeMetrics(ex: Exercise): ExerciseMetric[] {
  return ex.metrics && ex.metrics.length > 0 ? ex.metrics : ['reps', 'weight']
}

const DEFAULT_STEPS: Record<ExerciseMetric, number> = {
  reps: 1,
  weight: 5,
  duration: 5,    // seconds — caller can override
  distance: 5,    // meters
  calories: 1,
  pace: 1,
}

export function SetLogger({ idx, exercise, blockExercise, lastSet, current, units, onSet, onDelete }: SetLoggerProps) {
  const metrics = activeMetrics(exercise)
  const isPr = current?.isPr === 1
  const completed = current?.completed === 1

  // Local input state, hydrated from current set (or empty)
  const [vals, setVals] = useState<SetValues>(() => extractValues(current))
  useEffect(() => { setVals(extractValues(current)) }, [current?.id])

  const [flash, setFlash] = useState(false)
  const weightStep = units === 'metric' ? 2.5 : 5

  function step(metric: ExerciseMetric): number {
    if (metric === 'weight') return weightStep
    return DEFAULT_STEPS[metric]
  }

  function placeholder(metric: ExerciseMetric): string {
    const fromLast = lastSet ? readMetric(lastSet, metric) : undefined
    if (fromLast != null && fromLast > 0) return formatMetric(metric, fromLast)
    const fromPrescription = blockExercise ? readPrescription(blockExercise, metric) : undefined
    if (fromPrescription != null && fromPrescription > 0) return formatMetric(metric, fromPrescription)
    return labelFor(metric).toLowerCase()
  }

  function bump(metric: ExerciseMetric, dir: -1 | 1) {
    const cur = vals[metric] ?? readMetric(lastSet, metric) ?? readPrescription(blockExercise, metric) ?? 0
    const next = Math.max(0, cur + dir * step(metric))
    const newVals = { ...vals, [metric]: next }
    setVals(newVals)
    haptic('tap')
    // Always persist — was previously only saving when set was completed,
    // which is why "+/-" felt broken on fresh sets.
    emit(newVals, completed)
  }

  function changeInput(metric: ExerciseMetric, raw: string) {
    const next: SetValues = { ...vals, [metric]: raw === '' ? undefined : Number(raw) }
    setVals(next)
  }

  async function emit(v: SetValues, mark: boolean): Promise<void> {
    const res = await onSet(v, mark)
    if (res && res.isPr) {
      setFlash(true)
      setTimeout(() => setFlash(false), 720)
    }
  }

  async function toggleComplete() {
    if (completed) {
      await emit(vals, false)
      return
    }
    // Fill missing values from last/prescription
    const filled: SetValues = { ...vals }
    for (const m of metrics) {
      if (filled[m] == null || filled[m] === 0) {
        filled[m] = readMetric(lastSet, m) ?? readPrescription(blockExercise, m) ?? 0
      }
    }
    setVals(filled)
    await emit(filled, true)
  }

  function autofill() {
    if (completed) return
    const filled: SetValues = { ...vals }
    for (const m of metrics) {
      filled[m] = readMetric(lastSet, m) ?? readPrescription(blockExercise, m) ?? filled[m]
    }
    setVals(filled)
    haptic('tap')
  }

  // Swipe-to-delete
  const swipe = useSwipeAction({
    onLeft: () => { if (onDelete) { haptic('tap'); onDelete() } },
  })

  // Live 1RM hint
  const showOneRm = metrics.includes('weight') && metrics.includes('reps') && (vals.weight ?? 0) > 0 && (vals.reps ?? 0) > 0
  const oneRm = showOneRm ? estimated1RM(vals.weight!, vals.reps!) : 0

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {onDelete && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-end pr-5 text-white font-bold text-sm"
          style={{ background: 'var(--color-accent)', width: Math.max(0, -swipe.dx) }}
        >
          {swipe.dx <= -60 ? 'Release to delete' : null}
        </div>
      )}
      <div
        {...(onDelete ? swipe.bind : {})}
        style={{
          transform: swipe.dx < 0 ? `translateX(${swipe.dx}px)` : undefined,
          transition: swipe.active ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className={`relative bg-[var(--color-surface)] ${flash ? 'animate-pr-flash' : ''}`}
      >
        {/* Visible × delete — always available, no swipe required */}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); haptic('tap'); onDelete() }}
            aria-label="Delete set"
            className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full bg-[var(--color-surface-2)]/80 border border-[var(--color-border)] text-[var(--color-text-faint)] flex items-center justify-center text-xs font-bold active:scale-90 transition-transform"
          >×</button>
        )}
        <div className={`grid gap-2 items-center p-2`} style={{ gridTemplateColumns: `36px ${metrics.map(() => '1fr').join(' ')} 56px` }}>
          {/* Set number badge — tap to autofill */}
          <button
            onClick={autofill}
            className={`w-9 h-9 rounded-full flex flex-col items-center justify-center font-bold tabnum text-sm border ${
              completed
                ? 'bg-[var(--color-accent-soft)] border-[var(--color-accent)]/40 text-[var(--color-text)]'
                : 'bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-dim)]'
            }`}
            aria-label="Set number — tap to autofill"
          >
            {isPr && <span className="text-[9px] leading-none text-[var(--color-accent)] font-black">PR</span>}
            <span className="leading-none">{idx}</span>
          </button>

          {metrics.map((m) => (
            <MetricCell
              key={m}
              metric={m}
              value={vals[m]}
              placeholder={placeholder(m)}
              units={units}
              onChange={(raw) => changeInput(m, raw)}
              onBlur={() => emit(vals, completed)}
              onMinus={() => bump(m, -1)}
              onPlus={() => bump(m, 1)}
            />
          ))}

          {/* Big check */}
          <button
            onClick={toggleComplete}
            className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 ${
              completed
                ? 'bg-[var(--color-accent)] text-white shadow-[0_6px_18px_-6px_var(--color-accent)]'
                : 'bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-dim)]'
            }`}
            aria-label="Toggle set completed"
          >
            <AnimatedCheck checked={completed} size={22} strokeWidth={3} />
          </button>
        </div>

        {oneRm > 0 && completed && (
          <div className="text-[10px] text-[var(--color-text-faint)] tabnum px-12 pb-2 -mt-1">
            ≈ {Math.round(oneRm)} 1RM
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCell({ metric, value, placeholder, units, onChange, onBlur, onMinus, onPlus }: {
  metric: ExerciseMetric
  value: number | undefined
  placeholder: string
  units: 'imperial' | 'metric'
  onChange: (raw: string) => void
  onBlur: () => void
  onMinus: () => void
  onPlus: () => void
}) {
  return (
    <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl flex items-stretch overflow-hidden h-12">
      <button onClick={onMinus} className="w-8 flex items-center justify-center text-[var(--color-text-dim)] text-lg active:bg-[var(--color-surface-3)] transition-colors" aria-label="Decrease">−</button>
      <div className="flex-1 flex flex-col items-center justify-center">
        <input
          type="number"
          inputMode={metric === 'reps' || metric === 'calories' ? 'numeric' : 'decimal'}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className="w-full text-center display-num bg-transparent focus:outline-none placeholder:text-[var(--color-text-faint)]/40"
          style={{ fontSize: 18 }}
        />
        <span className="text-[8px] text-[var(--color-text-faint)] uppercase tracking-wider leading-none -mt-0.5">{shortLabel(metric, units)}</span>
      </div>
      <button onClick={onPlus} className="w-8 flex items-center justify-center text-[var(--color-text-dim)] text-lg active:bg-[var(--color-surface-3)] transition-colors" aria-label="Increase">+</button>
    </div>
  )
}

// ---- helpers ----
function extractValues(s?: WorkoutSet): SetValues {
  if (!s) return {}
  return {
    weight: s.weight || undefined,
    reps: s.reps || undefined,
    duration: s.durationSec,
    distance: s.distanceM,
    calories: s.calories,
    pace: s.pace,
  }
}

function readMetric(s: WorkoutSet | undefined, m: ExerciseMetric): number | undefined {
  if (!s) return undefined
  switch (m) {
    case 'reps':     return s.reps || undefined
    case 'weight':   return s.weight || undefined
    case 'duration': return s.durationSec
    case 'distance': return s.distanceM
    case 'calories': return s.calories
    case 'pace':     return s.pace
  }
}

function readPrescription(be: BlockExercise | undefined, m: ExerciseMetric): number | undefined {
  if (!be) return undefined
  switch (m) {
    case 'reps':     return be.reps
    case 'weight':   return be.weight
    case 'duration': return be.durationSec
    case 'distance': return be.distanceM
    case 'calories': return be.calories
    case 'pace':     return be.pace
  }
}

function shortLabel(m: ExerciseMetric, units: 'imperial' | 'metric'): string {
  switch (m) {
    case 'reps':     return 'REPS'
    case 'weight':   return units === 'metric' ? 'KG' : 'LB'
    case 'duration': return 'SEC'
    case 'distance': return units === 'metric' ? 'M' : 'YD'
    case 'calories': return 'CAL'
    case 'pace':     return 'PACE'
  }
}

function labelFor(m: ExerciseMetric): string {
  return shortLabel(m, 'imperial')
}

function formatMetric(m: ExerciseMetric, n: number): string {
  if (m === 'duration') return `${Math.round(n)}`
  if (m === 'pace') return `${n.toFixed(1)}`
  return String(Math.round(n * 10) / 10)
}
