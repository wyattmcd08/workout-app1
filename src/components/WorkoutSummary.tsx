import { useState, useEffect } from 'react'
import { db, MUSCLE_LABELS, type WorkoutSession, type Exercise, type MuscleGroup } from '../db'
import { estimated1RM } from '../lib/format'
import { Sheet } from './Sheet'
import { PrimaryButton } from './PrimaryButton'

interface Props {
  session: WorkoutSession
  onClose: () => void
}

interface SummaryData {
  volume: number
  setsCompleted: number
  prs: { name: string; weight: number; reps: number; oneRm: number }[]
  durationMin: number
  caloriesEst: number
  muscleBreakdown: { muscle: MuscleGroup; sets: number }[]
  streak: number              // consecutive days with a completed workout ending today
}

// End-of-workout summary. Shown after Finish is tapped. Reads sets + exercises
// from the DB and computes everything client-side.
export function WorkoutSummary({ session, onClose }: Props) {
  const [data, setData] = useState<SummaryData | null>(null)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const sets = await db.workoutSets.where('sessionId').equals(session.id!).toArray()
      const completed = sets.filter((s) => s.completed === 1)
      const exerciseIds = Array.from(new Set(completed.map((s) => s.exerciseId).filter((id) => id > 0)))
      const exercises = await db.exercises.bulkGet(exerciseIds)
      const exById = new Map<number, Exercise>()
      for (const ex of exercises) if (ex) exById.set(ex.id!, ex)

      let volume = 0
      let prs: SummaryData['prs'] = []
      const muscleSetCount = new Map<MuscleGroup, number>()

      for (const s of completed) {
        if (s.kind === 'set' || !s.kind) {
          volume += (s.weight ?? 0) * (s.reps ?? 0)
          const ex = exById.get(s.exerciseId)
          if (ex) {
            muscleSetCount.set(ex.primary, (muscleSetCount.get(ex.primary) ?? 0) + 1)
            for (const m of ex.secondary ?? []) {
              muscleSetCount.set(m, (muscleSetCount.get(m) ?? 0) + 0.5)
            }
          }
          if (s.isPr === 1) {
            const ex = exById.get(s.exerciseId)
            prs.push({
              name: ex?.name ?? '—',
              weight: s.weight,
              reps: s.reps,
              oneRm: estimated1RM(s.weight, s.reps),
            })
          }
        }
      }

      const durationMs = (session.endedAt ?? Date.now()) - session.startedAt
      const durationMin = Math.max(1, Math.round(durationMs / 60000))
      // Rough estimate: ~5 kcal/min strength + 0.0003 kcal per lb-rep
      const caloriesEst = Math.round(durationMin * 5 + volume * 0.0003)

      const muscleBreakdown = Array.from(muscleSetCount.entries())
        .map(([muscle, sets]) => ({ muscle, sets: Math.round(sets * 10) / 10 }))
        .sort((a, b) => b.sets - a.sets)

      // Streak: consecutive days ending today with at least one completed session.
      const allSessions = await db.workoutSessions.toArray()
      const completedDates = new Set(
        allSessions.filter((s) => s.endedAt != null).map((s) => s.date),
      )
      const todayMs = Date.now()
      let streak = 0
      for (let i = 0; i < 365; i++) {
        const d = new Date(todayMs - i * 86_400_000).toISOString().slice(0, 10)
        if (completedDates.has(d)) streak++
        else if (i > 0) break // allow today to be missing (current workout already counted)
      }

      if (!cancel) {
        setData({ volume, setsCompleted: completed.length, prs, durationMin, caloriesEst, muscleBreakdown, streak })
      }
    })()
    return () => { cancel = true }
  }, [session.id])

  if (!data) {
    return (
      <Sheet open title="Workout summary" onClose={onClose} fullHeight>
        <div className="p-8 text-center text-sm text-[var(--color-text-faint)] uppercase tracking-[0.2em]">
          Crunching numbers…
        </div>
      </Sheet>
    )
  }

  const maxMuscleSets = data.muscleBreakdown[0]?.sets ?? 1

  return (
    <Sheet open title="Workout complete" onClose={onClose} fullHeight>
      <div className="p-4 space-y-3">
        {/* Hero card — volume */}
        <div className="card-paper p-6 text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-dim)]">Total volume</div>
          <div className="display-num mt-1.5" style={{ fontSize: 'clamp(48px, 14vw, 64px)', lineHeight: 0.95 }}>
            {Math.round(data.volume).toLocaleString()}
            <span className="text-base font-bold ml-2 text-[var(--color-ink-dim)]">LB</span>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-4">
            <Tile label="Duration" value={`${data.durationMin}m`} />
            <Tile label="Sets" value={String(data.setsCompleted)} />
            <Tile label="Calories" value={`~${data.caloriesEst}`} />
            <Tile label={data.streak >= 2 ? `🔥 Streak` : 'Streak'} value={`${data.streak}d`} />
          </div>
        </div>

        {/* PRs */}
        {data.prs.length > 0 && (
          <div className="card-accent p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">🏆 New records</div>
            <div className="display mt-1" style={{ fontSize: 22 }}>{data.prs.length} PR{data.prs.length === 1 ? '' : 's'}</div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {data.prs.map((pr, i) => (
                <li key={i} className="flex items-baseline justify-between">
                  <span className="truncate pr-2 font-semibold">{pr.name}</span>
                  <span className="tabnum text-[12px] opacity-90">
                    {pr.reps} × {pr.weight}
                    <span className="opacity-70 ml-1.5">≈{Math.round(pr.oneRm)} 1RM</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Muscle breakdown */}
        {data.muscleBreakdown.length > 0 && (
          <div className="card p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-faint)]">Muscles hit</div>
            <div className="mt-3 space-y-2">
              {data.muscleBreakdown.slice(0, 8).map((m) => {
                const pct = (m.sets / maxMuscleSets) * 100
                return (
                  <div key={m.muscle}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-semibold">{MUSCLE_LABELS[m.muscle]}</span>
                      <span className="tabnum text-[var(--color-text-dim)]">{m.sets} sets</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: 'var(--color-accent)' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {data.setsCompleted === 0 && (
          <div className="card p-6 text-center text-sm text-[var(--color-text-dim)]">
            No sets logged. Workout was discarded — nothing saved.
          </div>
        )}

        <PrimaryButton onClick={onClose} size="lg">Done</PrimaryButton>
      </div>
    </Sheet>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-ink-dim)]">{label}</div>
      <div className="display-num text-[var(--color-ink)] mt-0.5" style={{ fontSize: 22 }}>{value}</div>
    </div>
  )
}
