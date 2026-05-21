import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, BLOCK_TYPE_LABELS, BLOCK_FORMAT_LABELS, type WorkoutTemplate, type Exercise } from '../db'
import { today } from '../lib/date'
import { startFromTemplate } from '../services/sessions'
import { duplicateWorkout, deleteWorkout, updateWorkout, getWorkoutStats, type WorkoutStats } from '../services/workouts'
import { toast } from '../lib/toast'
import { haptic } from '../lib/haptic'
import { Sheet } from './Sheet'
import { PrimaryButton } from './PrimaryButton'
import { WorkoutBuilder } from '../screens/WorkoutBuilder'

interface Props {
  workout: WorkoutTemplate
  onClose: () => void
  onEnterFocus?: (blocks: WorkoutTemplate['blocks']) => void
}

export function WorkoutDetailSheet({ workout, onClose, onEnterFocus }: Props) {
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const exById = new Map((exercises ?? []).map((e) => [e.id!, e]))
  const [stats, setStats] = useState<WorkoutStats | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let cancel = false
    getWorkoutStats(workout.id!).then((s) => { if (!cancel) setStats(s) })
    return () => { cancel = true }
  }, [workout.id])

  async function start() {
    if (!workout.blocks || workout.blocks.length === 0) {
      toast.error('No blocks', 'Edit this workout and add at least one block first.')
      return
    }
    await startFromTemplate(today(), workout)
    haptic('success')
    toast.show({ title: `Started: ${workout.name}`, variant: 'success' })
    onEnterFocus?.(workout.blocks)
    onClose()
  }

  async function toggleFav() {
    await updateWorkout(workout.id!, { favorite: workout.favorite === 1 ? 0 : 1 })
    haptic('tap')
  }

  async function duplicate() {
    const copy = await duplicateWorkout(workout.id!)
    if (copy) {
      toast.success(`Duplicated ${workout.name}`)
      onClose()
    }
  }

  async function remove() {
    if (!confirm(`Delete "${workout.name}"? This can't be undone.`)) return
    await deleteWorkout(workout.id!)
    toast.show({ title: 'Workout deleted' })
    onClose()
  }

  return (
    <Sheet open title={workout.name} onClose={onClose} fullHeight>
      <div className="p-4 space-y-4">
        {/* Big start button */}
        <PrimaryButton onClick={start} size="lg">Start workout</PrimaryButton>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Last" value={formatRelative(stats?.lastPerformedAt)} />
          <StatTile label="Sessions" value={stats ? String(stats.sessionCount) : '—'} />
          <StatTile label="PRs" value={stats ? String(stats.prCount) : '—'} accent={!!stats && stats.prCount > 0} />
        </div>

        {/* Blocks preview */}
        <div className="space-y-2">
          <div className="eyebrow">Blocks</div>
          {(workout.blocks ?? []).length === 0 ? (
            <div className="card p-4 text-sm text-[var(--color-text-faint)] text-center">
              No blocks yet. Tap Edit to add.
            </div>
          ) : (
            (workout.blocks ?? []).map((b) => (
              <div key={b.id} className="card p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: blockTypeColor(b.type) }}>
                  {BLOCK_TYPE_LABELS[b.type]} · {BLOCK_FORMAT_LABELS[b.format]}
                  {b.format === 'amrap' && b.timeCapSec ? ` · ${Math.round(b.timeCapSec / 60)}min` : ''}
                  {b.format === 'emom' && b.intervalSec && b.rounds ? ` · ${b.rounds}×${b.intervalSec}s` : ''}
                  {b.format === 'tabata' && b.rounds ? ` · ${b.rounds} rds` : ''}
                </div>
                {b.name && <div className="display text-white mt-1" style={{ fontSize: 16 }}>{b.name}</div>}
                <ul className="mt-2 text-sm space-y-1">
                  {b.exercises.map((be, i) => (
                    <li key={i} className="flex items-baseline justify-between">
                      <span className="truncate flex-1 pr-2">{exById.get(be.exerciseId)?.name ?? '(deleted)'}</span>
                      <span className="text-[var(--color-text-faint)] tabnum text-xs">{formatPrescription(be)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Actions row */}
        <div className="flex gap-2">
          <button onClick={toggleFav} className="flex-1 py-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] text-sm font-bold active:scale-[0.97] transition-transform">
            {workout.favorite === 1 ? '★ Favorited' : '☆ Favorite'}
          </button>
          <button onClick={() => setEditing(true)} className="flex-1 py-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] text-sm font-bold active:scale-[0.97] transition-transform">
            Edit
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={duplicate} className="flex-1 py-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] text-sm font-semibold active:scale-[0.97] transition-transform text-[var(--color-text-dim)]">
            Duplicate
          </button>
          <button onClick={remove} className="flex-1 py-3 rounded-2xl border border-[var(--color-danger)]/40 text-sm font-semibold active:scale-[0.97] transition-transform text-[var(--color-danger)]">
            Delete
          </button>
        </div>
      </div>

      {editing && (
        <WorkoutBuilder template={workout} onClose={() => setEditing(false)} />
      )}
    </Sheet>
  )
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-faint)]">{label}</div>
      <div className={`display-num mt-1 ${accent ? 'text-[var(--color-accent)]' : ''}`} style={{ fontSize: 18 }}>{value}</div>
    </div>
  )
}

function formatRelative(ts?: number): string {
  if (!ts) return '—'
  const d = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24))
  if (d === 0) return 'Today'
  if (d === 1) return '1d ago'
  if (d < 7) return `${d}d ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  return `${Math.floor(d / 30)}mo ago`
}

function blockTypeColor(t: string): string {
  switch (t) {
    case 'warmup': return '#fbbf24'
    case 'strength': return 'var(--color-accent)'
    case 'conditioning': return '#22c55e'
    case 'cardio': return '#3b82f6'
    case 'cooldown': return '#a78bfa'
    default: return 'var(--color-text-dim)'
  }
}

function formatPrescription(be: { sets?: number; reps?: number; repsText?: string; weight?: number; durationSec?: number; distanceM?: number; calories?: number; restSec?: number }): string {
  const parts: string[] = []
  if (be.sets != null) parts.push(`${be.sets}×${be.reps ?? be.repsText ?? '?'}`)
  else if (be.reps != null) parts.push(`${be.reps} reps`)
  else if (be.repsText) parts.push(be.repsText)
  if (be.weight) parts.push(`${be.weight}lb`)
  if (be.durationSec) parts.push(`${be.durationSec}s`)
  if (be.distanceM) parts.push(`${be.distanceM}m`)
  if (be.calories) parts.push(`${be.calories}cal`)
  return parts.join(' · ') || '—'
}

// Type alias unused exports
export type { Exercise }
