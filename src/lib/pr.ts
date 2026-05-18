import type { WorkoutSet } from '../db'
import { estimated1RM } from './format'

export type PrKind = 'weight' | '1rm'

export interface PrResult {
  kind: PrKind
  previous: number
  current: number
}

// Given a candidate set and the user's complete history for that exercise
// (excluding the candidate), decide if the new set is a PR by weight or 1RM.
export function detectPr(candidate: WorkoutSet, history: WorkoutSet[]): PrResult | null {
  if (!candidate.weight || !candidate.reps) return null
  const completed = history.filter((s) => s.completed === 1)
  if (completed.length === 0) {
    // First completed set on this exercise — count as a 1RM PR.
    return { kind: '1rm', previous: 0, current: estimated1RM(candidate.weight, candidate.reps) }
  }
  const maxWeight = completed.reduce((m, s) => Math.max(m, s.weight || 0), 0)
  if (candidate.weight > maxWeight) {
    return { kind: 'weight', previous: maxWeight, current: candidate.weight }
  }
  const max1rm = completed.reduce((m, s) => Math.max(m, estimated1RM(s.weight, s.reps)), 0)
  const cur1rm = estimated1RM(candidate.weight, candidate.reps)
  if (cur1rm > max1rm) {
    return { kind: '1rm', previous: max1rm, current: cur1rm }
  }
  return null
}

export function formatPr(pr: PrResult): string {
  if (pr.kind === 'weight') return `New max weight · ${pr.current} lb (was ${pr.previous})`
  return `New estimated 1RM · ${Math.round(pr.current)} lb (was ${Math.round(pr.previous)})`
}
