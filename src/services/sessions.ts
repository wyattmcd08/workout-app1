import { db, type WorkoutSession, type WorkoutTemplate, type SessionState, type BlockProgress } from '../db'

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
