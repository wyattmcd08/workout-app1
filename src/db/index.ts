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
export type ExerciseCategory =
  | 'chest' | 'back' | 'shoulders' | 'legs' | 'arms' | 'core'
  | 'cardio' | 'conditioning' | 'mobility' | 'olympic' | 'bodyweight' | 'other'

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', legs: 'Legs',
  arms: 'Arms', core: 'Core', cardio: 'Cardio', conditioning: 'Conditioning',
  mobility: 'Mobility', olympic: 'Olympic', bodyweight: 'Bodyweight', other: 'Other',
}

export type Equipment =
  | 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight' | 'kettlebell'
  | 'band' | 'sled' | 'sandbag' | 'bike' | 'rower' | 'treadmill' | 'jumprope' | 'box' | 'plate' | 'other'

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell', dumbbell: 'Dumbbell', cable: 'Cable', machine: 'Machine',
  bodyweight: 'Bodyweight', kettlebell: 'Kettlebell', band: 'Band',
  sled: 'Sled', sandbag: 'Sandbag', bike: 'Bike', rower: 'Rower',
  treadmill: 'Treadmill', jumprope: 'Jump rope', box: 'Box', plate: 'Plate', other: 'Other',
}

export type MovementPattern =
  | 'push' | 'pull' | 'squat' | 'hinge' | 'carry' | 'lunge'
  | 'rotation' | 'gait' | 'core' | 'cardio' | 'other'

export const MOVEMENT_LABELS: Record<MovementPattern, string> = {
  push: 'Push', pull: 'Pull', squat: 'Squat', hinge: 'Hinge', carry: 'Carry',
  lunge: 'Lunge', rotation: 'Rotation', gait: 'Gait', core: 'Core', cardio: 'Cardio', other: 'Other',
}

export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export type ExerciseMetric = 'reps' | 'weight' | 'duration' | 'distance' | 'pace' | 'calories'

export interface Exercise {
  id?: number
  name: string
  primary: MuscleGroup
  secondary: MuscleGroup[]
  notes?: string
  instructions?: string
  category?: ExerciseCategory
  equipment?: Equipment
  movement?: MovementPattern
  difficulty?: Difficulty
  metrics?: ExerciseMetric[]   // which metrics this exercise tracks (default: ['reps','weight'])
  favorite?: 1 | 0
  lastUsedAt?: number
  demoUrl?: string
  custom?: 1 | 0
  createdAt: number
}

// Block-based templates support workouts beyond linear lifting.
export type BlockType = 'warmup' | 'strength' | 'conditioning' | 'cardio' | 'cooldown'

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  warmup: 'Warm-up', strength: 'Strength', conditioning: 'Conditioning',
  cardio: 'Cardio', cooldown: 'Cool-down',
}

export type BlockFormat =
  | 'standard'    // straight sets
  | 'circuit'     // do all exercises in order, repeat for rounds
  | 'superset'    // alternate between exercises, repeat for rounds
  | 'emom'        // every minute on the minute — execute the list each interval
  | 'amrap'       // as many rounds as possible in time cap
  | 'tabata'      // 20s work / 10s rest × 8 typically
  | 'fortime'     // complete the work as fast as possible (stopwatch)
  | 'interval'    // generic work/rest intervals

export const BLOCK_FORMAT_LABELS: Record<BlockFormat, string> = {
  standard: 'Straight sets', circuit: 'Circuit', superset: 'Superset',
  emom: 'EMOM', amrap: 'AMRAP', tabata: 'Tabata',
  fortime: 'For Time', interval: 'Interval',
}

export interface BlockExercise {
  id?: string                   // local UUID (v3+) — stable identity within a block
  exerciseId: number
  // Prescription (all optional — the block format decides which apply)
  sets?: number
  reps?: number                 // numeric reps target
  repsText?: string             // free-form (e.g. "max", "8-12")
  weight?: number               // weight target (lb/kg per settings)
  durationSec?: number          // for timed exercises
  distanceM?: number            // meters
  calories?: number             // bike/rower kcal
  pace?: number                 // seconds per unit (e.g. mile, km)
  restSec?: number              // rest after this exercise (standard sets)
  notes?: string
}

export interface WorkoutBlock {
  id: string                    // local uuid (no DB row)
  type: BlockType
  format: BlockFormat
  name?: string
  notes?: string
  // Format-specific parameters (all optional)
  timeCapSec?: number          // AMRAP / For Time / interval
  intervalSec?: number         // EMOM (e.g. 60)
  workSec?: number             // Tabata or generic interval work
  restSec?: number             // Tabata or generic interval rest
  rounds?: number              // Circuit / Superset / Tabata
  exercises: BlockExercise[]
}

// A template (e.g. "Push Day A") groups exercises in order with prescribed sets/reps.
export interface WorkoutTemplate {
  id?: number
  name: string
  dayLabel?: string             // e.g. "Mon", "Day 1"
  order: number
  notes?: string
  blocks?: WorkoutBlock[]       // new block-based format — when present, used instead of templateExercises
  favorite?: 1 | 0
  programId?: number
  createdAt: number
}

