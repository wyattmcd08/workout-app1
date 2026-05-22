import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type WorkoutBlock, type WorkoutSession, type WorkoutTemplate } from '../db'
import { today } from '../lib/date'
import { getRecentSessions, startFromTemplate, ensureSessionHasTemplate } from '../services/sessions'
import { getBlocksForTemplate, getSessionStats } from '../services/workouts'
import { toast } from '../lib/toast'
import { haptic } from '../lib/haptic'
import { Card } from '../components/Card'
import { PrimaryButton } from '../components/PrimaryButton'
import { EmptyState, EmptyIcons } from '../components/EmptyState'
import { StartWorkoutSheet } from '../components/StartWorkoutSheet'
import { DayDetailSheet } from '../components/DayDetailSheet'

interface Props {
  onEnterFocus?: (blocks: WorkoutBlock[]) => void
}

export function TrainView({ onEnterFocus }: Props) {
  const [startOpen, setStartOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const activeSession = useLiveQuery(
    () => db.workoutSessions.where('date').equals(today()).filter((s) => !s.endedAt).first(),
    [],
  )
  const recent = useLiveQuery(() => getRecentSessions(10), [])

  async function resume() {
    if (!activeSession) return
    // Orphan-session recovery: auto-create a virtual template if missing.
    const repaired = await ensureSessionHasTemplate(activeSession)
    const blocks = repaired.templateId
      ? await getBlocksForTemplate(repaired.templateId)
      : []
    if (blocks.length === 0) {
      toast.show({ title: 'Session was empty — added a default block', variant: 'success' })
    }
    onEnterFocus?.(blocks)
  }

  async function repeatSession(s: WorkoutSession) {
    if (!s.templateId) {
      toast.show({ title: 'Original template missing' })
      return
    }
    const t = await db.workoutTemplates.get(s.templateId)
    if (!t) {
      toast.show({ title: 'Original template missing' })
      return
    }
    await startFromTemplate(today(), t as WorkoutTemplate)
    haptic('success')
    toast.show({ title: `Restarted: ${t.name}`, variant: 'success' })
    onEnterFocus?.(t.blocks ?? [])
  }

  return (
    <div className="px-4 space-y-4">
      {/* Hero — context-aware */}
      {activeSession ? (
        <button
          onClick={resume}
          className="w-full card-accent p-5 text-left active:scale-[0.99] transition-transform shadow-[0_12px_40px_-12px_var(--color-accent)]"
        >
          <div className="eyebrow opacity-80">Training in progress</div>
          <div className="display mt-1.5" style={{ fontSize: 'clamp(28px, 8vw, 36px)' }}>{activeSession.name}</div>
          <div className="text-xs font-bold uppercase tracking-wider opacity-90 mt-2">Tap to resume →</div>
        </button>
      ) : (
        <div className="card-paper p-5">
          <div className="eyebrow text-[var(--color-ink-dim)]">Ready to train</div>
          <div className="display mt-1" style={{ fontSize: 'clamp(28px, 8vw, 36px)' }}>Pick your work.</div>
          <div className="grid grid-cols-1 gap-2 mt-4">
            <PrimaryButton onClick={() => setStartOpen(true)} size="lg">Start a workout</PrimaryButton>
            <button
              onClick={() => setStartOpen(true)}
              className="text-xs font-bold uppercase tracking-wider text-[var(--color-ink-dim)] py-2"
            >or quick start →</button>
          </div>
        </div>
      )}

      {/* Recent sessions */}
      <div>
        <div className="eyebrow mb-2 px-1">Recent sessions</div>
        {(recent ?? []).length === 0 ? (
          <Card padded>
            <EmptyState
              icon={EmptyIcons.dumbbell}
              title="NO SESSIONS YET"
              body="Once you finish a workout, it shows up here."
              compact
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {(recent ?? []).map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onOpen={() => setSelectedDay(s.date)}
                onRepeat={() => repeatSession(s)}
              />
            ))}
          </div>
        )}
      </div>

      <StartWorkoutSheet
        open={startOpen}
        onClose={() => setStartOpen(false)}
        onStarted={(blocks) => onEnterFocus?.(blocks)}
      />

      <DayDetailSheet iso={selectedDay} onClose={() => setSelectedDay(null)} />
    </div>
  )
}

function SessionCard({ session, onOpen, onRepeat }: { session: WorkoutSession; onOpen: () => void; onRepeat: () => void }) {
  const [stats, setStats] = useState<{ volume: number; sets: number; prs: number; durationMin: number } | null>(null)
  useEffect(() => {
    let cancel = false
    getSessionStats(session).then((s) => { if (!cancel) setStats(s) })
    return () => { cancel = true }
  }, [session.id])

  return (
    <div className="card p-4 flex items-center gap-3">
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-bold tracking-tight truncate">{session.name}</span>
          {stats && stats.prs > 0 && (
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-accent)] flex-shrink-0">
              {stats.prs} PR
            </span>
          )}
        </div>
        <div className="text-[11px] text-[var(--color-text-faint)] tabnum mt-0.5">
          {formatRelative(session.endedAt ?? session.startedAt)}
          {stats ? ` · ${stats.durationMin}m · ${stats.sets} sets` : ''}
          {stats && stats.volume > 0 ? ` · ${formatVolume(stats.volume)}` : ''}
        </div>
      </button>
      {session.templateId && (
        <button
          onClick={onRepeat}
          aria-label="Repeat workout"
          className="w-10 h-10 flex items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-dim)] active:scale-90 transition-transform text-lg"
          title="Repeat this workout"
        >↻</button>
      )}
    </div>
  )
}

function formatRelative(ts: number): string {
  const d = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24))
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d}d ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatVolume(v: number): string {
  if (v < 1000) return `${Math.round(v)} lb`
  return `${(v / 1000).toFixed(1)}k lb`
}
