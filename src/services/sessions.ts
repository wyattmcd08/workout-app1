import { db, type WorkoutSession, type WorkoutTemplate, type WorkoutBlock, type SessionState, type BlockProgress } from '../db'

export async function getActiveSessionForDate(dateISO: string): Promise<WorkoutSession | undefined> {
  return db.workoutSessions.where('date').equals(dateISO).first()
}

export async function startSession(input: {
  date: string
  name: string
  templateId?: number
}): Promise<WorkoutSession> {
  const id = await db.workoutSessions.add({
    date: input.date,
    templateId: input.templateId,
    name: input.name,
    startedAt: Date.now(),
    state: { blockProgress: {} },
  })
  return (await db.workoutSessions.get(Number(id)))!
}

export async function startFromTemplate(date: string, template: WorkoutTemplate): Promise<WorkoutSession> {
  return startSession({ date, name: template.name, templateId: template.id })
}

export async function endSession(sessionId: number): Promise<void> {
  await db.workoutSessions.update(sessionId, { endedAt: Date.now() })
}

export async function discardSession(sessionId: number): Promise<void> {
  await db.workoutSets.where('sessionId').equals(sessionId).delete()
  await db.workoutSessions.delete(sessionId)
}

export async function patchSessionState(sessionId: number, patch: Partial<SessionState>): Promise<void> {
  const s = await db.workoutSessions.get(sessionId)
  if (!s) return
  const nextState: SessionState = { ...(s.state ?? {}), ...patch }
  await db.workoutSessions.update(sessionId, { state: nextState })
}

export async function setBlockProgress(sessionId: number, blockId: string, patch: Partial<BlockProgress>): Promise<void> {
  const s = await db.workoutSessions.get(sessionId)
  if (!s) return
  const prev = s.state?.blockProgress ?? {}
  const cur = prev[blockId] ?? { completedRounds: 0, lastTickAt: Date.now(), isCompleted: false }
  const nextProgress: Record<string, BlockProgress> = {
    ...prev,
    [blockId]: { ...cur, ...patch, lastTickAt: Date.now() },
  }
  await db.workoutSessions.update(sessionId, {
    state: { ...(s.state ?? {}), blockProgress: nextProgress },
  })
}

export async function hideExerciseInSession(sessionId: number, exerciseId: number): Promise<void> {
  const s = await db.workoutSessions.get(sessionId)
  if (!s) return
  // Also delete any sets for that exercise in this session
  await db.workoutSets.where('sessionId').equals(sessionId).filter((x) => x.exerciseId === exerciseId).delete()
  const newHidden = Array.from(new Set([...(s.hiddenExerciseIds ?? []), exerciseId]))
  await db.workoutSessions.update(sessionId, { hiddenExerciseIds: newHidden })
}

export async function unhideExerciseInSession(sessionId: number, exerciseId: number): Promise<void> {
  const s = await db.workoutSessions.get(sessionId)
  if (!s) return
  const newHidden = (s.hiddenExerciseIds ?? []).filter((id) => id !== exerciseId)
  await db.workoutSessions.update(sessionId, { hiddenExerciseIds: newHidden })
}

export async function reorderExerciseInSession(sessionId: number, exerciseId: number, dir: -1 | 1, baseOrder: number[]): Promise<void> {
  const s = await db.workoutSessions.get(sessionId)
  if (!s) return
  const order = (s.customOrder?.length ? [...s.customOrder] : [...baseOrder])
  if (!order.includes(exerciseId)) order.push(exerciseId)
  const i = order.indexOf(exerciseId)
  const j = i + dir
  if (j < 0 || j >= order.length) return
  ;[order[i], order[j]] = [order[j], order[i]]
  await db.workoutSessions.update(sessionId, { customOrder: order })
}

// Repair an orphan session (no templateId). Older Quick Start sessions and
// any session whose template was deleted out from under it land here. We
// auto-create a one-off template with an empty strength block and link it.
// Returns the (possibly updated) session.
export async function ensureSessionHasTemplate(session: WorkoutSession): Promise<WorkoutSession> {
  if (session.templateId) {
    const t = await db.workoutTemplates.get(session.templateId)
    if (t) return session   // template exists; nothing to do
  }
  const block: WorkoutBlock = {
    id: Math.random().toString(36).slice(2, 10),
    type: 'strength',
    format: 'standard',
    name: session.name,
    exercises: [],
  }
  const tid = await db.workoutTemplates.add({
    name: session.name || 'Workout',
    order: Date.now(),
    blocks: [block],
    favorite: 0,
    createdAt: Date.now(),
  })
  await db.workoutSessions.update(session.id!, { templateId: Number(tid) })
  return { ...session, templateId: Number(tid) }
}

// Recent completed sessions, newest first.
export async function getRecentSessions(limit = 10): Promise<WorkoutSession[]> {
  const all = await db.workoutSessions.toArray()
  return all
    .filter((s) => s.endedAt != null)
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
    .slice(0, limit)
}
