import { db, type Exercise } from '../db'

export async function createExercise(input: Omit<Exercise, 'id' | 'createdAt'>): Promise<Exercise> {
  const id = await db.exercises.add({ ...input, createdAt: Date.now() })
  return (await db.exercises.get(Number(id)))!
}

export async function updateExercise(id: number, patch: Partial<Exercise>): Promise<void> {
  await db.exercises.update(id, patch)
}

export async function deleteExercise(id: number): Promise<void> {
  await db.templateExercises.where('exerciseId').equals(id).delete()
  await db.exercises.delete(id)
}

export async function touchLastUsed(id: number): Promise<void> {
  await db.exercises.update(id, { lastUsedAt: Date.now() })
}

export async function toggleFavorite(id: number): Promise<void> {
  const e = await db.exercises.get(id)
  if (!e) return
  await db.exercises.update(id, { favorite: e.favorite === 1 ? 0 : 1 })
}
