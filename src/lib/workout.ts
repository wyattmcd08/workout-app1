import { db, type WorkoutSet, type WorkoutSession } from '../db'

// Find the most recent session (not today) that contains this exercise,
// and return its completed sets in setIndex order.
export async function getLastSessionSets(
  exerciseId: number,
  excludeSessionId?: number,
): Promise<{ session: WorkoutSession; sets: WorkoutSet[] } | null> {
  const sessions = await db.workoutSessions.orderBy('date').reverse().toArray()
  for (const s of sessions) {
    if (s.id === excludeSessionId) continue
    const sets = await db.workoutSets
      .where('sessionId').equals(s.id!)
      .filter((x) => x.exerciseId === exerciseId && x.completed === 1)
      .toArray()
    if (sets.length > 0) {
      sets.sort((a, b) => a.setIndex - b.setIndex)
      return { session: s, sets }
    }
  }
  return null
}

// Full history of completed sets for an exercise (across all sessions).
export async function getExerciseHistory(
  exerciseId: number,
  excludeSetId?: number,
): Promise<WorkoutSet[]> {
  const all = await db.workoutSets
    .where('exerciseId').equals(exerciseId)
    .toArray()
  return all.filter((s) => s.completed === 1 && s.id !== excludeSetId)
}

// "Last: 5×185, 5×185 · 6d ago"
export function formatLastSession(
  sets: WorkoutSet[],
  sessionDateISO: string,
  todayISO: string,
): string {
  if (sets.length === 0) return ''
  const summary = sets.map((s) => `${s.reps}×${s.weight}`).join(', ')
  const days = Math.max(0, Math.round(
    (Date.parse(todayISO) - Date.parse(sessionDateISO)) / (1000 * 60 * 60 * 24),
  ))
  const when = days === 0 ? 'today' : days === 1 ? '1d ago' : `${days}d ago`
  return `Last: ${summary} · ${when}`
}
