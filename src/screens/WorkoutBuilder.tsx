import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, MUSCLE_LABELS, BLOCK_TYPE_LABELS, BLOCK_FORMAT_LABELS,
  type Exercise, type WorkoutTemplate, type WorkoutBlock, type BlockExercise,
  type BlockType, type BlockFormat,
} from '../db'
import { haptic } from '../lib/haptic'
import { toast } from '../lib/toast'
import { Sheet } from '../components/Sheet'
import { Card } from '../components/Card'
import { Field, Select } from '../components/Field'
import { PrimaryButton } from '../components/PrimaryButton'
import { EmptyState, EmptyIcons } from '../components/EmptyState'

interface Props {
  template: WorkoutTemplate | 'new'
  onClose: () => void
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9)
}

function defaultBlock(type: BlockType): WorkoutBlock {
  return {
    id: uid(),
    type,
    format: type === 'warmup' || type === 'cooldown' ? 'standard' : 'standard',
    exercises: [],
  }
}

export function WorkoutBuilder({ template, onClose }: Props) {
  const isNew = template === 'new'
  const initial: WorkoutTemplate = isNew
    ? { name: 'New workout', order: Date.now(), blocks: [defaultBlock('strength')], favorite: 0, createdAt: Date.now() }
    : (template as WorkoutTemplate)

  const [name, setName] = useState(initial.name)
  const [dayLabel, setDayLabel] = useState(initial.dayLabel ?? '')
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [favorite, setFavorite] = useState((initial.favorite ?? 0) === 1)
  const [blocks, setBlocks] = useState<WorkoutBlock[]>(
    initial.blocks && initial.blocks.length > 0
      ? initial.blocks
      : [defaultBlock('strength')],
  )

  function patchBlock(id: string, patch: Partial<WorkoutBlock>) {
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  function addBlock(type: BlockType) {
    setBlocks((bs) => [...bs, defaultBlock(type)])
    haptic('tap')
  }

  function removeBlock(id: string) {
    if (!confirm('Remove this block?')) return
    setBlocks((bs) => bs.filter((b) => b.id !== id))
  }

  function moveBlock(id: string, dir: -1 | 1) {
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= bs.length) return bs
      const out = [...bs]
      ;[out[i], out[j]] = [out[j], out[i]]
      return out
    })
  }

  async function save() {
    if (!name.trim()) return
    const data: Omit<WorkoutTemplate, 'id'> = {
      name: name.trim(),
      dayLabel: dayLabel.trim() || undefined,
      notes: notes.trim() || undefined,
      order: initial.order,
      blocks,
      favorite: favorite ? 1 : 0,
      createdAt: initial.createdAt,
    }
    if (isNew) {
      await db.workoutTemplates.add(data)
      toast.success('Workout created')
    } else {
      await db.workoutTemplates.update((template as WorkoutTemplate).id!, data)
      toast.success('Saved')
    }
    haptic('success')
    onClose()
  }

  async function remove() {
    if (isNew) return
    const t = template as WorkoutTemplate
    if (!confirm(`Delete "${t.name}"?`)) return
    await db.templateExercises.where('templateId').equals(t.id!).delete()
    await db.workoutTemplates.delete(t.id!)
    toast.show({ title: 'Workout deleted' })
    onClose()
  }

  return (
    <Sheet open title={isNew ? 'New workout' : initial.name} onClose={onClose} fullHeight>
      <div className="p-4 space-y-4">
        <Field label="Name" value={name} onChange={setName} placeholder="e.g. Push Day, Hybrid Session 1" autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day label (opt)" value={dayLabel} onChange={setDayLabel} placeholder="Mon, Day 1" />
          <Field label="Notes (opt)" value={notes} onChange={setNotes} placeholder="Deload, taper..." />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} className="w-5 h-5" />
          <span className="font-semibold">Favorite</span>
        </label>

        <div className="space-y-3 pt-1">
          <div className="eyebrow">Blocks</div>
          {blocks.length === 0 && (
            <Card padded>
              <EmptyState
                icon={EmptyIcons.dumbbell}
                title="NO BLOCKS YET"
                body="Start with a warm-up, strength block, conditioning piece — stack them however you train."
                compact
              />
            </Card>
          )}
          {blocks.map((b, i) => (
            <BlockEditor
              key={b.id}
              block={b}
              onChange={(patch) => patchBlock(b.id, patch)}
              onRemove={() => removeBlock(b.id)}
              onMoveUp={i > 0 ? () => moveBlock(b.id, -1) : undefined}
              onMoveDown={i < blocks.length - 1 ? () => moveBlock(b.id, 1) : undefined}
            />
          ))}

          <div>
            <div className="eyebrow mb-1.5">Add a block</div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => addBlock(t)}
                  className="px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-[var(--color-surface-2)] border border-[var(--color-border)] active:scale-95 transition-transform"
                >+ {BLOCK_TYPE_LABELS[t]}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          {!isNew && (
            <PrimaryButton onClick={remove} variant="danger" block={false}>Delete</PrimaryButton>
          )}
          <PrimaryButton onClick={save} disabled={!name.trim() || blocks.length === 0} size="lg">
            Save workout
          </PrimaryButton>
        </div>
      </div>
    </Sheet>
  )
}

