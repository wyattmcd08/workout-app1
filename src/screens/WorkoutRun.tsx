import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, BLOCK_TYPE_LABELS, BLOCK_FORMAT_LABELS, getSettings,
  type WorkoutSession, type WorkoutBlock, type BlockExercise, type WorkoutSet, type Exercise,
} from '../db'
import { useStopwatch, useCountdown, formatMMSS } from '../lib/timer'
import { haptic } from '../lib/haptic'
import { sound } from '../lib/sound'
import { toast } from '../lib/toast'
import { logSet, removeSet, getLastSet } from '../services/sets'
import { recordRound, recordFinish } from '../services/rounds'
import { Card } from '../components/Card'
import { PrimaryButton } from '../components/PrimaryButton'
import { SetLogger } from '../components/SetLogger'

interface Props {
  session: WorkoutSession
  blocks: WorkoutBlock[]
  onFinish: () => void
}

// Block-aware workout execution. Renders different UIs based on the block's
// format (AMRAP / EMOM / Tabata / For Time / standard / circuit / interval).
export function WorkoutRun({ session, blocks, onFinish }: Props) {
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const sets = useLiveQuery<WorkoutSet[]>(
    () => db.workoutSets.where('sessionId').equals(session.id!).toArray(),
    [session.id],
  )
  const exById = new Map((exercises ?? []).map((e) => [e.id!, e]))

  return (
    <div className="px-4 space-y-3 pb-32">
      <Card padded>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="eyebrow">Active session</div>
            <div className="display text-white mt-1" style={{ fontSize: 'clamp(22px, 6.5vw, 28px)' }}>{session.name}</div>
          </div>
          <Elapsed startedAt={session.startedAt} />
        </div>
      </Card>

      {blocks.map((b, i) => (
        <BlockRun
          key={b.id}
          block={b}
          blockIndex={i}
          totalBlocks={blocks.length}
          session={session}
          allSets={(sets ?? []).filter((s) => s.blockId === b.id)}
          exById={exById}
        />
      ))}

      <PrimaryButton onClick={onFinish} size="lg">Finish workout</PrimaryButton>
    </div>
  )
}

function Elapsed({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])
  const sec = Math.floor((now - startedAt) / 1000)
  return <div className="display-num text-[var(--color-accent)]" style={{ fontSize: 22 }}>{formatMMSS(sec)}</div>
}

// ---------- BLOCK RUN ----------
function BlockRun({ block, blockIndex, totalBlocks, session, allSets, exById }: {
  block: WorkoutBlock
  blockIndex: number
  totalBlocks: number
  session: WorkoutSession
  allSets: WorkoutSet[]
  exById: Map<number, Exercise>
}) {
  const accent = blockColor(block.type)

  return (
    <Card padded={false}>
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-baseline justify-between" style={{ borderLeft: `4px solid ${accent}` }}>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: accent }}>
            {BLOCK_TYPE_LABELS[block.type]} · {BLOCK_FORMAT_LABELS[block.format]}
          </div>
          <div className="display text-white mt-0.5" style={{ fontSize: 18 }}>
            {block.name || BLOCK_FORMAT_LABELS[block.format]}
          </div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">
          {blockIndex + 1}/{totalBlocks}
        </div>
      </div>

      {block.notes && (
        <div className="px-4 pt-3 text-[11px] text-[var(--color-text-dim)] italic">{block.notes}</div>
      )}

      {(block.format === 'amrap') && <AmrapRun block={block} session={session} allSets={allSets} exById={exById} />}
      {(block.format === 'emom') && <EmomRun block={block} session={session} allSets={allSets} exById={exById} />}
      {(block.format === 'tabata') && <TabataRun block={block} session={session} allSets={allSets} exById={exById} />}
      {(block.format === 'fortime') && <ForTimeRun block={block} session={session} allSets={allSets} exById={exById} />}
      {(block.format === 'interval') && <IntervalRun block={block} session={session} allSets={allSets} exById={exById} />}
      {(block.format === 'standard' || block.format === 'circuit' || block.format === 'superset') && (
        <StandardRun block={block} session={session} allSets={allSets} exById={exById} />
      )}
    </Card>
  )
}

