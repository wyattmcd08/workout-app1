import type { Activity, Goal, Sex } from '../db'

const ACTIVITY_MULT: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  extreme: 1.9,
}

export const ACTIVITY_LABELS: Record<Activity, string> = {
  sedentary: 'Sedentary (desk job)',
  light: 'Light (1–3 d/wk)',
  moderate: 'Moderate (3–5 d/wk)',
  active: 'Active (6–7 d/wk)',
  extreme: 'Athlete / 2-a-days',
}

export const GOAL_LABELS: Record<Goal, string> = {
  lose: 'Lose weight',
  maintain: 'Maintain',
  gain: 'Build muscle',
}

const GOAL_DELTA: Record<Goal, number> = {
  // calorie adjustment per day
  lose: -500,
  maintain: 0,
  gain: 300,
}

export interface TdeeInputs {
  age: number
  sex: Sex
  heightCm: number
  weightKg: number
  activity: Activity
  goal: Goal
}

export interface TdeeResult {
  bmr: number
  maintenance: number
  recommended: number
  weeklyLbChange: number
  proteinG: number
  carbsG: number
  fatG: number
}

// Mifflin-St Jeor BMR
export function calculateTdee(input: TdeeInputs): TdeeResult {
  const { age, sex, heightCm, weightKg, activity, goal } = input
  const sexAdj = sex === 'male' ? 5 : -161
  const bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + sexAdj)
  const maintenance = Math.round(bmr * ACTIVITY_MULT[activity])
  const recommended = Math.max(1200, maintenance + GOAL_DELTA[goal])
  // 3500 kcal ≈ 1 lb body weight change
  const dailyDelta = recommended - maintenance
  const weeklyLbChange = Math.round((dailyDelta * 7 / 3500) * 10) / 10

  // Macro split: protein scales with body weight, fat ~25% kcal, carbs fill remainder
  const proteinG = Math.round(weightKg * 2.2 * (goal === 'gain' ? 1.0 : goal === 'lose' ? 1.1 : 0.9))
  const fatKcal = recommended * 0.25
  const fatG = Math.round(fatKcal / 9)
  const proteinKcal = proteinG * 4
  const carbsKcal = Math.max(0, recommended - fatKcal - proteinKcal)
  const carbsG = Math.round(carbsKcal / 4)
  return { bmr, maintenance, recommended, weeklyLbChange, proteinG, carbsG, fatG }
}
