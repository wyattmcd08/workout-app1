import { db, type WorkoutSet, type SetResultKind } from '../db'
import { detectPr } from '../lib/pr'

export interface LogSetInput {
  sessionId: number
  blockId?: string
  blockExerciseId?: string
  exerciseId: number
  setIndex: number
  weight?: number
  reps?: number
  durationSec?: number
  distanceM?: number
  calories?: number
  pace?: number
  rpe?: number
  round?: number
  kind?: SetResultKind
  completed?: 0 | 1
}

export interface LogSetResult {
  set: WorkoutSet
  isPr: boolean
}

// Single canonical "complete a set" path. Replaces all inline writes.
// Detects PRs automatically when reps+weight are present.
export async function logSet(input: LogSetInput): Promise<LogSetResult> {
  const completed = input.completed ?? 1
  // Find existing row for this (session, exercise, setIndex, blockId) tuple
  const existing = await db.workoutSets
    .where('sessionId').equals(input.sessionId)
    .filter((s) =>
      s.exerciseId === input.exerciseId &&
      s.setIndex === input.setIndex &&
      (s.blockId ?? null) === (input.blockId ?? null),
    )
    .first()

  const row: Omit<WorkoutSet, 'id'> = {
    sessionId: input.sessionId,
    blockId: input.blockId,
    blockExerciseId: input.blockExerciseId,
    exerciseId: input.exerciseId,
    setIndex: input.setIndex,
    weight: input.weight ?? 0,
    reps: input.reps ?? 0,
    durationSec: input.durationSec,
    distanceM: input.distanceM,
    calories: input.calories,
    pace: input.pace,
    rpe: input.rpe,
    round: input.round,
    kind: input.kind ?? 'set',
    completed,
    createdAt: existing?.createdAt ?? Date.now(),
  }

  let setId: number
  if (existing) {
    setId = existing.id!
    await db.workoutSets.update(setId, row)
  } else {
    setId = Number(await db.workoutSets.add(row))
  }
  let set = (await db.workoutSets.get(setId))!

  let isPr = false
  if (completed === 1 && (input.weight ?? 0) > 0 && (input.reps ?? 0) > 0) {
    const history = (await db.workoutSets
      .where('exerciseId').equals(input.exerciseId)
      .toArray()).filter((s) => s.completed === 1 && s.id !== setId)
    const pr = detectPr(set, history)
    if (pr) {
      await db.workoutSets.update(setId, { isPr: 1 })
      set = (await db.workoutSets.get(setId))!
      isPr = true
    }
  }

  // Touch lastUsedAt on the exercise — drives the Recent tab.
  await db.exercises.update(input.exerciseId, { lastUsedAt: Date.now() }).catch(() => {})

  return { set, isPr }
}

export async function removeSet(setId: number): Promise<void> {
  await db.workoutSets.delete(setId)
}

export async function getLastSet(exerciseId: number, excludeSessionId?: number): Promise<WorkoutSet | undefined> {
  const all = await db.workoutSets
    .where('exerciseId').equals(exerciseId)
    .toArray()
  return all
    .filter((s) => s.completed === 1 && s.sessionId !== excludeSessionId)
    .sort((a, b) => b.createdAt - a.createdAt)[0]
}
