import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, MEALS } from '../db'
import { estimated1RM } from '../lib/format'
import { toast } from '../lib/toast'
import { haptic } from '../lib/haptic'
import { Sheet } from './Sheet'
import { Card } from './Card'
import { Field } from './Field'
import { PrimaryButton } from './PrimaryButton'
import { EmptyState, EmptyIcons } from './EmptyState'

interface Props {
  iso: string | null
  onClose: () => void
}

export function DayDetailSheet({ iso, onClose }: Props) {
  if (!iso) return null
  return (
    <Sheet open onClose={onClose} title={formatDate(iso)} fullHeight>
      <DayDetailBody iso={iso} />
    </Sheet>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  } catch { return iso }
}

function DayDetailBody({ iso }: { iso: string }) {
  return (
    <div className="p-4 space-y-3">
      <WorkoutsSection iso={iso} />
      <NutritionSection iso={iso} />
      <BodySection iso={iso} />
      <MetricSection iso={iso} />
    </div>
  )
}

// ---------- WORKOUTS ----------
function WorkoutsSection({ iso }: { iso: string }) {
  const sessions = useLiveQuery(() => db.workoutSessions.where('date').equals(iso).toArray(), [iso])
  const sets = useLiveQuery(() => db.workoutSets.toArray(), [])

  return (
    <Card title="Workouts">
      {(sessions ?? []).length === 0 ? (
        <EmptyState icon={EmptyIcons.dumbbell} title="No workout" body="No session logged this day." compact />
      ) : (
        <div className="space-y-2">
          {(sessions ?? []).map((s) => {
            const ss = (sets ?? []).filter((x) => x.sessionId === s.id)
            const completed = ss.filter((x) => x.completed === 1)
            const volume = completed.reduce((acc, x) => acc + x.weight * x.reps, 0)
            const prs = completed.filter((x) => x.isPr === 1).length
            const duration = s.endedAt ? Math.round((s.endedAt - s.startedAt) / 60000) : null
            return (
              <div key={s.id} className="bg-[var(--color-surface-2)] rounded-xl p-3 border border-[var(--color-border)]">
                <div className="flex items-baseline justify-between">
                  <span className="font-bold tracking-tight">{s.name}</span>
                  {prs > 0 && <span className="text-[10px] font-bold text-[var(--color-accent)] uppercase tracking-wider">{prs} PR</span>}
                </div>
                <div className="text-[11px] text-[var(--color-text-dim)] tabnum mt-1">
                  {completed.length} sets · {Math.round(volume).toLocaleString()} lb
                  {duration ? ` · ${duration}m` : ''}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete "${s.name}" and all its sets?`)) return
                      await db.workoutSets.where('sessionId').equals(s.id!).delete()
                      await db.workoutSessions.delete(s.id!)
                      toast.show({ title: 'Session deleted', variant: 'default' })
                    }}
                    className="text-xs text-[var(--color-danger)] font-semibold px-3 py-1.5 rounded-full border border-[var(--color-danger)]/40"
                  >Delete</button>
                </div>
                {/* PR summary */}
                {completed.length > 0 && (
                  <ul className="text-[11px] text-[var(--color-text-faint)] mt-2 space-y-0.5 tabnum">
                    {Object.entries(groupByExercise(completed)).slice(0, 3).map(([exId, list]) => {
                      const top = list.reduce((m, s) => Math.max(m, estimated1RM(s.weight, s.reps)), 0)
                      return (
                        <li key={exId}>
                          <ExerciseName exerciseId={Number(exId)} /> · {list.length} sets · ≈{Math.round(top)} 1RM
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function groupByExercise<T extends { exerciseId: number }>(list: T[]): Record<number, T[]> {
  const out: Record<number, T[]> = {}
  for (const s of list) {
    (out[s.exerciseId] ??= []).push(s)
  }
  return out
}

function ExerciseName({ exerciseId }: { exerciseId: number }) {
  const ex = useLiveQuery(() => db.exercises.get(exerciseId), [exerciseId])
  return <>{ex?.name ?? '(deleted)'}</>
}

// ---------- NUTRITION ----------
function NutritionSection({ iso }: { iso: string }) {
  const entries = useLiveQuery(() => db.logEntries.where('date').equals(iso).toArray(), [iso])
  const foods = useLiveQuery(() => db.foods.toArray(), [])
  const foodById = new Map((foods ?? []).map((f) => [f.id!, f]))

  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  for (const e of entries ?? []) {
    const f = foodById.get(e.foodId)
    if (!f) continue
    totals.kcal += f.kcal * e.servings
    totals.protein += f.protein * e.servings
    totals.carbs += f.carbs * e.servings
    totals.fat += f.fat * e.servings
  }

  return (
    <Card title="Nutrition">
      {(entries ?? []).length === 0 ? (
        <EmptyState icon={EmptyIcons.meal} title="Nothing logged" body="No meals on this date." compact />
      ) : (
        <>
          <div className="bg-[var(--color-surface-2)] rounded-xl p-3 mb-3">
            <div className="display-num" style={{ fontSize: 22 }}>{Math.round(totals.kcal)}<span className="text-xs text-[var(--color-text-dim)] ml-1 font-normal">kcal</span></div>
            <div className="text-[11px] text-[var(--color-text-dim)] tabnum mt-0.5">
              P {Math.round(totals.protein)}g · C {Math.round(totals.carbs)}g · F {Math.round(totals.fat)}g
            </div>
          </div>
          <div className="space-y-1.5">
            {MEALS.map((m) => {
              const list = (entries ?? []).filter((e) => e.meal === m)
              if (list.length === 0) return null
              return (
                <div key={m}>
                  <div className="eyebrow mb-1">{m}</div>
                  {list.map((e) => {
                    const f = foodById.get(e.foodId)
                    if (!f) return null
                    return (
                      <div key={e.id} className="flex items-center justify-between py-1.5 text-sm border-t border-[var(--color-border)] first:border-t-0">
                        <span className="truncate flex-1 pr-2">{f.name} ×{e.servings}</span>
                        <span className="tabnum text-[var(--color-text-dim)] text-xs">{Math.round(f.kcal * e.servings)}</span>
                        <button
                          onClick={() => db.logEntries.delete(e.id!)}
                          className="text-[var(--color-text-faint)] text-lg ml-2 px-1"
                          aria-label="Delete"
                        >×</button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}

// ---------- BODY ----------
function BodySection({ iso }: { iso: string }) {
  const measurement = useLiveQuery(() => db.measurements.where('date').equals(iso).first(), [iso])

  if (!measurement) {
    return (
      <Card title="Body">
        <EmptyState icon={EmptyIcons.ruler} title="No measurement" body="No weigh-in on this date." compact />
      </Card>
    )
  }

  const m = measurement
  return (
    <Card title="Body">
      <div className="space-y-1 text-sm">
        {m.weight != null && <Row label="Weight" value={`${m.weight}`} />}
        {m.bodyFat != null && <Row label="Body fat" value={`${m.bodyFat}%`} />}
        {m.waist != null && <Row label="Waist" value={`${m.waist}`} />}
        {m.chest != null && <Row label="Chest" value={`${m.chest}`} />}
        {m.arm != null && <Row label="Arm" value={`${m.arm}`} />}
        {m.leg != null && <Row label="Leg" value={`${m.leg}`} />}
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={async () => {
            if (!confirm('Delete this measurement?')) return
            await db.measurements.delete(m.id!)
            toast.show({ title: 'Measurement deleted', variant: 'default' })
          }}
          className="text-xs text-[var(--color-danger)] font-semibold px-3 py-1.5 rounded-full border border-[var(--color-danger)]/40"
        >Delete</button>
      </div>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--color-text-dim)]">{label}</span>
      <span className="tabnum font-semibold">{value}</span>
    </div>
  )
}

// ---------- DAILY METRIC ----------
function MetricSection({ iso }: { iso: string }) {
  const metric = useLiveQuery(() => db.metrics.where('date').equals(iso).first(), [iso])
  const [sleep, setSleep] = useState('')
  const [energy, setEnergy] = useState('')
  const [water, setWater] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (metric) {
      setSleep(String(metric.sleep ?? ''))
      setEnergy(String(metric.energy ?? ''))
      setWater(String(metric.water ?? ''))
      setNotes(metric.notes ?? '')
    }
  }, [metric?.id])

  async function save() {
    const patch = {
      date: iso,
      sleep: sleep ? Number(sleep) : undefined,
      energy: energy ? Number(energy) : undefined,
      water: water ? Number(water) : undefined,
      notes: notes.trim() || undefined,
    }
    if (metric) await db.metrics.update(metric.id!, patch)
    else await db.metrics.add(patch)
    toast.success('Saved')
    haptic('success')
  }

  return (
    <Card title="Daily check-in">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Sleep hr" type="number" value={sleep} onChange={setSleep} step="0.5" />
        <Field label="Energy /10" type="number" value={energy} onChange={setEnergy} />
        <Field label="Water ml" type="number" value={water} onChange={setWater} step="50" />
      </div>
      <label className="flex flex-col gap-1.5 mt-3">
        <span className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider font-medium">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="How did the day feel?"
          className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)] resize-none"
        />
      </label>
      <PrimaryButton onClick={save} size="lg" className="mt-3">Save</PrimaryButton>
    </Card>
  )
}
