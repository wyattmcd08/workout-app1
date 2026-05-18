import { db, type WorkoutSet } from '../db'

// AMRAP / EMOM / Tabata / Circuit completed round — kind='round'
export async function recordRound(input: {
  sessionId: number
  blockId: string
  round: number
  exerciseId?: number          // optional — round may be cross-exercise
  reps?: number
  weight?: number
  notes?: string
}): Promise<WorkoutSet> {
  const row: Omit<WorkoutSet, 'id'> = {
    sessionId: input.sessionId,
    blockId: input.blockId,
    exerciseId: input.exerciseId ?? 0,
    setIndex: input.round,
    round: input.round,
    weight: input.weight ?? 0,
    reps: input.reps ?? 0,
    kind: 'round',
    completed: 1,
    createdAt: Date.now(),
  }
  const id = await db.workoutSets.add(row)
  return (await db.workoutSets.get(Number(id)))!
}

// For-Time stopwatch finish — kind='finish'
export async function recordFinish(input: {
  sessionId: number
  blockId: string
  elapsedSec: number
}): Promise<WorkoutSet> {
  const row: Omit<WorkoutSet, 'id'> = {
    sessionId: input.sessionId,
    blockId: input.blockId,
    exerciseId: 0,
    setIndex: 1,
    weight: 0,
    reps: 0,
    durationSec: input.elapsedSec,
    kind: 'finish',
    completed: 1,
    createdAt: Date.now(),
  }
  const id = await db.workoutSets.add(row)
  return (await db.workoutSets.get(Number(id)))!
}

// Generic cardio result — kind='cardio'
export async function recordCardio(input: {
  sessionId: number
  blockId: string
  exerciseId?: number
  durationSec?: number
  distanceM?: number
  pace?: number
  calories?: number
}): Promise<WorkoutSet> {
  const row: Omit<WorkoutSet, 'id'> = {
    sessionId: input.sessionId,
    blockId: input.blockId,
    exerciseId: input.exerciseId ?? 0,
    setIndex: 1,
    weight: 0,
    reps: 0,
    durationSec: input.durationSec,
    distanceM: input.distanceM,
    pace: input.pace,
    calories: input.calories,
    kind: 'cardio',
    completed: 1,
    createdAt: Date.now(),
  }
  const id = await db.workoutSets.add(row)
  return (await db.workoutSets.get(Number(id)))!
}
