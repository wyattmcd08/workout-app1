import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, BLOCK_TYPE_LABELS, BLOCK_FORMAT_LABELS, MUSCLE_LABELS, getSettings, type WorkoutSession, type WorkoutBlock, type Exercise, type WorkoutSet } from '../db'
import { useBlockEngine, formatMMSS, profileForFormat } from '../services/workoutEngine'
import { setBlockProgress, endSession, discardSession } from '../services/sessions'
import { recordRound, recordFinish } from '../services/rounds'
import { logSet } from '../services/sets'
import { updateWorkout } from '../services/workouts'
import { haptic } from '../lib/haptic'
import { sound } from '../lib/sound'
import { toast } from '../lib/toast'
import { SetLogger } from '../components/SetLogger'
import { useWakeLock } from '../lib/useWakeLock'
import { Sheet } from '../components/Sheet'

interface Props {
  session: WorkoutSession
  blocks: WorkoutBlock[]
  onExit: () => void
}

// Full-screen, immersive active-workout experience. No tab bar.
// Block-by-block walk-through driven entirely by the workout engine.
export function FocusMode({ session, blocks, onExit }: Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const exById = new Map((exercises ?? []).map((e) => [e.id!, e]))

  useWakeLock(true)

  const block = blocks[activeIdx]
  if (!block) {
    return null
  }

  function next() {
    if (activeIdx < blocks.length - 1) {
      setActiveIdx((i) => i + 1)
      haptic('tap')
    } else {
      haptic('success')
      void endSession(session.id!).then(() => {
        toast.show({ title: 'Workout complete', variant: 'success' })
        onExit()
      })
    }
  }

  function prev() {
    if (activeIdx > 0) {
      setActiveIdx((i) => i - 1)
      haptic('tap')
    }
  }

  async function discard() {
    if (!confirm('Discard this workout?')) return
    await discardSession(session.id!)
    onExit()
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--color-bg)] flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Top bar — minimal */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <button onClick={discard} className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-faint)] active:scale-95 transition-transform">
          Exit
        </button>
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-faint)]">
            Block {activeIdx + 1} / {blocks.length}
          </div>
          <div className="text-xs font-bold text-[var(--color-text-dim)] mt-0.5">{session.name}</div>
        </div>
        <SessionElapsed startedAt={session.startedAt} />
      </div>

      {/* Block content */}
      <div className="flex-1 overflow-y-auto">
        <BlockFocus block={block} session={session} exById={exById} onComplete={next} />
      </div>

      {/* Bottom nav — block navigation */}
      <div className="px-4 py-3 flex gap-2 border-t border-[var(--color-border)]">
        {activeIdx > 0 && (
          <button onClick={prev} className="flex-1 py-3 rounded-2xl border-2 border-[var(--color-border)] text-[var(--color-text-dim)] font-bold text-sm uppercase tracking-wider active:scale-[0.97] transition-transform">
            ← Previous
          </button>
        )}
        <button onClick={next} className="flex-1 py-3 rounded-2xl bg-[var(--color-accent)] text-white font-bold text-sm uppercase tracking-wider shadow-[0_8px_24px_-12px_var(--color-accent)] active:scale-[0.97] transition-transform">
          {activeIdx < blocks.length - 1 ? 'Next block →' : 'Finish workout'}
        </button>
      </div>
    </div>
  )
}

function SessionElapsed({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])
  const sec = Math.floor((now - startedAt) / 1000)
  return (
    <div className="text-right">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-faint)]">Total</div>
      <div className="display-num text-[var(--color-accent)] text-base">{formatMMSS(sec)}</div>
    </div>
  )
}

// ---------- BLOCK FOCUS ----------
function BlockFocus({ block, session, exById, onComplete }: {
  block: WorkoutBlock
  session: WorkoutSession
  exById: Map<number, Exercise>
  onComplete: () => void
}) {
  const profile = profileForFormat(block.format)

  if (!profile.hasCountdown && block.format === 'standard') {
    return <StandardFocus block={block} session={session} exById={exById} />
  }

  if (block.format === 'circuit' || block.format === 'superset') {
    return <CircuitFocus block={block} session={session} exById={exById} onComplete={onComplete} />
  }

  if (block.format === 'fortime') {
    return <ForTimeFocus block={block} session={session} exById={exById} onComplete={onComplete} />
  }

  // Engine-driven countdown formats: AMRAP, EMOM, Tabata, Interval
  return <CountdownFocus block={block} session={session} exById={exById} onComplete={onComplete} />
}

