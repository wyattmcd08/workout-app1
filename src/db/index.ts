import Dexie, { type EntityTable } from 'dexie'

// ---- Domain types ----

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack']

export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms'
  | 'core' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'traps' | 'lats' | 'lowerBack'

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest', 'back', 'lats', 'traps', 'lowerBack', 'shoulders',
  'biceps', 'triceps', 'forearms', 'core',
  'quads', 'hamstrings', 'glutes', 'calves',
]

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest', back: 'Upper Back', lats: 'Lats', traps: 'Traps', lowerBack: 'Lower Back',
  shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  core: 'Core', quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves',
}

// ---- Nutrition ----
export interface Food {
  id?: number
  name: string
  servingSize: number
  servingUnit: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  sodium?: number
  favorite?: 1 | 0
  createdAt: number
}

export interface LogEntry {
  id?: number
  date: string
  meal: Meal
  foodId: number
  servings: number
  createdAt: number
}

// ---- Workouts ----
export interface Exercise {
  id?: number
  name: string
  primary: MuscleGroup
  secondary: MuscleGroup[]
  notes?: string
  createdAt: number
}

// A template (e.g. "Push Day A") groups exercises in order with prescribed sets/reps.
export interface WorkoutTemplate {
  id?: number
  name: string
  dayLabel?: string // e.g. "Mon", "Day 1"
  order: number
  notes?: string
  createdAt: number
}

export interface TemplateExercise {
  id?: number
  templateId: number
  exerciseId: number
  order: number
  sets: number
  repsLow: number
  repsHigh: number
  restSec: number
  notes?: string
}

// A logged workout session (one per day).
export interface WorkoutSession {
  id?: number
  date: string
  templateId?: number
  name: string
  startedAt: number
  endedAt?: number
  notes?: string
}

export interface WorkoutSet {
  id?: number
  sessionId: number
  exerciseId: number
  setIndex: number
  weight: number
  reps: number
  rpe?: number
  isPr?: 1 | 0
  completed: 1 | 0
  createdAt: number
}

// ---- Body / progress ----
export interface BodyMeasurement {
  id?: number
  date: string // YYYY-MM-DD (one entry per day)
  weight?: number       // kg or lb depending on settings
  bodyFat?: number      // percentage
  waist?: number
  chest?: number
  arm?: number
  leg?: number
  notes?: string
  createdAt: number
}

export type PhotoView = 'front' | 'back' | 'side'
export type PhotoLight = 'natural' | 'gym' | 'bathroom' | 'other'
export type PhotoState = 'cold' | 'pumped'
export interface ProgressPhoto {
  id?: number
  date: string
  view: PhotoView
  state: PhotoState
  lighting: PhotoLight
  weight?: number
  blob: Blob
  thumbBlob?: Blob
  createdAt: number
}

// ---- Daily metrics ----
export interface DailyMetric {
  id?: number
  date: string // PK (unique)
  water?: number    // glasses or ml
  sleep?: number    // hours
  energy?: number   // 1-10 self report
  notes?: string
}

// ---- Peptides ----
export interface Peptide {
  id?: number
  name: string
  vialSizeMg: number       // mg per vial
  bacWaterMl: number        // ml of BAC water added
  doseMcg: number           // dose in mcg per injection
  syringeUnits: number      // total units on syringe (typically 100 for 1ml)
  schedule: string          // e.g. "daily", "EOD", "Mon/Wed/Fri"
  protocolDays?: number     // cycle length
  notes?: string
  active: 1 | 0
  createdAt: number
}

export interface PeptideDose {
  id?: number
  peptideId: number
  date: string
  takenAt?: number
  doseMcg: number
  notes?: string
}

// ---- Settings / profile ----
export type UnitSystem = 'metric' | 'imperial'
export type Sex = 'male' | 'female'
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'extreme'
export type Goal = 'lose' | 'maintain' | 'gain'

export interface Settings {
  id: 'settings'
  units: UnitSystem
  name?: string
  // onboarding
  onboardedAt?: number
  // profile (for TDEE calc)
  age?: number
  heightCm?: number
  weightKg?: number
  sex?: Sex
  activity?: Activity
  goal?: Goal
  // targets
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  sodium?: number
  waterTargetMl?: number
  sleepTargetHrs?: number
  // backup
  lastBackupAt?: number
  autoBackupDays?: number      // remind every N days, default 7
  gistToken?: string            // GitHub PAT (classic, gist scope)
  gistId?: string               // backing gist id
  lastGistSyncAt?: number
  // misc
  motivationalQuotes?: 1 | 0
}

// ---- Dexie database ----
export const db = new Dexie('dialed-dawg') as Dexie & {
  foods: EntityTable<Food, 'id'>
  logEntries: EntityTable<LogEntry, 'id'>
  exercises: EntityTable<Exercise, 'id'>
  workoutTemplates: EntityTable<WorkoutTemplate, 'id'>
  templateExercises: EntityTable<TemplateExercise, 'id'>
  workoutSessions: EntityTable<WorkoutSession, 'id'>
  workoutSets: EntityTable<WorkoutSet, 'id'>
  measurements: EntityTable<BodyMeasurement, 'id'>
  photos: EntityTable<ProgressPhoto, 'id'>
  metrics: EntityTable<DailyMetric, 'id'>
  peptides: EntityTable<Peptide, 'id'>
  peptideDoses: EntityTable<PeptideDose, 'id'>
  settings: EntityTable<Settings, 'id'>
}

db.version(1).stores({
  foods: '++id, name, favorite, createdAt',
  logEntries: '++id, date, meal, foodId',
  exercises: '++id, name, primary',
  workoutTemplates: '++id, order, name',
  templateExercises: '++id, templateId, order',
  workoutSessions: '++id, date, templateId',
  workoutSets: '++id, sessionId, exerciseId',
  measurements: '++id, &date',
  photos: '++id, date, view',
  metrics: '++id, &date',
  peptides: '++id, name, active',
  peptideDoses: '++id, peptideId, date',
  settings: 'id',
})

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  units: 'imperial',
  kcal: 2400,
  protein: 180,
  carbs: 240,
  fat: 75,
  fiber: 30,
  sodium: 2300,
  waterTargetMl: 3000,
  sleepTargetHrs: 8,
  autoBackupDays: 7,
  motivationalQuotes: 1,
}

// Safe read-only fetch for live queries; never writes.
export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('settings')) ?? DEFAULT_SETTINGS
}

// Writable counterpart; can be called from event handlers.
export async function ensureSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  if (s) return s
  await db.settings.put(DEFAULT_SETTINGS)
  return DEFAULT_SETTINGS
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await ensureSettings()
  await db.settings.put({ ...cur, ...patch, id: 'settings' })
}