// Multi-week training program — groups templates.
export interface Program {
  id?: number
  name: string
  description?: string
  weeks?: number
  templateIds: number[]         // ordered list of WorkoutTemplate ids
  active?: 1 | 0
  startDate?: string
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
export interface SessionState {
  currentBlockId?: string
  currentBlockStartedAt?: number
  currentRound?: number
  currentPhase?: 'work' | 'rest' | 'idle' | 'paused'
  blockProgress?: Record<string, BlockProgress>
}

export interface BlockProgress {
  completedRounds: number
  lastTickAt: number             // for restoring countdowns after refresh
  remainingSec?: number          // snapshot at last persist
  elapsedSec?: number            // for stopwatch (For Time / Cardio)
  isCompleted: boolean
}

export interface WorkoutSession {
  id?: number
  date: string
  templateId?: number
  name: string
  startedAt: number
  endedAt?: number
  notes?: string
  hiddenExerciseIds?: number[]
  customOrder?: number[]
  // v3+ : resumable engine state
  state?: SessionState
}

// SetResult — every recorded unit of work. One shape, four kinds:
//   'set'    — classic lifting set (reps + weight)
//   'round'  — AMRAP/EMOM/Tabata/Circuit completed round
//   'finish' — For-Time stopwatch finish (durationSec)
//   'cardio' — Cardio block result (duration + distance + pace)
export type SetResultKind = 'set' | 'round' | 'finish' | 'cardio'

export interface WorkoutSet {
  id?: number
  sessionId: number
  exerciseId: number
  setIndex: number
  weight: number
  reps: number
  // Beyond classic lifting:
  durationSec?: number
  distanceM?: number
  calories?: number
  pace?: number                // seconds per unit
  blockId?: string             // which block this set belongs to (if block-based)
  blockExerciseId?: string     // which BlockExercise within the block (v3+)
  kind?: SetResultKind         // v3+; defaults to 'set' for legacy rows
  round?: number               // for AMRAP/circuit — which round
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
  // theme + UX
  accentColor?: string          // hex; defaults to #ff2d3d
  soundOn?: 1 | 0
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
  programs: EntityTable<Program, 'id'>
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

// v2 — adds programs, additional indexes on exercises and templates
db.version(2).stores({
  foods: '++id, name, favorite, createdAt',
  logEntries: '++id, date, meal, foodId',
  exercises: '++id, name, primary, category, equipment, favorite, lastUsedAt',
  workoutTemplates: '++id, order, name, favorite, programId',
  templateExercises: '++id, templateId, order',
  workoutSessions: '++id, date, templateId',
  workoutSets: '++id, sessionId, exerciseId, blockId',
  programs: '++id, name, active',
  measurements: '++id, &date',
  photos: '++id, date, view',
  metrics: '++id, &date',
  peptides: '++id, name, active',
  peptideDoses: '++id, peptideId, date',
  settings: 'id',
})

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

// v3 — Unified workout engine.
//   - Every WorkoutTemplate gets a blocks[] (legacy templateExercises rolled into one StraightSets block).
//   - WorkoutSet rows get kind='set' by default; pre-existing AMRAP hacks (exerciseId<=0) become kind='round'.
//   - templateExercises rows are left in place for backup compatibility but no longer read.
db.version(3).stores({
  foods: '++id, name, favorite, createdAt',
  logEntries: '++id, date, meal, foodId',
  exercises: '++id, name, primary, category, equipment, favorite, lastUsedAt',
  workoutTemplates: '++id, order, name, favorite, programId',
  templateExercises: '++id, templateId, order',
  workoutSessions: '++id, date, templateId',
  workoutSets: '++id, sessionId, exerciseId, blockId, kind',
  programs: '++id, name, active',
  measurements: '++id, &date',
  photos: '++id, date, view',
  metrics: '++id, &date',
  peptides: '++id, name, active',
  peptideDoses: '++id, peptideId, date',
  settings: 'id',
}).upgrade(async (tx) => {
  // Migrate legacy templates → blocks[].
  const templates = await tx.table('workoutTemplates').toArray() as WorkoutTemplate[]
  const allTes = await tx.table('templateExercises').toArray() as TemplateExercise[]
  const tesByTemplate = new Map<number, TemplateExercise[]>()
  for (const te of allTes) {
    const arr = tesByTemplate.get(te.templateId) ?? []
    arr.push(te)
    tesByTemplate.set(te.templateId, arr)
  }
  for (const t of templates) {
    if (t.blocks && t.blocks.length > 0) continue // already block-based
    const tes = (tesByTemplate.get(t.id!) ?? []).sort((a, b) => a.order - b.order)
    if (tes.length === 0) continue // empty template — leave alone
    const block: WorkoutBlock = {
      id: genId(),
      type: 'strength',
      format: 'standard',
      exercises: tes.map((te) => ({
        id: genId(),
        exerciseId: te.exerciseId,
        sets: te.sets,
        reps: te.repsHigh,                                // single target; lower bound shown in notes
        repsText: te.repsLow !== te.repsHigh ? `${te.repsLow}-${te.repsHigh}` : undefined,
        restSec: te.restSec,
        notes: te.notes,
      })),
    }
    await tx.table('workoutTemplates').update(t.id!, { blocks: [block] })
  }

  // Migrate sets: stamp kind='set' on all legacy rows; rewrite AMRAP hacks (exerciseId<=0) to kind='round'.
  const sets = await tx.table('workoutSets').toArray() as WorkoutSet[]
  for (const s of sets) {
    if (s.kind) continue
    if ((s.exerciseId ?? 0) <= 0) {
      await tx.table('workoutSets').update(s.id!, {
        kind: 'round',
        round: s.round ?? s.reps,
      })
    } else {
      await tx.table('workoutSets').update(s.id!, { kind: 'set' })
    }
  }
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
