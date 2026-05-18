import { db, ensureSettings, type Exercise, type Food } from '.'

// Starter pack — NOT seeded automatically. Only added when the user opts in
// during onboarding or from Settings → "Add starter pack". They can delete
// anything they don't want and add their own custom entries.

const STARTER_EXERCISES: Omit<Exercise, 'id' | 'createdAt'>[] = [
  { name: 'Barbell Bench Press', primary: 'chest', secondary: ['triceps', 'shoulders'] },
  { name: 'Incline Dumbbell Press', primary: 'chest', secondary: ['shoulders', 'triceps'] },
  { name: 'Cable Fly', primary: 'chest', secondary: [] },
  { name: 'Barbell Back Squat', primary: 'quads', secondary: ['glutes', 'hamstrings', 'lowerBack'] },
  { name: 'Romanian Deadlift', primary: 'hamstrings', secondary: ['glutes', 'lowerBack'] },
  { name: 'Conventional Deadlift', primary: 'back', secondary: ['hamstrings', 'glutes', 'lowerBack', 'traps'] },
  { name: 'Pull-Up', primary: 'lats', secondary: ['biceps', 'back'] },
  { name: 'Barbell Row', primary: 'back', secondary: ['lats', 'biceps'] },
  { name: 'Lat Pulldown', primary: 'lats', secondary: ['biceps'] },
  { name: 'Overhead Press', primary: 'shoulders', secondary: ['triceps', 'traps'] },
  { name: 'Lateral Raise', primary: 'shoulders', secondary: [] },
  { name: 'Face Pull', primary: 'shoulders', secondary: ['traps', 'back'] },
  { name: 'Barbell Curl', primary: 'biceps', secondary: ['forearms'] },
  { name: 'Hammer Curl', primary: 'biceps', secondary: ['forearms'] },
  { name: 'Triceps Pushdown', primary: 'triceps', secondary: [] },
  { name: 'Skull Crusher', primary: 'triceps', secondary: [] },
  { name: 'Leg Press', primary: 'quads', secondary: ['glutes', 'hamstrings'] },
  { name: 'Leg Curl', primary: 'hamstrings', secondary: [] },
  { name: 'Leg Extension', primary: 'quads', secondary: [] },
  { name: 'Standing Calf Raise', primary: 'calves', secondary: [] },
  { name: 'Hip Thrust', primary: 'glutes', secondary: ['hamstrings'] },
  { name: 'Hanging Leg Raise', primary: 'core', secondary: [] },
  { name: 'Cable Crunch', primary: 'core', secondary: [] },
  { name: 'Plank', primary: 'core', secondary: [] },
]

const STARTER_FOODS: Omit<Food, 'id' | 'createdAt'>[] = [
  { name: 'Chicken Breast (cooked)', servingSize: 100, servingUnit: 'g', kcal: 165, protein: 31, carbs: 0, fat: 3.6, favorite: 1 },
  { name: 'White Rice (cooked)', servingSize: 100, servingUnit: 'g', kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, favorite: 1 },
  { name: 'Egg, whole large', servingSize: 1, servingUnit: 'egg', kcal: 72, protein: 6.3, carbs: 0.4, fat: 4.8, favorite: 1 },
  { name: '93/7 Ground Beef (cooked)', servingSize: 100, servingUnit: 'g', kcal: 170, protein: 22, carbs: 0, fat: 8 },
  { name: 'Greek Yogurt (nonfat)', servingSize: 170, servingUnit: 'g', kcal: 100, protein: 17, carbs: 6, fat: 0 },
  { name: 'Banana', servingSize: 1, servingUnit: 'medium', kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  { name: 'Whey Protein', servingSize: 30, servingUnit: 'g', kcal: 120, protein: 24, carbs: 3, fat: 1.5, favorite: 1 },
  { name: 'Oats (dry)', servingSize: 40, servingUnit: 'g', kcal: 150, protein: 5, carbs: 27, fat: 3 },
  { name: 'Olive Oil', servingSize: 14, servingUnit: 'g', kcal: 120, protein: 0, carbs: 0, fat: 14 },
  { name: 'Almonds', servingSize: 28, servingUnit: 'g', kcal: 164, protein: 6, carbs: 6, fat: 14 },
]

// Called on every launch — only ensures settings exist. Never seeds content.
export async function seedIfEmpty(): Promise<void> {
  await ensureSettings()
}

// Adds the starter exercises if the table is empty. Safe to call multiple times.
export async function addStarterExercises(): Promise<number> {
  const count = await db.exercises.count()
  if (count > 0) return 0
  const now = Date.now()
  await db.exercises.bulkAdd(STARTER_EXERCISES.map((e) => ({ ...e, createdAt: now })))
  return STARTER_EXERCISES.length
}

// Adds the starter foods if the table is empty. Safe to call multiple times.
export async function addStarterFoods(): Promise<number> {
  const count = await db.foods.count()
  if (count > 0) return 0
  const now = Date.now()
  await db.foods.bulkAdd(STARTER_FOODS.map((f) => ({ ...f, createdAt: now })))
  return STARTER_FOODS.length
}