function blockColor(t: WorkoutBlock['type']): string {
  switch (t) {
    case 'warmup': return '#fbbf24'
    case 'strength': return 'var(--color-accent)'
    case 'conditioning': return '#22c55e'
    case 'cardio': return '#3b82f6'
    case 'cooldown': return '#a78bfa'
  }
}

// ---------- AMRAP ----------
function AmrapRun({ block, session, exById }: BlockRunInner) {
  const [running, setRunning] = useState(false)
  const cap = block.timeCapSec ?? 600
  const { remaining, expired } = useCountdown(cap, running)
  const [rounds, setRounds] = useState(0)
  const [currentExIdx, setCurrentExIdx] = useState(0)
  const [completedThisRound, setCompletedThisRound] = useState<boolean[]>(() => block.exercises.map(() => false))

  useEffect(() => {
    if (expired && running) {
      setRunning(false)
      haptic('chime')
      toast.pr('Time!', `${rounds} round${rounds === 1 ? '' : 's'} logged`)
      // Record total rounds — clean schema, kind='round'
      void recordRound({ sessionId: session.id!, blockId: block.id, round: rounds, reps: rounds })
    }
  }, [expired, running, rounds, session.id, block.id])

  function tickExercise(i: number) {
    haptic('tap')
    const next = [...completedThisRound]
    next[i] = !next[i]
    setCompletedThisRound(next)
    if (next.every(Boolean)) {
      // Round complete!
      setRounds((r) => r + 1)
      setCompletedThisRound(block.exercises.map(() => false))
      setCurrentExIdx(0)
      haptic('success')
    } else {
      setCurrentExIdx((i + 1) % block.exercises.length)
    }
  }

  return (
    <div className="px-4 py-4 space-y-3">
      {/* Hero timer */}
      <div className="card-paper p-5 text-center">
        <div className="eyebrow text-[var(--color-ink-dim)]">AMRAP</div>
        <div className="display-num mt-1" style={{ fontSize: 'clamp(56px, 18vw, 84px)', color: remaining < 30 && remaining > 0 ? 'var(--color-accent)' : 'var(--color-ink)' }}>
          {formatMMSS(remaining)}
        </div>
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-ink-dim)] mt-1">
          {expired ? 'Finished' : running ? 'Running' : 'Paused'} · {rounds} round{rounds === 1 ? '' : 's'}
        </div>
        <div className="mt-3 flex gap-2 justify-center">
          {!running && !expired && (
            <button onClick={() => { setRunning(true); haptic('tap') }} className="px-6 py-2.5 rounded-full bg-[var(--color-ink)] text-white font-bold text-sm active:scale-95 transition-transform">
              Start
            </button>
          )}
          {running && (
            <button onClick={() => setRunning(false)} className="px-6 py-2.5 rounded-full bg-transparent border-2 border-[var(--color-ink)] text-[var(--color-ink)] font-bold text-sm">
              Pause
            </button>
          )}
        </div>
      </div>

      {/* Exercise checklist (resets per round) */}
      <div className="space-y-2">
        {block.exercises.map((be, i) => (
          <ExerciseChecklistRow
            key={i}
            be={be}
            ex={exById.get(be.exerciseId)}
            highlight={i === currentExIdx}
            done={completedThisRound[i]}
            onToggle={() => tickExercise(i)}
          />
        ))}
      </div>

      {!expired && rounds > 0 && (
        <div className="text-center text-xs text-[var(--color-text-faint)]">
          Last round complete — keep going.
        </div>
      )}
    </div>
  )
}