// ---------- STANDARD (straight sets) ----------
function StandardFocus({ block, session, exById }: { block: WorkoutBlock; session: WorkoutSession; exById: Map<number, Exercise> }) {
  const settings = useLiveQuery(() => getSettings(), [])
  const units = settings?.units ?? 'imperial'
  const [pickerOpen, setPickerOpen] = useState(false)

  async function addExerciseToBlock(exerciseIds: number[]) {
    if (!session.templateId) return
    const t = await db.workoutTemplates.get(session.templateId)
    if (!t) return
    const newBlocks = (t.blocks ?? []).map((b) => {
      if (b.id !== block.id) return b
      return {
        ...b,
        exercises: [
          ...b.exercises,
          ...exerciseIds.map((id) => ({
            id: Math.random().toString(36).slice(2, 10),
            exerciseId: id,
            sets: 3,
            reps: 8,
          })),
        ],
      }
    })
    await updateWorkout(session.templateId, { blocks: newBlocks })
    setPickerOpen(false)
    haptic('success')
    toast.show({ title: `Added ${exerciseIds.length} exercise${exerciseIds.length === 1 ? '' : 's'}`, variant: 'success' })
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <BlockHeader block={block} />
      {block.exercises.length === 0 ? (
        <div className="card p-6 text-center">
          <div className="text-sm text-[var(--color-text-dim)] mb-3">No exercises yet in this block.</div>
          <button
            onClick={() => setPickerOpen(true)}
            className="px-5 py-2.5 rounded-full bg-[var(--color-accent)] text-white font-bold text-sm shadow-[0_8px_24px_-12px_var(--color-accent)] active:scale-95 transition-transform"
          >+ Add exercise</button>
        </div>
      ) : (
        <>
          {block.exercises.map((be, i) => {
            const ex = exById.get(be.exerciseId)
            if (!ex) return null
            return (
              <ExerciseSetList
                key={be.id ?? `${be.exerciseId}-${i}`}
                block={block}
                blockExerciseIdx={i}
                session={session}
                ex={ex}
                units={units}
              />
            )
          })}
          <button
            onClick={() => setPickerOpen(true)}
            className="w-full p-3 rounded-2xl border border-dashed border-[var(--color-border)] text-[var(--color-text-dim)] text-xs font-bold uppercase tracking-wider active:scale-[0.99] transition-transform"
          >+ Add exercise</button>
        </>
      )}

      {pickerOpen && (
        <ExercisePickerSheet
          excludeIds={block.exercises.map((e) => e.exerciseId)}
          onConfirm={addExerciseToBlock}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

// Lightweight exercise picker — multi-select. Reads the full library.
function ExercisePickerSheet({ excludeIds, onConfirm, onClose }: {
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
      if (next.has(id)) next.delete(id); else next.add(id)
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
            <div className="p-8 text-center text-sm text-[var(--color-text-dim)]">
              No exercises. Add them in the Library first.
            </div>
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
                <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 text-xs font-bold ${
                  checked ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white' : 'border-[var(--color-border)] text-transparent'
                }`}>✓</div>
              </button>
            )
          })}
        </div>
        {selected.size > 0 && (
          <div className="p-4 border-t border-[var(--color-border)]">
            <button
              onClick={() => onConfirm(Array.from(selected))}
              className="w-full py-3.5 rounded-2xl bg-[var(--color-accent)] text-white font-bold shadow-[0_8px_24px_-12px_var(--color-accent)] active:scale-[0.98] transition-transform"
            >Add {selected.size} exercise{selected.size === 1 ? '' : 's'}</button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

function ExerciseSetList({ block, blockExerciseIdx, session, ex, units }: {
  block: WorkoutBlock
  blockExerciseIdx: number
  session: WorkoutSession
  ex: Exercise
  units: 'imperial' | 'metric'
}) {
  const be = block.exercises[blockExerciseIdx]
  const sets = useLiveQuery<WorkoutSet[]>(
    () => db.workoutSets
      .where('sessionId').equals(session.id!)
      .filter((s) => s.blockId === block.id && s.exerciseId === be.exerciseId)
      .toArray(),
    [session.id, block.id, be.exerciseId],
  )
  const [extraSlots, setExtraSlots] = useState(0)
  const targetSets = be.sets ?? 3
  const maxExisting = (sets ?? []).reduce((m, s) => Math.max(m, s.setIndex), 0)
  const total = Math.max(targetSets, maxExisting) + extraSlots
  const slots = Array.from({ length: total }, (_, i) => i + 1)

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="display text-white" style={{ fontSize: 20 }}>{ex.name}</div>
          <div className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wider mt-0.5">
            {be.sets ?? 3} × {be.repsText ?? be.reps ?? 8}
            {be.weight ? ` @ ${be.weight} ${units === 'metric' ? 'kg' : 'lb'}` : ''}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {slots.map((idx) => {
          const cur = (sets ?? []).find((s) => s.setIndex === idx)
          return (
            <SetLogger
              key={idx}
              idx={idx}
              exercise={ex}
              blockExercise={be}
              current={cur}
              units={units}
              onDelete={cur ? () => db.workoutSets.delete(cur.id!) : undefined}
              onSet={async (values, completed) => {
                const res = await logSet({
                  sessionId: session.id!,
                  blockId: block.id,
                  blockExerciseId: be.id,
                  exerciseId: ex.id!,
                  setIndex: idx,
                  weight: values.weight ?? 0,
                  reps: values.reps ?? 0,
                  durationSec: values.duration,
                  distanceM: values.distance,
                  calories: values.calories,
                  pace: values.pace,
                  kind: 'set',
                  completed: completed ? 1 : 0,
                })
                if (completed && res.isPr) {
                  toast.pr('🏆 NEW PR', ex.name)
                  haptic('success')
                  const s = await getSettings()
                  if (s.soundOn) sound.fanfare()
                } else if (completed) {
                  haptic('success')
                }
                return { isPr: res.isPr }
              }}
            />
          )
        })}
      </div>
      <button
        onClick={() => { setExtraSlots((n) => n + 1); haptic('tap') }}
        className="mt-3 w-full py-2.5 rounded-xl border border-dashed border-[var(--color-border)] text-[var(--color-text-dim)] text-xs font-bold uppercase tracking-wider active:scale-[0.99] transition-transform"
      >+ Add set</button>
    </div>
  )
}

// ---------- CIRCUIT / SUPERSET ----------
function CircuitFocus({ block, session, exById, onComplete }: {
  block: WorkoutBlock; session: WorkoutSession; exById: Map<number, Exercise>; onComplete: () => void
}) {
  const totalRounds = block.rounds ?? 3
  // Hydrate round number from session.state if present so refresh doesn't lose progress.
  const persistedRound = (session.state?.blockProgress?.[block.id]?.completedRounds ?? 0) + 1
  const [round, setRound] = useState(persistedRound)
  const [done, setDone] = useState<boolean[]>(() => block.exercises.map(() => false))

  function tick(i: number) {
    const next = [...done]
    next[i] = !next[i]
    setDone(next)
    haptic('tap')
    if (next.every(Boolean)) {
      void recordRound({ sessionId: session.id!, blockId: block.id, round })
      void setBlockProgress(session.id!, block.id, { completedRounds: round, isCompleted: round >= totalRounds })
      if (round >= totalRounds) {
        haptic('success')
        toast.show({ title: `${totalRounds} rounds done`, variant: 'success' })
        onComplete()
      } else {
        setRound((r) => r + 1)
        setDone(block.exercises.map(() => false))
        haptic('success')
      }
    }
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <BlockHeader block={block} />
      <div className="card-paper p-5 text-center">
        <div className="eyebrow text-[var(--color-ink-dim)]">Round</div>
        <div className="display-num mt-1" style={{ fontSize: 'clamp(48px, 14vw, 72px)' }}>{round} / {totalRounds}</div>
      </div>
      <div className="space-y-2">
        {block.exercises.map((be, i) => (
          <ChecklistRow key={i} ex={exById.get(be.exerciseId)} prescription={formatPrescription(be)} done={done[i]} onToggle={() => tick(i)} />
        ))}
      </div>
    </div>
  )
}

// ---------- FOR TIME ----------
function ForTimeFocus({ block, session, exById, onComplete }: {
  block: WorkoutBlock; session: WorkoutSession; exById: Map<number, Exercise>; onComplete: () => void
}) {
  const initial = session.state?.blockProgress?.[block.id]
  const engine = useBlockEngine({
    block,
    initial,
    onTickPersist: (snap) => setBlockProgress(session.id!, block.id, snap).catch(() => {}),
    onExpire: () => {},
  })
  const [done, setDone] = useState<boolean[]>(() => block.exercises.map(() => false))

  function finish() {
    engine.finishEarly()
    sound.fanfare()
    haptic('success')
    toast.pr('Time!', formatMMSS(engine.elapsed))
    void recordFinish({ sessionId: session.id!, blockId: block.id, elapsedSec: Math.round(engine.elapsed) })
    setTimeout(onComplete, 1200)
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <BlockHeader block={block} />
      <div className="card-accent p-6 text-center">
        <div className="eyebrow opacity-80">For Time</div>
        <div className="display-num mt-1" style={{ fontSize: 'clamp(64px, 22vw, 104px)', lineHeight: 0.95 }}>{formatMMSS(engine.elapsed)}</div>
        <div className="text-xs font-bold uppercase tracking-wider opacity-80 mt-2">
          {engine.phase === 'done' ? 'Finished' : engine.running ? 'Running' : 'Ready'}
          {block.timeCapSec ? ` · Cap ${formatMMSS(block.timeCapSec)}` : ''}
        </div>
        <div className="mt-4 flex gap-2 justify-center">
          {!engine.running && engine.phase !== 'done' && (
            <button onClick={engine.start} className="px-7 py-3 rounded-full bg-black/30 backdrop-blur text-white font-bold text-sm active:scale-95">
              {engine.elapsed > 0 ? 'Resume' : 'Start'}
            </button>
          )}
          {engine.running && <button onClick={engine.pause} className="px-7 py-3 rounded-full bg-black/30 backdrop-blur text-white font-bold text-sm">Pause</button>}
          {(engine.running || engine.elapsed > 0) && engine.phase !== 'done' && (
            <button onClick={finish} className="px-7 py-3 rounded-full bg-white text-[var(--color-accent)] font-bold text-sm shadow-lg">Done!</button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {block.exercises.map((be, i) => (
          <ChecklistRow
            key={i}
            ex={exById.get(be.exerciseId)}
            prescription={formatPrescription(be)}
            done={done[i]}
            onToggle={() => { const next = [...done]; next[i] = !next[i]; setDone(next); haptic('tap') }}
          />
        ))}
      </div>
    </div>
  )
}

// ---------- COUNTDOWN (AMRAP / EMOM / Tabata / Interval) ----------
function CountdownFocus({ block, session, exById, onComplete }: {
  block: WorkoutBlock; session: WorkoutSession; exById: Map<number, Exercise>; onComplete: () => void
}) {
  const initial = session.state?.blockProgress?.[block.id]
  const engine = useBlockEngine({
    block,
    initial,
    onTickPersist: (snap) => setBlockProgress(session.id!, block.id, snap).catch(() => {}),
    onRoundComplete: (n) => {
      haptic('chime')
      sound.ding()
      if (block.format !== 'amrap') {
        void recordRound({ sessionId: session.id!, blockId: block.id, round: n })
      }
    },
    onPhaseChange: () => { haptic('chime') },
    onExpire: () => {
      haptic('success')
      sound.fanfare()
      if (block.format === 'amrap') {
        void recordRound({ sessionId: session.id!, blockId: block.id, round: Math.max(0, engine.round - 1) })
      }
      toast.pr('Time!', BLOCK_FORMAT_LABELS[block.format])
      setTimeout(onComplete, 1500)
    },
  })

  const [doneThisRound, setDoneThisRound] = useState<boolean[]>(() => block.exercises.map(() => false))

  // Reset checklist on round change
  useEffect(() => { setDoneThisRound(block.exercises.map(() => false)) }, [engine.round, block.exercises.length])

  // AMRAP: tapping all exercises bumps round; engine doesn't auto-advance.
  function tickAmrap(i: number) {
    haptic('tap')
    const next = [...doneThisRound]
    next[i] = !next[i]
    setDoneThisRound(next)
    if (next.every(Boolean)) {
      engine.bumpRound()
      haptic('success')
    }
  }

  const isAmrap = block.format === 'amrap'
  const isTabata = block.format === 'tabata'
  const isWorkPhase = engine.phase === 'work'

  // Tabata color flip
  const heroClass = isTabata
    ? (isWorkPhase ? 'card-accent' : 'card-paper')
    : 'card-accent'

  return (
    <div className="px-4 py-4 space-y-3">
      <BlockHeader block={block} />
      <div className={`p-6 text-center rounded-3xl ${heroClass}`}>
        <div className="eyebrow opacity-80">
          {BLOCK_FORMAT_LABELS[block.format]}
          {engine.totalRounds ? ` · Round ${engine.round}/${engine.totalRounds}` : ` · ${engine.round - (engine.phase === 'done' ? 1 : 0)} rounds`}
          {isTabata ? ` · ${engine.phase === 'work' ? 'WORK' : engine.phase === 'rest' ? 'REST' : ''}` : ''}
        </div>
        <div className="display-num mt-1" style={{ fontSize: 'clamp(72px, 26vw, 120px)', lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>
          {formatMMSS(engine.remaining)}
        </div>
        <div className="text-xs font-bold uppercase tracking-wider opacity-80 mt-2">
          {engine.phase === 'done' ? 'Done' : engine.running ? engine.phase : 'Ready'}
        </div>
        <div className="mt-5 flex gap-2 justify-center">
          {!engine.running && engine.phase !== 'done' && (
            <button onClick={engine.start} className="px-7 py-3 rounded-full bg-black/30 backdrop-blur text-white font-bold text-sm active:scale-95">
              {engine.round > 1 ? 'Resume' : 'Start'}
            </button>
          )}
          {engine.running && (
            <button onClick={engine.pause} className="px-7 py-3 rounded-full bg-black/30 backdrop-blur text-white font-bold text-sm">Pause</button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {block.exercises.map((be, i) => (
          <ChecklistRow
            key={i}
            ex={exById.get(be.exerciseId)}
            prescription={formatPrescription(be)}
            done={doneThisRound[i]}
            highlight={isWorkPhase}
            onToggle={() => isAmrap ? tickAmrap(i) : (() => { const next = [...doneThisRound]; next[i] = !next[i]; setDoneThisRound(next); haptic('tap') })()}
          />
        ))}
      </div>
    </div>
  )
}

// ---------- SHARED ROW + HEADER ----------
function ChecklistRow({ ex, prescription, done, highlight, onToggle }: {
  ex?: Exercise
  prescription: string
  done: boolean
  highlight?: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full text-left rounded-2xl p-4 flex items-center gap-3 transition-all active:scale-[0.99] ${
        done
          ? 'bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/40'
          : highlight
            ? 'bg-[var(--color-surface-2)] border-2 border-[var(--color-accent)]/50'
            : 'bg-[var(--color-surface-2)] border border-[var(--color-border)]'
      }`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
        done ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white' : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
      }`}>
        {done ? '✓' : ''}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold tracking-tight truncate">{ex?.name ?? '(exercise)'}</div>
        <div className="text-[11px] text-[var(--color-text-dim)] tabnum">{prescription}</div>
      </div>
    </button>
  )
}

function BlockHeader({ block }: { block: WorkoutBlock }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: blockTypeColor(block.type) }}>
        {BLOCK_TYPE_LABELS[block.type]} · {BLOCK_FORMAT_LABELS[block.format]}
      </div>
      <div className="display text-white mt-1" style={{ fontSize: 'clamp(22px, 6vw, 28px)' }}>
        {block.name || BLOCK_FORMAT_LABELS[block.format]}
      </div>
      {block.notes && <div className="text-[11px] text-[var(--color-text-dim)] mt-1 italic">{block.notes}</div>}
    </div>
  )
}

function blockTypeColor(t: WorkoutBlock['type']): string {
  switch (t) {
    case 'warmup': return '#fbbf24'
    case 'strength': return 'var(--color-accent)'
    case 'conditioning': return '#22c55e'
    case 'cardio': return '#3b82f6'
    case 'cooldown': return '#a78bfa'
  }
}

function formatPrescription(be: WorkoutBlock['exercises'][number]): string {
  const parts: string[] = []
  if (be.reps != null) parts.push(`${be.reps} reps`)
  if (be.repsText) parts.push(be.repsText)
  if (be.weight) parts.push(`${be.weight} lb`)
  if (be.durationSec) parts.push(formatMMSS(be.durationSec))
  if (be.distanceM) parts.push(`${be.distanceM}m`)
  if (be.calories) parts.push(`${be.calories} cal`)
  return parts.join(' · ') || '—'
}
