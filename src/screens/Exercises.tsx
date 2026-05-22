import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, MUSCLE_LABELS, CATEGORY_LABELS, EQUIPMENT_LABELS, MOVEMENT_LABELS,
  type MuscleGroup, type Exercise, type ExerciseCategory, type Equipment,
  type MovementPattern, type Difficulty, type ExerciseMetric, type WorkoutSet,
} from '../db'
import { estimated1RM } from '../lib/format'
import { toast } from '../lib/toast'
import { haptic } from '../lib/haptic'
import { Header, Segmented } from '../components/Header'
import { Card, Stat } from '../components/Card'
import { Sheet } from '../components/Sheet'
import { Field, Select } from '../components/Field'
import { PrimaryButton } from '../components/PrimaryButton'
import { Spark } from '../components/Spark'
import { EmptyState, EmptyIcons } from '../components/EmptyState'

type FilterTab = 'all' | 'favorites' | 'recent' | 'custom'

const ALL_METRICS: { value: ExerciseMetric; label: string }[] = [
  { value: 'reps',     label: 'Reps' },
  { value: 'weight',   label: 'Weight' },
  { value: 'duration', label: 'Duration' },
  { value: 'distance', label: 'Distance' },
  { value: 'pace',     label: 'Pace' },
  { value: 'calories', label: 'Calories' },
]

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced',
}