// ---------- EMOM ----------
function EmomRun({ block, exById }: BlockRunInner) {
  const interval = block.intervalSec ?? 60
  const totalRounds = block.rounds ?? 10
  const [running, setRunning] = useState(false)
  const [round, setRound] = useState(1)
  const { remaining, expired } = useCountdown(interval, running)
  const finished = round > totalRounds

  // When the per-minute timer expires, advance round.
  useEffect(() => {
    if (expired && running && !finished) {
      haptic('chime')
      sound.ding()
      if (round + 1 > totalRounds) {
        setRunning(false)
        toast.pr('EMOM done', `${totalRounds} rounds`)
      } else {
        setRound((r) => r + 1)
        // Reset the countdown by toggling running off and on
        setRunning(false)
        setTimeout(() => setRunning(true), 50)
      }
    }
  }, [expired, running, round, totalRounds, finished])

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="card-paper p-5 text-center">
        <div className="eyebrow text-[var(--color-ink-dim)]">EMOM · Round {round}/{totalRounds}</div>
        <div className="display-num mt-1" style={{ fontSize: 'clamp(56px, 18vw, 84px)', color: remaining < 10 && remaining > 0 ? 'var(--color-accent)' : 'var(--color-ink)' }}>
          {formatMMSS(remaining)}
        </div>
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-ink-dim)] mt-1">
          {finished ? 'Done' : running ? 'Running' : 'Paused'}
        </div>
        <div className="mt-3 flex gap-2 justify-center">
          {!running && !finished && (
            <button onClick={() => setRunning(true)} className="px-6 py-2.5 rounded-full bg-[var(--color-ink)] text-white font-bold text-sm active:scale-95">
              {round === 1 ? 'Start' : 'Resume'}
            </button>
          )}
          {running && <button onClick={() => setRunning(false)} className="px-6 py-2.5 rounded-full bg-transparent border-2 border-[var(--color-ink)] text-[var(--color-ink)] font-bold text-sm">Pause</button>}
        </div>
      </div>

      <div className="space-y-2">
        {block.exercises.map((be, i) => (
          <ExerciseChecklistRow
            key={i}
            be={be}
            ex={exById.get(be.exerciseId)}
            done={false}
            onToggle={() => { /* EMOM is round-based; no per-set toggle */ haptic('tap') }}
          />
        ))}
      </div>
    </div>
  )
}

// ---------- TABATA ----------
function TabataRun({ block, exById }: BlockRunInner) {
  const work = block.workSec ?? 20
  const rest = block.restSec ?? 10
  const totalRounds = block.rounds ?? 8
  const [running, setRunning] = useState(false)
  const [round, setRound] = useState(1)
  const [phase, setPhase] = useState<'work' | 'rest'>('work')
  const { remaining, expired } = useCountdown(phase === 'work' ? work : rest, running)
  const finished = round > totalRounds

  useEffect(() => {
    if (expired && running && !finished) {
      haptic('chime')
      sound.ding()
      if (phase === 'work') {
        setPhase('rest')
        setRunning(false); setTimeout(() => setRunning(true), 50)
      } else {
        // Rest finished
        if (round + 1 > totalRounds) {
          setRunning(false)
          toast.pr('Tabata complete', `${totalRounds} rounds`)
        } else {
          setRound((r) => r + 1)
          setPhase('work')
          setRunning(false); setTimeout(() => setRunning(true), 50)
        }
      }
    }
  }, [expired, running, phase, round, totalRounds, finished])

  return (
    <div className="px-4 py-4 space-y-3">
      <div className={`p-5 text-center rounded-3xl ${phase === 'work' ? 'card-accent' : 'card-paper'}`}>
        <div className="eyebrow opacity-80">{phase === 'work' ? 'WORK' : 'REST'} · Round {round}/{totalRounds}</div>
        <div className="display-num mt-1" style={{ fontSize: 'clamp(56px, 18vw, 84px)' }}>
          {formatMMSS(remaining)}
        </div>
        <div className="text-xs font-bold uppercase tracking-wider opacity-80 mt-1">
          {finished ? 'Done' : running ? phase : 'Paused'}
        </div>
        <div className="mt-3 flex gap-2 justify-center">
          {!running && !finished && (
            <button onClick={() => setRunning(true)} className="px-6 py-2.5 rounded-full bg-black/30 backdrop-blur text-white font-bold text-sm active:scale-95">
              Start
            </button>
          )}
          {running && <button onClick={() => setRunning(false)} className="px-6 py-2.5 rounded-full bg-black/30 backdrop-blur text-white font-bold text-sm">Pause</button>}
        </div>
      </div>

      <div className="space-y-2">
        {block.exercises.map((be, i) => (
          <ExerciseChecklistRow key={i} be={be} ex={exById.get(be.exerciseId)} done={false} onToggle={() => haptic('tap')} />
        ))}
      </div>
    </div>
  )
}