// ---------- BLOCK EDITOR ----------
function BlockEditor({ block, onChange, onRemove, onMoveUp, onMoveDown }: {
  block: WorkoutBlock
  onChange: (patch: Partial<WorkoutBlock>) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const [picking, setPicking] = useState(false)

  function patchExercise(idx: number, patch: Partial<BlockExercise>) {
    onChange({
      exercises: block.exercises.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
    })
  }

  function addExercises(ids: number[]) {
    onChange({
      exercises: [...block.exercises, ...ids.map((id) => ({ exerciseId: id, sets: 3, reps: 8 }))],
    })
    setPicking(false)
  }

  function removeExercise(idx: number) {
    onChange({ exercises: block.exercises.filter((_, i) => i !== idx) })
  }

  return (
    <Card padded={false} className="border-l-4" >
      <div className="px-4 py-3 flex items-baseline justify-between border-b border-[var(--color-border)]" style={{ borderLeftColor: blockColor(block.type) }}>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: blockColor(block.type) }}>
            {BLOCK_TYPE_LABELS[block.type]}
          </div>
          <input
            value={block.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={`${BLOCK_FORMAT_LABELS[block.format]} block`}
            className="display text-white bg-transparent w-full focus:outline-none mt-0.5"
            style={{ fontSize: 18 }}
          />
        </div>
        <div className="flex items-center gap-0.5">
          {onMoveUp && <IconBtn onClick={onMoveUp} aria="Move up">↑</IconBtn>}
          {onMoveDown && <IconBtn onClick={onMoveDown} aria="Move down">↓</IconBtn>}
          <IconBtn onClick={onRemove} aria="Remove" danger>×</IconBtn>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <Select
          label="Format"
          value={block.format}
          onChange={(v) => onChange({ format: v as BlockFormat })}
          options={(Object.keys(BLOCK_FORMAT_LABELS) as BlockFormat[]).map((k) => ({ value: k, label: BLOCK_FORMAT_LABELS[k] }))}
        />

        {/* Format-specific params */}
        <BlockFormatParams block={block} onChange={onChange} />

        {/* Exercise list */}
        <div className="space-y-2">
          {block.exercises.length === 0 ? (
            <button
              onClick={() => setPicking(true)}
              className="w-full p-4 rounded-2xl border-2 border-dashed border-[var(--color-border)] text-[var(--color-text-dim)] text-sm font-semibold active:scale-[0.99] transition-transform"
            >+ Add exercises</button>
          ) : (
            <>
              {block.exercises.map((ex, i) => (
                <BlockExerciseRow
                  key={i}
                  blockExercise={ex}
                  format={block.format}
                  onChange={(patch) => patchExercise(i, patch)}
                  onRemove={() => removeExercise(i)}
                />
              ))}
              <button
                onClick={() => setPicking(true)}
                className="w-full p-3 rounded-xl border border-dashed border-[var(--color-border)] text-[var(--color-text-dim)] text-xs font-bold uppercase tracking-wider active:scale-[0.99] transition-transform"
              >+ Add exercise</button>
            </>
          )}
        </div>

        {block.notes !== undefined || true ? (
          <Field
            label="Block notes (opt)"
            value={block.notes ?? ''}
            onChange={(v) => onChange({ notes: v })}
            placeholder="e.g. Build to 80% on the last set"
          />
        ) : null}
      </div>

      {picking && (
        <ExerciseMultiPicker
          excludeIds={block.exercises.map((e) => e.exerciseId)}
          onConfirm={(ids) => addExercises(ids)}
          onClose={() => setPicking(false)}
        />
      )}
    </Card>
  )
}