export function Exercises({ embedded }: { embedded?: boolean } = {}) {
  const [tab, setTab] = useState<FilterTab>('all')
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ExerciseCategory | 'all'>('all')
  const [equipment, setEquipment] = useState<Equipment | 'all'>('all')
  const [movement, setMovement] = useState<MovementPattern | 'all'>('all')

  const exercises = useLiveQuery(() => db.exercises.toArray(), [])

  const filtered = useMemo(() => {
    if (!exercises) return []
    let xs = [...exercises]
    if (tab === 'favorites') xs = xs.filter((e) => e.favorite === 1)
    else if (tab === 'custom') xs = xs.filter((e) => e.custom === 1)
    else if (tab === 'recent') {
      xs = xs.filter((e) => e.lastUsedAt != null)
        .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
        .slice(0, 30)
    }
    if (tab !== 'recent') xs = xs.sort((a, b) => a.name.localeCompare(b.name))
    if (category !== 'all') xs = xs.filter((e) => e.category === category)
    if (equipment !== 'all') xs = xs.filter((e) => e.equipment === equipment)
    if (movement !== 'all') xs = xs.filter((e) => e.movement === movement)
    const q = query.trim().toLowerCase()
    if (q) xs = xs.filter((e) => e.name.toLowerCase().includes(q))
    return xs
  }, [exercises, tab, category, equipment, movement, query])

  async function toggleFavorite(e: Exercise) {
    await db.exercises.update(e.id!, { favorite: e.favorite === 1 ? 0 : 1 })
    haptic('tap')
  }

  return (
    <div className={embedded ? '' : 'pb-32 page-exercises'}>
      {!embedded && (
        <Header
          title="Library"
          subtitle="Your exercises, your way"
          right={
            <button
              onClick={() => setEditing('new')}
              className="text-xs font-bold px-3.5 py-2 rounded-full bg-[var(--color-accent)] text-white shadow-[0_8px_24px_-12px_var(--color-accent)] active:scale-95 transition-transform"
            >+ New</button>
          }
        />
      )}

      <div className={`px-4 ${embedded ? 'mb-3' : 'mb-3'}`}>
        <Segmented<FilterTab>
          options={[
            { value: 'all',       label: 'All' },
            { value: 'favorites', label: 'Favs' },
            { value: 'recent',    label: 'Recent' },
            { value: 'custom',    label: 'Custom' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="px-4 space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises..."
          className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)]"
        />

        {/* Filter pills */}
        <FilterPillRow label="Category" value={category} onChange={(v) => setCategory(v as ExerciseCategory | 'all')}
          options={[{ value: 'all', label: 'All' }, ...(Object.keys(CATEGORY_LABELS) as ExerciseCategory[]).map((k) => ({ value: k, label: CATEGORY_LABELS[k] }))]} />
        <FilterPillRow label="Equipment" value={equipment} onChange={(v) => setEquipment(v as Equipment | 'all')}
          options={[{ value: 'all', label: 'All' }, ...(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((k) => ({ value: k, label: EQUIPMENT_LABELS[k] }))]} />
        <FilterPillRow label="Movement" value={movement} onChange={(v) => setMovement(v as MovementPattern | 'all')}
          options={[{ value: 'all', label: 'All' }, ...(Object.keys(MOVEMENT_LABELS) as MovementPattern[]).map((k) => ({ value: k, label: MOVEMENT_LABELS[k] }))]} />

        {filtered.length === 0 ? (
          <Card padded>
            <EmptyState
              icon={EmptyIcons.dumbbell}
              title={(exercises ?? []).length === 0 ? 'BUILD YOUR LIBRARY' : 'NO MATCHES'}
              body={(exercises ?? []).length === 0
                ? 'Add the exercises you actually run. Anything goes — sled pushes, farmer carries, hill sprints, custom intervals.'
                : 'Different filter, or create one fresh.'}
              action={<PrimaryButton onClick={() => setEditing('new')} size="lg">+ Add exercise</PrimaryButton>}
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((e) => (
              <ExerciseTile
                key={e.id}
                exercise={e}
                onOpen={() => setEditing(e)}
                onToggleFavorite={() => toggleFavorite(e)}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <ExerciseDetailSheet
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ExerciseTile({ exercise, onOpen, onToggleFavorite }: {
  exercise: Exercise
  onOpen: () => void
  onToggleFavorite: () => void
}) {
  return (
    <div className="card p-4 flex items-center gap-3 active:scale-[0.99] transition-transform">
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-bold tracking-tight truncate">{exercise.name}</span>
          {exercise.custom === 1 && (
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-accent)]">CUSTOM</span>
          )}
        </div>
        <div className="text-xs text-[var(--color-text-faint)] mt-0.5 truncate">
          {exercise.category && <span className="text-[var(--color-text-dim)] font-semibold">{CATEGORY_LABELS[exercise.category]}</span>}
          {exercise.equipment && <span> · {EQUIPMENT_LABELS[exercise.equipment]}</span>}
          {exercise.primary && <span> · {MUSCLE_LABELS[exercise.primary]}</span>}
        </div>
      </button>
      <button
        onClick={onToggleFavorite}
        aria-label="Toggle favorite"
        className="w-10 h-10 flex items-center justify-center rounded-full active:bg-[var(--color-surface-2)]"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill={exercise.favorite === 1 ? 'var(--color-accent)' : 'none'} stroke={exercise.favorite === 1 ? 'var(--color-accent)' : 'var(--color-text-faint)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      </button>
    </div>
  )
}

function FilterPillRow({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                active
                  ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                  : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
              }`}
            >{o.label}</button>
          )
        })}
      </div>
    </div>
  )
}

// ---------- EXERCISE DETAIL / CREATOR SHEET ----------
function ExerciseDetailSheet({ editing, onClose }: { editing: Exercise | 'new'; onClose: () => void }) {
  const isNew = editing === 'new'
  const initial: Exercise = isNew
    ? {
        name: '',
        primary: 'chest',
        secondary: [],
        category: 'chest',
        equipment: 'barbell',
        movement: 'push',
        difficulty: 'intermediate',
        metrics: ['reps', 'weight'],
        instructions: '',
        notes: '',
        custom: 1,
        favorite: 0,
        createdAt: Date.now(),
      }
    : (editing as Exercise)

  const [form, setForm] = useState({
    name: initial.name,
    primary: initial.primary,
    secondary: initial.secondary ?? [],
    category: initial.category ?? 'other',
    equipment: initial.equipment ?? 'other',
    movement: initial.movement ?? 'other',
    difficulty: initial.difficulty ?? 'intermediate',
    metrics: initial.metrics ?? ['reps', 'weight'],
    instructions: initial.instructions ?? '',
    notes: initial.notes ?? '',
    demoUrl: initial.demoUrl ?? '',
    favorite: (initial.favorite ?? 0) === 1,
  })

  const sets = useLiveQuery<WorkoutSet[]>(
    () => isNew ? Promise.resolve<WorkoutSet[]>([]) : db.workoutSets.where('exerciseId').equals((editing as Exercise).id!).toArray(),
    [isNew ? null : (editing as Exercise).id],
  )
  const completed = (sets ?? []).filter((s) => s.completed === 1)
  const byDay = new Map<string, number>()
  for (const s of completed) {
    const d = new Date(s.createdAt).toISOString().slice(0, 10)
    const oneRm = estimated1RM(s.weight, s.reps)
    byDay.set(d, Math.max(byDay.get(d) ?? 0, oneRm))
  }
  const chartData = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }))
  const topPr = chartData.length > 0 ? Math.max(...chartData.map((p) => p.value)) : 0

  function toggleSecondary(m: MuscleGroup) {
    setForm((f) => ({
      ...f,
      secondary: f.secondary.includes(m) ? f.secondary.filter((x) => x !== m) : [...f.secondary, m],
    }))
  }

  function toggleMetric(m: ExerciseMetric) {
    setForm((f) => ({
      ...f,
      metrics: f.metrics.includes(m) ? f.metrics.filter((x) => x !== m) : [...f.metrics, m],
    }))
  }

  async function save() {
    if (!form.name.trim()) return
    const data: Omit<Exercise, 'id'> = {
      name: form.name.trim(),
      primary: form.primary as MuscleGroup,
      secondary: form.secondary.filter((s) => s !== form.primary),
      category: form.category as ExerciseCategory,
      equipment: form.equipment as Equipment,
      movement: form.movement as MovementPattern,
      difficulty: form.difficulty as Difficulty,
      metrics: form.metrics as ExerciseMetric[],
      instructions: form.instructions.trim() || undefined,
      notes: form.notes.trim() || undefined,
      demoUrl: form.demoUrl.trim() || undefined,
      favorite: form.favorite ? 1 : 0,
      custom: isNew ? 1 : (initial.custom ?? 0),
      createdAt: initial.createdAt,
    }
    if (isNew) {
      await db.exercises.add(data)
      toast.success('Exercise added')
    } else {
      await db.exercises.update((editing as Exercise).id!, data)
      toast.success('Saved')
    }
    haptic('success')
    onClose()
  }

  async function remove() {
    if (isNew) return
    const id = (editing as Exercise).id!
    if (!confirm(`Delete "${initial.name}"? This removes it from every plan & history reference.`)) return
    await db.templateExercises.where('exerciseId').equals(id).delete()
    await db.exercises.delete(id)
    toast.show({ title: 'Exercise deleted', variant: 'default' })
    onClose()
  }

  return (
    <Sheet open title={isNew ? 'Create exercise' : initial.name} onClose={onClose} fullHeight>
      <div className="p-4 space-y-4">
        <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Sled Push" autoFocus />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Category"
            value={form.category}
            onChange={(v) => setForm({ ...form, category: v as ExerciseCategory })}
            options={(Object.keys(CATEGORY_LABELS) as ExerciseCategory[]).map((k) => ({ value: k, label: CATEGORY_LABELS[k] }))}
          />
          <Select
            label="Equipment"
            value={form.equipment}
            onChange={(v) => setForm({ ...form, equipment: v as Equipment })}
            options={(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((k) => ({ value: k, label: EQUIPMENT_LABELS[k] }))}
          />
          <Select
            label="Movement"
            value={form.movement}
            onChange={(v) => setForm({ ...form, movement: v as MovementPattern })}
            options={(Object.keys(MOVEMENT_LABELS) as MovementPattern[]).map((k) => ({ value: k, label: MOVEMENT_LABELS[k] }))}
          />
          <Select
            label="Difficulty"
            value={form.difficulty}
            onChange={(v) => setForm({ ...form, difficulty: v as Difficulty })}
            options={(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((k) => ({ value: k, label: DIFFICULTY_LABELS[k] }))}
          />
        </div>

        <Select
          label="Primary muscle"
          value={form.primary}
          onChange={(v) => setForm({ ...form, primary: v as MuscleGroup })}
          options={(Object.keys(MUSCLE_LABELS) as MuscleGroup[]).map((m) => ({ value: m, label: MUSCLE_LABELS[m] }))}
        />

        <div>
          <div className="eyebrow mb-2">Secondary muscles</div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(MUSCLE_LABELS) as MuscleGroup[]).filter((m) => m !== form.primary).map((m) => (
              <PillToggle key={m} active={form.secondary.includes(m)} onClick={() => toggleSecondary(m)}>
                {MUSCLE_LABELS[m]}
              </PillToggle>
            ))}
          </div>
        </div>

        <div>
          <div className="eyebrow mb-2">What to track</div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_METRICS.map((m) => (
              <PillToggle key={m.value} active={form.metrics.includes(m.value)} onClick={() => toggleMetric(m.value)}>
                {m.label}
              </PillToggle>
            ))}
          </div>
          <div className="text-[11px] text-[var(--color-text-faint)] mt-1.5 leading-relaxed">
            Pick everything that's relevant — sled pushes might be distance + calories; bike sprints might be calories + duration.
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider font-medium">Instructions</span>
          <textarea
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            placeholder="Setup, cues, what counts as a rep."
            className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)] resize-none"
            rows={3}
          />
        </label>

        <Field
          label="Demo URL (optional)"
          value={form.demoUrl}
          onChange={(v) => setForm({ ...form, demoUrl: v })}
          placeholder="https://..."
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider font-medium">Notes</span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Anything else — substitutions, PRs to chase."
            className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)] resize-none"
            rows={2}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.favorite}
            onChange={(e) => setForm({ ...form, favorite: e.target.checked })}
            className="w-5 h-5"
          />
          <span className="font-semibold">Favorite</span>
        </label>

        {!isNew && chartData.length > 0 && (
          <Card title="Progression">
            <Spark data={chartData} height={120} showAxes yLabel="1RM" />
            <div className="grid grid-cols-3 gap-3 mt-3">
              <Stat label="Top set" value={topPr ? Math.round(topPr) : '—'} unit="lb" accent />
              <Stat label="Sessions" value={chartData.length} />
              <Stat label="Total sets" value={completed.length} />
            </div>
          </Card>
        )}

        <div className="flex gap-2 pt-2">
          {!isNew && (
            <PrimaryButton onClick={remove} variant="danger" block={false}>Delete</PrimaryButton>
          )}
          <PrimaryButton onClick={save} disabled={!form.name.trim()} size="lg">Save</PrimaryButton>
        </div>
      </div>
    </Sheet>
  )
}

function PillToggle({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
        active
          ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
          : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
      }`}
    >{children}</button>
  )
}