// ---------- FOR TIME (stopwatch) ----------
function ForTimeRun({ block, session, exById }: BlockRunInner) {
  const [running, setRunning] = useState(false)
  const elapsed = useStopwatch(running)
  const cap = block.timeCapSec
  const [done, setDone] = useState(false)

  function finish() {
    setRunning(false)
    setDone(true)
    haptic('success')
    sound.fanfare()
    toast.pr('Time!', formatMMSS(elapsed))
    void recordFinish({ sessionId: session.id!, blockId: block.id, elapsedSec: Math.round(elapsed) })
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="card-paper p-5 text-center">
        <div className="eyebrow text-[var(--color-ink-dim)]">For Time</div>
        <div className="display-num mt-1" style={{ fontSize: 'clamp(56px, 18vw, 84px)', color: cap && elapsed > cap ? 'var(--color-accent)' : 'var(--color-ink)' }}>
          {formatMMSS(elapsed)}
        </div>
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-ink-dim)] mt-1">
          {done ? 'Finished' : running ? 'Running' : 'Paused'}
          {cap ? ` · cap ${formatMMSS(cap)}` : ''}
        </div>
        <div className="mt-3 flex gap-2 justify-center">
          {!running && !done && (
            <button onClick={() => setRunning(true)} className="px-6 py-2.5 rounded-full bg-[var(--color-ink)] text-white font-bold text-sm active:scale-95">
              {elapsed > 0 ? 'Resume' : 'Start'}
            </button>
          )}
          {running && <button onClick={() => setRunning(false)} className="px-6 py-2.5 rounded-full bg-transparent border-2 border-[var(--color-ink)] text-[var(--color-ink)] font-bold text-sm">Pause</button>}
          {(running || elapsed > 0) && !done && (
            <button onClick={finish} className="px-6 py-2.5 rounded-full bg-[var(--color-accent)] text-white font-bold text-sm">Done!</button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {block.exercises.map((be, i) => (
          <ExerciseChecklistRow key={i} be={be} ex={exById.get(be.exerciseId)} done={false} onToggle={() => haptic('tap')} />
        ))}
      </div>
    </div>
  )
}

// ---------- INTERVAL ----------
function IntervalRun(props: BlockRunInner) {
  return <TabataRun {...props} />  // same machinery, different defaults
}

// ---------- STANDARD / CIRCUIT / SUPERSET ----------
function StandardRun({ block, session, exById }: BlockRunInner) {
  // For straight sets, use a simple inline log: weight & reps per set, tap to mark complete.
  return (
    <div className="px-4 py-3 space-y-3">
      {block.exercises.map((be, i) => (
        <StandardExerciseLog key={i} block={block} blockExercise={be} session={session} ex={exById.get(be.exerciseId)} />
      ))}
    </div>
  )
}

