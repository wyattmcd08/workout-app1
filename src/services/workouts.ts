import { db, type WorkoutTemplate, type WorkoutBlock, type WorkoutSession } from '../db'

export async function createWorkout(input: Omit<WorkoutTemplate, 'id' | 'createdAt'>): Promise<WorkoutTemplate> {
  const id = await db.workoutTemplates.add({ ...input, createdAt: Date.now() })
  return (await db.workoutTemplates.get(Number(id)))!
}

export async function updateWorkout(id: number, patch: Partial<WorkoutTemplate>): Promise<void> {
  await db.workoutTemplates.update(id, patch)
}

export async function deleteWorkout(id: number): Promise<void> {
  await db.templateExercises.where('templateId').equals(id).delete()
  await db.workoutTemplates.delete(id)
}

export async function duplicateWorkout(id: number): Promise<WorkoutTemplate | null> {
  const t = await db.workoutTemplates.get(id)
  if (!t) return null
  const order = (await db.workoutTemplates.count()) + 1
  const newId = await db.workoutTemplates.add({
    ...t, id: undefined, name: `${t.name} (copy)`, order, createdAt: Date.now(),
  })
  // If legacy, copy templateExercises too
  const tes = await db.templateExercises.where('templateId').equals(id).toArray()
  if (tes.length > 0) {
    await db.templateExercises.bulkAdd(tes.map((te) => ({ ...te, id: undefined, templateId: Number(newId) })))
  }
  return (await db.workoutTemplates.get(Number(newId)))!
}

export interface WorkoutStats {
  lastPerformedAt?: number
  totalVolume: number      // Σ weight×reps across all sessions of this template
  prCount: number          // count of WorkoutSet rows with isPr=1
  sessionCount: number
}

export async function getWorkoutStats(templateId: number): Promise<WorkoutStats> {
  const sessions = (await db.workoutSessions.toArray()).filter((s) => s.templateId === templateId)
  const sessionIds = new Set(sessions.map((s) => s.id!))
  let totalVolume = 0
  let prCount = 0
  const allSets = await db.workoutSets.toArray()
  for (const s of allSets) {
    if (!sessionIds.has(s.sessionId)) continue
    if (s.completed !== 1) continue
    if (s.kind === 'set' || !s.kind) totalVolume += (s.weight ?? 0) * (s.reps ?? 0)
    if (s.isPr === 1) prCount++
  }
  const lastPerformedAt = sessions
    .filter((s) => s.endedAt != null)
    .reduce((max: number | undefined, s) => Math.max(max ?? 0, s.endedAt!), undefined as number | undefined)
  return { lastPerformedAt, totalVolume, prCount, sessionCount: sessions.length }
}

export async function getSessionStats(session: WorkoutSession): Promise<{ volume: number; sets: number; prs: number; durationMin: number }> {
  const sets = await db.workoutSets.where('sessionId').equals(session.id!).toArray()
  const completed = sets.filter((s) => s.completed === 1)
  let volume = 0
  let prs = 0
  for (const s of completed) {
    if (s.kind === 'set' || !s.kind) volume += (s.weight ?? 0) * (s.reps ?? 0)
    if (s.isPr === 1) prs++
  }
  const durationMs = (session.endedAt ?? Date.now()) - session.startedAt
  return { volume, sets: completed.length, prs, durationMin: Math.max(1, Math.round(durationMs / 60000)) }
}

// Resolve a template's blocks — used as a single source of truth by runners.
// After v3 migration every template has blocks[]; if not, build one on the fly.
export async function getBlocksForTemplate(templateId: number): Promise<WorkoutBlock[]> {
  const t = await db.workoutTemplates.get(templateId)
  if (!t) return []
  if (t.blocks && t.blocks.length > 0) return t.blocks
  // Fallback: synthesize from legacy templateExercises (shouldn't happen post-migration)
  const tes = await db.templateExercises.where('templateId').equals(templateId).sortBy('order')
  if (tes.length === 0) return []
  const id = Math.random().toString(36).slice(2, 10)
  return [{
    id,
    type: 'strength',
    format: 'standard',
    exercises: tes.map((te) => ({
      id: Math.random().toString(36).slice(2, 10),
      exerciseId: te.exerciseId,
      sets: te.sets,
      reps: te.repsHigh,
      repsText: te.repsLow !== te.repsHigh ? `${te.repsLow}-${te.repsHigh}` : undefined,
      restSec: te.restSec,
      notes: te.notes,
    })),
  }]
}