function blockColor(t: BlockType): string {
  switch (t) {
    case 'warmup': return '#fbbf24'
    case 'strength': return 'var(--color-accent)'
    case 'conditioning': return '#22c55e'
    case 'cardio': return '#3b82f6'
    case 'cooldown': return '#a78bfa'
  }
}

function IconBtn({ children, onClick, aria, danger }: { children: React.ReactNode; onClick: () => void; aria: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={aria}
      className={`w-8 h-8 flex items-center justify-center rounded-full active:bg-[var(--color-surface-2)] text-sm font-bold ${danger ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-dim)]'}`}
    >{children}</button>
  )
}

// ---------- FORMAT PARAMS ----------
function BlockFormatParams({ block, onChange }: { block: WorkoutBlock; onChange: (patch: Partial<WorkoutBlock>) => void }) {
  const { format } = block
  switch (format) {
    case 'amrap':
    case 'fortime':
      return (
        <Field
          label={format === 'amrap' ? 'Time cap (sec)' : 'Time cap (sec, optional)'}
          type="number"
          value={String(block.timeCapSec ?? 600)}
          onChange={(v) => onChange({ timeCapSec: Number(v) || 0 })}
          hint={`= ${formatPretty(block.timeCapSec ?? 600)}`}
        />
      )
    case 'emom':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Interval (sec)" type="number" value={String(block.intervalSec ?? 60)} onChange={(v) => onChange({ intervalSec: Number(v) || 0 })} />
          <Field label="Rounds" type="number" value={String(block.rounds ?? 10)} onChange={(v) => onChange({ rounds: Number(v) || 0 })} />
        </div>
      )
    case 'tabata':
      return (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Work (sec)" type="number" value={String(block.workSec ?? 20)} onChange={(v) => onChange({ workSec: Number(v) || 0 })} />
          <Field label="Rest (sec)" type="number" value={String(block.restSec ?? 10)} onChange={(v) => onChange({ restSec: Number(v) || 0 })} />
          <Field label="Rounds" type="number" value={String(block.rounds ?? 8)} onChange={(v) => onChange({ rounds: Number(v) || 0 })} />
        </div>
      )
    case 'interval':
      return (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Work (sec)" type="number" value={String(block.workSec ?? 60)} onChange={(v) => onChange({ workSec: Number(v) || 0 })} />
          <Field label="Rest (sec)" type="number" value={String(block.restSec ?? 60)} onChange={(v) => onChange({ restSec: Number(v) || 0 })} />
          <Field label="Rounds" type="number" value={String(block.rounds ?? 5)} onChange={(v) => onChange({ rounds: Number(v) || 0 })} />
        </div>
      )
    case 'circuit':
    case 'superset':
      return (
        <Field label="Rounds" type="number" value={String(block.rounds ?? 3)} onChange={(v) => onChange({ rounds: Number(v) || 0 })} />
      )
    case 'standard':
    default:
      return null
  }
}