function StandardExerciseLog({ block, blockExercise, session, ex }: {
  block: WorkoutBlock
  blockExercise: BlockExercise
  session: WorkoutSession
  ex?: Exercise
}) {
  const settings = useLiveQuery(() => getSettings(), [])
  const units = settings?.units ?? 'imperial'
  const sets = useLiveQuery<WorkoutSet[]>(
    () => db.workoutSets
      .where('sessionId').equals(session.id!)
      .filter((s) => s.blockId === block.id && s.exerciseId === blockExercise.exerciseId)
      .toArray(),
    [session.id, block.id, blockExercise.exerciseId],
  )
  const [lastSet, setLastSet] = useState<WorkoutSet | undefined>()

  useEffect(() => {
    let cancel = false
    getLastSet(blockExercise.exerciseId, session.id).then((s) => { if (!cancel) setLastSet(s) })
    return () => { cancel = true }
  }, [blockExercise.exerciseId, session.id])

  const targetSets = blockExercise.sets ?? 3
  const slots = Array.from({ length: Math.max(targetSets, (sets ?? []).length) }, (_, i) => i + 1)

  if (!ex) {
    return (
      <div className="bg-[var(--color-surface-2)] rounded-2xl p-3 border border-[var(--color-border)] text-[var(--color-text-faint)] text-sm">
        (exercise deleted)
      </div>
    )
  }

  return (
    <div className="bg-[var(--color-surface-2)] rounded-2xl p-3 border border-[var(--color-border)]">
      <div className="font-bold tracking-tight mb-1">{ex.name}</div>
      <div className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wider mb-2">
        Target: {blockExercise.sets ?? 3} × {blockExercise.reps ?? 8}
      </div>
      <div className="space-y-2">
        {slots.map((idx) => {
          const cur = (sets ?? []).find((s) => s.setIndex === idx)
          return (
            <SetLogger
              key={idx}
              idx={idx}
              exercise={ex}
              blockExercise={blockExercise}
              lastSet={lastSet}
              current={cur}
              units={units}
              onDelete={cur ? () => removeSet(cur.id!) : undefined}
              onSet={async (values, completed) => {
                const res = await logSet({
                  sessionId: session.id!,
                  blockId: block.id,
                  blockExerciseId: blockExercise.id,
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
                if (res.isPr) {
                  toast.pr('🏆 NEW PR', ex.name)
                  haptic('success')
                  const s = await getSettings()
                  if (s.soundOn) sound.fanfare()
                } else if (completed) {
                  haptic('success')
                  const s = await getSettings()
                  if (s.soundOn) sound.tick()
                }
                return { isPr: res.isPr }
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

// ---------- SHARED ----------
interface BlockRunInner {
  block: WorkoutBlock
  session: WorkoutSession
  allSets: WorkoutSet[]
  exById: Map<number, Exercise>
}

function ExerciseChecklistRow({ be, ex, done, highlight, onToggle }: {
  be: BlockExercise
  ex?: Exercise
  done: boolean
  highlight?: boolean
  onToggle: () => void
}) {
  const label = formatPrescription(be)
  return (
    <button
      onClick={onToggle}
      className={`w-full text-left rounded-2xl p-3 transition-all flex items-center gap-3 ${
        done
          ? 'bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/40'
          : highlight
            ? 'bg-[var(--color-surface-2)] border-2 border-[var(--color-accent)]/60'
            : 'bg-[var(--color-surface-2)] border border-[var(--color-border)]'
      } active:scale-[0.99]`}
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold border ${
        done ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white' : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
      }`}>
        {done ? '✓' : ''}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold tracking-tight truncate">{ex?.name ?? be.notes ?? '(exercise)'}</div>
        <div className="text-[11px] text-[var(--color-text-dim)] tabnum">{label}</div>
      </div>
    </button>
  )
}

function formatPrescription(be: BlockExercise): string {
  const parts: string[] = []
  if (be.reps != null) parts.push(`${be.reps} reps`)
  if (be.repsText) parts.push(be.repsText)
  if (be.weight) parts.push(`${be.weight} lb`)
  if (be.durationSec) parts.push(formatMMSS(be.durationSec))
  if (be.distanceM) parts.push(`${be.distanceM}m`)
  if (be.calories) parts.push(`${be.calories} cal`)
  return parts.join(' · ') || '—'
}

