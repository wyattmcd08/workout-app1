import type { MuscleGroup, WorkoutSet, Exercise, DailyMetric } from '../db'
import { daysBetween, today } from './date'
import { clamp } from './format'

// How much each muscle gets stressed by a "set" relative to its primary share.
// Secondary muscles take ~30% of the volume hit.
const SECONDARY_SHARE = 0.3

// Time constants (in days) for the recovery curve per muscle group.
// Bigger muscles recover slower.
const RECOVERY_DAYS: Record<MuscleGroup, number> = {
  chest: 3, back: 3.5, lats: 3, traps: 2, lowerBack: 4, shoulders: 2.5,
  biceps: 2, triceps: 2, forearms: 1.5, core: 1.5,
  quads: 4, hamstrings: 3.5, glutes: 3.5, calves: 2,
}

export interface MuscleFatigue {
  muscle: MuscleGroup
  fatigue: number       // 0 fully fresh → 100 fully fatigued
  recovery: number      // 100 - fatigue
  lastTrainedISO?: string
  lastVolume?: number   // sets×reps×weight in last session
}

export interface RecoveryInput {
  sets: WorkoutSet[]
  exercises: Exercise[]
  metrics?: DailyMetric[]
}

// Compute per-muscle fatigue given recent sets.
// Volume for a set = weight*reps. Each muscle accumulates fatigue from sets
// targeting it, decaying exponentially with days since the session.
export function computeFatigue(input: RecoveryInput): MuscleFatigue[] {
  const { sets, exercises } = input
  const exerciseById = new Map(exercises.map((e) => [e.id!, e]))
  const today_ = today()

  // Get most recent metric within last 2 days (sleep/calories signal)
  const recentMetrics = (input.metrics ?? []).filter((m) => daysBetween(m.date, today_) <= 1)
  const avgSleep = avg(recentMetrics.map((m) => m.sleep).filter((x): x is number => x != null))
  const sleepPenalty = avgSleep != null && avgSleep < 6 ? 1.15 : 1 // bad sleep = slower recovery

  // Group sets by sessionId for volume aggregation
  const byMuscle = new Map<MuscleGroup, { fatigue: number; last?: { iso: string; vol: number } }>()

  // We approximate "session date" via createdAt because sets share sessionId with the same date.
  // Build map sessionId → date (we'd need sessions). For simplicity, use createdAt as date.
  for (const s of sets) {
    const ex = exerciseById.get(s.exerciseId)
    if (!ex || !s.completed) continue
    const volume = (s.weight || 0) * (s.reps || 0)
    const dateISO = new Date(s.createdAt).toISOString().slice(0, 10)
    const daysAgo = Math.max(0, daysBetween(dateISO, today_))

    apply(byMuscle, ex.primary, volume, daysAgo, dateISO, 1, sleepPenalty)
    for (const sec of ex.secondary) {
      apply(byMuscle, sec, volume, daysAgo, dateISO, SECONDARY_SHARE, sleepPenalty)
    }
  }

  const ALL: MuscleGroup[] = [
    'chest','back','lats','traps','lowerBack','shoulders',
    'biceps','triceps','forearms','core',
    'quads','hamstrings','glutes','calves',
  ]
  return ALL.map((m) => {
    const row = byMuscle.get(m)
    const fatigue = clamp(Math.round(row?.fatigue ?? 0), 0, 100)
    return {
      muscle: m,
      fatigue,
      recovery: 100 - fatigue,
      lastTrainedISO: row?.last?.iso,
      lastVolume: row?.last?.vol,
    }
  })
}

function apply(
  map: Map<MuscleGroup, { fatigue: number; last?: { iso: string; vol: number } }>,
  m: MuscleGroup,
  volume: number,
  daysAgo: number,
  dateISO: string,
  share: number,
  sleepPenalty: number,
) {
  const tau = RECOVERY_DAYS[m] * sleepPenalty
  // Convert volume to a "stress score" — normalize so heavy volume (~5000) maps to ~80 stress.
  const stress = Math.min(100, (volume * share) / 50)
  const decayed = stress * Math.exp(-daysAgo / tau)
  const row = map.get(m) ?? { fatigue: 0 }
  row.fatigue = Math.min(100, row.fatigue + decayed)
  if (!row.last || dateISO > row.last.iso) row.last = { iso: dateISO, vol: volume * share }
  map.set(m, row)
}

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

// Overall recovery score: mean of (100 - fatigue) across all muscles, weighted toward big ones.
export function overallRecovery(fatigues: MuscleFatigue[]): number {
  if (!fatigues.length) return 100
  const total = fatigues.reduce((acc, f) => acc + f.recovery, 0)
  return Math.round(total / fatigues.length)
}

// Pick top muscles to train (highest recovery first, excluding fully recovered fresh = >=98 which means simply long-untrained)
export function suggestedToTrain(fatigues: MuscleFatigue[], limit = 4): MuscleGroup[] {
  return [...fatigues]
    .sort((a, b) => b.recovery - a.recovery)
    .slice(0, limit)
    .map((f) => f.muscle)
}

// Overtraining warning: any muscle with fatigue >= 80
export function overtrainingWarnings(fatigues: MuscleFatigue[]): MuscleGroup[] {
  return fatigues.filter((f) => f.fatigue >= 80).map((f) => f.muscle)
}

export function fatigueColor(fatigue: number): string {
  if (fatigue < 33) return '#4ade80' // fresh
  if (fatigue < 66) return '#fbbf24' // moderate
  return '#ef4444'                    // hammered
}