function formatPretty(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

// ---------- BLOCK EXERCISE ROW (in editor) ----------
function BlockExerciseRow({ blockExercise, format, onChange, onRemove }: {
  blockExercise: BlockExercise
  format: BlockFormat
  onChange: (patch: Partial<BlockExercise>) => void
  onRemove: () => void
}) {
  const ex = useLiveQuery(() => db.exercises.get(blockExercise.exerciseId), [blockExercise.exerciseId])

  return (
    <div className="bg-[var(--color-surface-2)] rounded-xl p-3 border border-[var(--color-border)]">
      <div className="flex items-baseline justify-between mb-2">
        <div className="min-w-0">
          <div className="font-bold tracking-tight truncate">{ex?.name ?? '(deleted)'}</div>
          {ex?.primary && (
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
              {MUSCLE_LABELS[ex.primary]}
            </div>
          )}
        </div>
        <button onClick={onRemove} className="text-[var(--color-text-faint)] text-lg" aria-label="Remove">×</button>
      </div>
      {/* Format-aware fields */}
      {(format === 'standard' || format === 'circuit' || format === 'superset') && (
        <div className="grid grid-cols-3 gap-2">
          <NumField label="Sets" value={blockExercise.sets ?? 3} onChange={(v) => onChange({ sets: v })} />
          <NumField label="Reps" value={blockExercise.reps ?? 8} onChange={(v) => onChange({ reps: v })} />
          <NumField label="Rest s" value={blockExercise.restSec ?? 90} onChange={(v) => onChange({ restSec: v })} />
        </div>
      )}
      {(format === 'amrap' || format === 'fortime' || format === 'emom') && (
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Reps" value={blockExercise.reps ?? 5} onChange={(v) => onChange({ reps: v })} />
          <NumField label="Weight (opt)" value={blockExercise.weight ?? 0} onChange={(v) => onChange({ weight: v })} />
        </div>
      )}
      {format === 'tabata' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Notes" value={blockExercise.notes ?? ''} onChange={(v) => onChange({ notes: v })} placeholder="e.g. burpees, mountain climbers" />
          <NumField label="Reps target (opt)" value={blockExercise.reps ?? 0} onChange={(v) => onChange({ reps: v })} />
        </div>
      )}
      {format === 'interval' && (
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Distance m (opt)" value={blockExercise.distanceM ?? 0} onChange={(v) => onChange({ distanceM: v })} />
          <NumField label="Calories (opt)" value={blockExercise.calories ?? 0} onChange={(v) => onChange({ calories: v })} />
        </div>
      )}
    </div>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wider">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-2 tabnum text-center focus:border-[var(--color-accent)]"
      />
    </label>
  )
}

// ---------- EXERCISE MULTI-PICKER ----------
function ExerciseMultiPicker({ excludeIds, onConfirm, onClose }: {
  excludeIds: number[]
  onConfirm: (ids: number[]) => void
  onClose: () => void
}) {
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const filtered = (exercises ?? [])
    .filter((e) => !excludeIds.includes(e.id!))
    .filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  function toggle(id: number) {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Sheet open title={`Add exercises${selected.size > 0 ? ` (${selected.size})` : ''}`} onClose={onClose} fullHeight>
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-[var(--color-border)]">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search..."
            autoFocus
            className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)]"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <EmptyState
              icon={EmptyIcons.dumbbell}
              title="No exercises"
              body="Create exercises in the Exercises tab first."
            />
          ) : filtered.map((e) => {
            const checked = selected.has(e.id!)
            return (
              <button
                key={e.id}
                onClick={() => toggle(e.id!)}
                className={`w-full text-left px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between ${
                  checked ? 'bg-[var(--color-accent-soft)]' : 'active:bg-[var(--color-surface-2)]'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{e.name}</div>
                  <div className="text-xs text-[var(--color-text-faint)]">{MUSCLE_LABELS[e.primary]}</div>
                </div>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${
                  checked ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white' : 'border-[var(--color-border)]'
                }`}>{checked ? '✓' : ''}</div>
              </button>
            )
          })}
        </div>
        {selected.size > 0 && (
          <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <PrimaryButton onClick={() => onConfirm(Array.from(selected))} size="lg">
              Add {selected.size} exercise{selected.size === 1 ? '' : 's'}
            </PrimaryButton>
          </div>
        )}
      </div>
    </Sheet>
  )
}

// Re-export the Exercise type so existing imports still resolve when needed.
export type { Exercise }
