import type { WorkoutSet, TemplateExercise } from '../db'

export interface OverloadSuggestion {
  weight: number
  reps: number
  reasoning: string
}

// Group sets by their session-day (using createdAt → YYYY-MM-DD).
function groupByDay(sets: WorkoutSet[]): Map<string, WorkoutSet[]> {
  const out = new Map<string, WorkoutSet[]>()
  for (const s of sets) {
    if (s.completed !== 1) continue
    const d = new Date(s.createdAt).toISOString().slice(0, 10)
    const arr = out.get(d) ?? []
    arr.push(s)
    out.set(d, arr)
  }
  return out
}

/**
 * Suggest next session's working set based on history and the (optional) template.
 * Returns null when there's no history to base a suggestion on.
 */
export function suggestNext(
  history: WorkoutSet[],
  templateExercise?: TemplateExercise,
  units: 'imperial' | 'metric' = 'imperial',
): OverloadSuggestion | null {
  const byDay = groupByDay(history)
  if (byDay.size === 0) return null

  const days = Array.from(byDay.keys()).sort()
  const lastDay = days[days.length - 1]
  const lastSets = byDay.get(lastDay) ?? []
  if (lastSets.length === 0) return null

  const step = units === 'metric' ? 2.5 : 5
  const lastTopWeight = Math.max(...lastSets.map((s) => s.weight))
  const lastTopReps = Math.max(...lastSets.map((s) => s.reps))

  if (templateExercise) {
    const { repsLow, repsHigh } = templateExercise
    const allHitTop = lastSets.every((s) => s.reps >= repsHigh && s.weight === lastTopWeight)
    if (allHitTop) {
      return {
        weight: lastTopWeight + step,
        reps: repsLow,
        reasoning: 'You hit top of range last time — bump the weight.',
      }
    }
    const anyBelowLow = lastSets.some((s) => s.reps < repsLow)
    if (anyBelowLow) {
      return {
        weight: Math.max(0, lastTopWeight - step),
        reps: repsLow,
        reasoning: 'Form check — drop a notch and rebuild.',
      }
    }
    // In-range mixed
    return {
      weight: lastTopWeight,
      reps: Math.min(repsHigh, lastTopReps + 1),
      reasoning: 'One more rep this time.',
    }
  }

  // No template — gentle "add a rep"
  return {
    weight: lastTopWeight,
    reps: lastTopReps + 1,
    reasoning: 'Add a rep over last session.',
  }
}
