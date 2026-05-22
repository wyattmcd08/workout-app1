import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, BLOCK_TYPE_LABELS, BLOCK_FORMAT_LABELS, MUSCLE_LABELS, CATEGORY_LABELS, getSettings, type WorkoutSession, type WorkoutBlock, type BlockExercise, type Exercise, type WorkoutSet, type ExerciseCategory } from '../db'
import { useBlockEngine, formatMMSS, profileForFormat } from '../services/workoutEngine'
import { setBlockProgress, endSession, discardSession } from '../services/sessions'
import { recordRound, recordFinish } from '../services/rounds'
import { logSet } from '../services/sets'
import { updateWorkout } from '../services/workouts'
import { getLastSessionSets } from '../lib/workout'
import { haptic } from '../lib/haptic'
import { sound } from '../lib/sound'
import { toast } from '../lib/toast'
import { SetRow } from '../components/SetRow'
import { useWakeLock } from '../lib/useWakeLock'
import { useLongPress } from '../lib/useLongPress'
import { useKeyboardAware } from '../lib/useKeyboardAware'
import { useDragReorder } from '../lib/useDragReorder'
import { Sheet } from '../components/Sheet'
import { ExerciseActionSheet, type ExerciseAction } from '../components/ExerciseActionSheet'
import { RestTimerPill } from '../components/RestTimerPill'
import { WorkoutSummary } from '../components/WorkoutSummary'

interface Props {
  session: WorkoutSession
  blocks: WorkoutBlock[]
  onExit: () => void
}

// Full-screen, immersive active-workout experience. No tab bar.
// Block-by-block walk-through driven entirely by the workout engine.
export function FocusMode({ session, blocks, onExit }: Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [restSec, setRestSec] = useState<number | null>(null)
  const [summaryFor, setSummaryFor] = useState<WorkoutSession | null>(null)
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const exById = new Map((exercises ?? []).map((e) => [e.id!, e]))
  // Live session sets for header calorie / volume estimate
  const sessionSets = useLiveQuery<WorkoutSet[]>(
    () => db.workoutSets.where('sessionId').equals(session.id!).toArray(),
    [session.id],
  )

  useWakeLock(true)
  useKeyboardAware(true)

  const block = blocks[activeIdx]
  if (!block) {
    return null
  }

  function startRest(sec: number) {
    if (sec > 0) {
      setRestSec(sec)
      haptic('chime')
    }
  }

  async function finishWorkout() {
    haptic('success')
    await endSession(session.id!)
    const fresh = await db.workoutSessions.get(session.id!)
    if (fresh) setSummaryFor(fresh)
    else onExit()
  }

  function next() {
    if (activeIdx < blocks.length - 1) {
      setActiveIdx((i) => i + 1)
      haptic('tap')
    } else {
      finishWorkout()
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

  // Live header stats
  const completed = (sessionSets ?? []).filter((s) => s.completed === 1)
  const liveVolume = completed.reduce((acc, s) => (s.kind === 'set' || !s.kind) ? acc + (s.weight ?? 0) * (s.reps ?? 0) : acc, 0)

  return (
    <div className="fixed inset-0 z-50 bg-[var(--color-bg)] flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Sticky top header — workout title, live timer, live calories, finish */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
        <button
          onClick={discard}
          aria-label="Exit workout"
          className="w-9 h-9 flex items-center justify-center rounded-full text-[var(--color-text-faint)] active:bg-[var(--color-surface-2)]"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6L18 18M18 6L6 18"/></svg>
        </button>
        <div className="flex-1 min-w-0 text-center">
          <div className="display text-white truncate" style={{ fontSize: 15 }}>{session.name}</div>
          <div className="flex items-baseline justify-center gap-3 mt-0.5">
            <SessionElapsed startedAt={session.startedAt} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">·</span>
            <LiveCalories startedAt={session.startedAt} volume={liveVolume} />
          </div>
        </div>
        <button
          onClick={finishWorkout}
          className="px-3 py-1.5 rounded-full bg-[var(--color-accent)] text-white text-xs font-bold uppercase tracking-wider shadow-[0_4px_14px_-4px_var(--color-accent)] active:scale-95 transition-transform"
        >Finish</button>
      </div>

      {/* Block-progress indicator strip */}
      {blocks.length > 1 && (
        <div className="px-3 py-2 flex gap-1 border-b border-[var(--color-border)]">
          {blocks.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={`flex-1 h-1 rounded-full transition-colors ${
                i === activeIdx ? 'bg-[var(--color-accent)]' :
                i < activeIdx ? 'bg-[var(--color-accent)]/40' :
                'bg-[var(--color-surface-3)]'
              }`}
              aria-label={`Jump to block ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Block content */}
      <div className="flex-1 overflow-y-auto">
        <BlockFocus block={block} session={session} exById={exById} onComplete={next} onSetCompleted={startRest} />
      </div>

      {/* Bottom nav — block navigation */}
      <div className="px-4 py-3 flex gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg)]">
        {activeIdx > 0 && (
          <button onClick={prev} className="flex-1 py-3 rounded-2xl border-2 border-[var(--color-border)] text-[var(--color-text-dim)] font-bold text-sm uppercase tracking-wider active:scale-[0.97] transition-transform">
            ← Previous
          </button>
        )}
        <button onClick={next} className="flex-1 py-3 rounded-2xl bg-[var(--color-accent)] text-white font-bold text-sm uppercase tracking-wider shadow-[0_8px_24px_-12px_var(--color-accent)] active:scale-[0.97] transition-transform">
          {activeIdx < blocks.length - 1 ? 'Next block →' : 'Finish workout'}
        </button>
      </div>

      {restSec != null && (
        <RestTimerPill initialSec={restSec} onClose={() => setRestSec(null)} />
      )}

      {summaryFor && (
        <WorkoutSummary
          session={summaryFor}
          onClose={() => {
            setSummaryFor(null)
            onExit()
          }}
        />
      )}
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
    <span className="display-num text-[var(--color-accent)] tabnum" style={{ fontSize: 13 }}>{formatMMSS(sec)}</span>
  )
}

function LiveCalories({ startedAt, volume }: { startedAt: number; volume: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(i)
  }, [])
  const minutes = Math.max(1, Math.round((now - startedAt) / 60000))
  // Rough: 5 kcal/min for moderate strength, +0.0003 kcal per lb·rep
  const kcal = Math.round(minutes * 5 + volume * 0.0003)
  return (
    <span className="tabnum text-[var(--color-text-dim)]" style={{ fontSize: 12, fontWeight: 700 }}>~{kcal} kcal</span>
  )
}

// ---------- BLOCK FOCUS ----------
function BlockFocus({ block, session, exById, onComplete, onSetCompleted }: {
  block: WorkoutBlock
  session: WorkoutSession
  exById: Map<number, Exercise>
  onComplete: () => void
  onSetCompleted?: (restSec: number) => void
}) {
  const profile = profileForFormat(block.format)

  if (!profile.hasCountdown && block.format === 'standard') {
    return <StandardFocus block={block} session={session} exById={exById} onSetCompleted={onSetCompleted} />
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

// ---------- STANDARD (straight sets) — Fitbod-style ----------
function StandardFocus({ block, session, exById, onSetCompleted }: { block: WorkoutBlock; session: WorkoutSession; exById: Map<number, Exercise>; onSetCompleted?: (restSec: number) => void }) {
  const settings = useLiveQuery(() => getSettings(), [])
  const units = settings?.units ?? 'imperial'
  const [pickerOpen, setPickerOpen] = useState(false)
  const [replacingIdx, setReplacingIdx] = useState<number | null>(null)
  const [actionFor, setActionFor] = useState<number | null>(null)
  const [noteFor, setNoteFor] = useState<number | null>(null)
  const [insertedIds, setInsertedIds] = useState<Set<string>>(new Set())

  async function patchBlockExercises(mutator: (xs: BlockExercise[]) => BlockExercise[]) {
    if (!session.templateId) return
    const t = await db.workoutTemplates.get(session.templateId)
    if (!t) return
    const newBlocks = (t.blocks ?? []).map((b) => (
      b.id === block.id ? { ...b, exercises: mutator(b.exercises) } : b
    ))
    await updateWorkout(session.templateId, { blocks: newBlocks })
  }

  async function addExerciseToBlock(exerciseIds: number[]) {
    const newBeIds: string[] = []
    await patchBlockExercises((xs) => {
      const toAdd = exerciseIds.map((id) => {
        const beId = Math.random().toString(36).slice(2, 10)
        newBeIds.push(beId)
        return { id: beId, exerciseId: id, sets: 3, reps: 8 }
      })
      return [...xs, ...toAdd]
    })
    // Mark these as just-inserted so the card animates in
    setInsertedIds((cur) => new Set([...cur, ...newBeIds]))
    setTimeout(() => {
      setInsertedIds((cur) => {
        const next = new Set(cur)
        for (const id of newBeIds) next.delete(id)
        return next
      })
    }, 600)
    setPickerOpen(false)
    haptic('success')
    toast.show({ title: `Added ${exerciseIds.length} exercise${exerciseIds.length === 1 ? '' : 's'}`, variant: 'success' })
  }

  async function replaceExercise(idx: number, newId: number) {
    await patchBlockExercises((xs) => xs.map((be, i) => i === idx ? { ...be, exerciseId: newId } : be))
    setReplacingIdx(null)
    haptic('success')
    toast.show({ title: 'Exercise replaced', variant: 'success' })
  }

  async function duplicateExercise(idx: number) {
    await patchBlockExercises((xs) => {
      const copy = { ...xs[idx], id: Math.random().toString(36).slice(2, 10) }
      return [...xs.slice(0, idx + 1), copy, ...xs.slice(idx + 1)]
    })
    haptic('tap')
    toast.show({ title: 'Duplicated', variant: 'success' })
  }

  async function removeExercise(idx: number) {
    const be = block.exercises[idx]
    if (!confirm(`Remove ${exById.get(be.exerciseId)?.name ?? 'this exercise'} from this workout?`)) return
    await patchBlockExercises((xs) => xs.filter((_, i) => i !== idx))
    // Also clean up any logged sets for this BlockExercise
    if (be.id) {
      await db.workoutSets.where('sessionId').equals(session.id!).filter((s) => s.blockExerciseId === be.id).delete()
    }
    haptic('tap')
    toast.show({ title: 'Removed', variant: 'default' })
  }

  async function moveExercise(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= block.exercises.length) return
    await patchBlockExercises((xs) => {
      const out = [...xs]
      ;[out[idx], out[j]] = [out[j], out[idx]]
      return out
    })
    haptic('tap')
  }

  return (
    <div className="px-4 py-4 pb-32 space-y-3">
      <BlockHeader block={block} />
      {block.exercises.length === 0 ? (
        <div className="card p-6 text-center">
          <div className="text-sm text-[var(--color-text-dim)] mb-3">No exercises yet.</div>
          <button
            onClick={() => setPickerOpen(true)}
            className="px-5 py-2.5 rounded-full bg-[var(--color-accent)] text-white font-bold text-sm shadow-[0_8px_24px_-12px_var(--color-accent)] active:scale-95 transition-transform"
          >+ Add exercise</button>
        </div>
      ) : (
        <DraggableExerciseList
          block={block}
          exById={exById}
          session={session}
          units={units}
          insertedIds={insertedIds}
          onCommitOrder={(newExercises) => patchBlockExercises(() => newExercises)}
          onOpenActions={(absIdx) => setActionFor(absIdx)}
          onReplace={(absIdx) => setReplacingIdx(absIdx)}
          onSetCompleted={onSetCompleted}
        />
      )}

      {/* Floating "+ Exercise" button just above the block-navigation bar */}
      <button
        onClick={() => setPickerOpen(true)}
        className="fixed right-4 z-30 px-4 py-2.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-bold uppercase tracking-wider active:scale-95 transition-transform shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)] backdrop-blur"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 78px)' }}
      >+ Exercise</button>

      {pickerOpen && (
        <ExercisePickerSheet
          excludeIds={block.exercises.map((e) => e.exerciseId)}
          onConfirm={addExerciseToBlock}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {replacingIdx !== null && (
        <ExercisePickerSheet
          title="Replace with"
          excludeIds={block.exercises.map((e) => e.exerciseId)}
          singleSelect
          onConfirm={(ids) => ids[0] && replaceExercise(replacingIdx, ids[0])}
          onClose={() => setReplacingIdx(null)}
        />
      )}
      {actionFor !== null && (() => {
        const idx = actionFor
        const be = block.exercises[idx]
        const ex = exById.get(be?.exerciseId)
        if (!ex) return null
        const actions: ExerciseAction[] = [
          { label: be.notes ? 'Edit notes' : 'Add notes', onClick: () => setNoteFor(idx), icon: '✎' },
          { label: 'Replace exercise',  onClick: () => setReplacingIdx(idx),  icon: '↔' },
          { label: 'Duplicate',         onClick: () => duplicateExercise(idx), icon: '⧉' },
          { label: 'Move up',           onClick: () => moveExercise(idx, -1),  icon: '↑', disabled: idx === 0 },
          { label: 'Move down',         onClick: () => moveExercise(idx, +1),  icon: '↓', disabled: idx === block.exercises.length - 1 },
          { label: 'Remove from workout', onClick: () => removeExercise(idx), icon: '×', danger: true },
        ]
        return (
          <ExerciseActionSheet
            open
            title={ex.name}
            subtitle={MUSCLE_LABELS[ex.primary]}
            actions={actions}
            onClose={() => setActionFor(null)}
          />
        )
      })()}

      {noteFor !== null && (() => {
        const idx = noteFor
        const be = block.exercises[idx]
        const ex = exById.get(be?.exerciseId)
        if (!ex) return null
        return (
          <NoteEditor
            title={ex.name}
            initial={be.notes ?? ''}
            onSave={async (note) => {
              await patchBlockExercises((xs) => xs.map((b, i) => i === idx ? { ...b, notes: note.trim() || undefined } : b))
              setNoteFor(null)
              haptic('success')
              toast.show({ title: note.trim() ? 'Notes saved' : 'Notes cleared', variant: 'success' })
            }}
            onClose={() => setNoteFor(null)}
          />
        )
      })()}
    </div>
  )
}

function NoteEditor({ title, initial, onSave, onClose }: {
  title: string
  initial: string
  onSave: (note: string) => void
  onClose: () => void
}) {
  const [note, setNote] = useState(initial)
  return (
    <Sheet open title={`Notes · ${title}`} onClose={onClose}>
      <div className="p-4 space-y-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Cues, form notes, what felt off…"
          autoFocus
          rows={5}
          className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)] resize-none outline-none"
        />
        <button
          onClick={() => onSave(note)}
          className="w-full py-3.5 rounded-2xl bg-[var(--color-accent)] text-white font-bold uppercase tracking-wider text-sm shadow-[0_8px_24px_-12px_var(--color-accent)] active:scale-[0.98] transition-transform"
        >Save notes</button>
      </div>
    </Sheet>
  )
}

// ---------- DRAGGABLE EXERCISE LIST ----------
function DraggableExerciseList({ block, exById, session, units, insertedIds, onCommitOrder, onOpenActions, onReplace, onSetCompleted }: {
  block: WorkoutBlock
  exById: Map<number, Exercise>
  session: WorkoutSession
  units: 'imperial' | 'metric'
  insertedIds: Set<string>
  onCommitOrder: (next: BlockExercise[]) => Promise<void>
  onOpenActions: (absIdx: number) => void
  onReplace: (absIdx: number) => void
  onSetCompleted?: (restSec: number) => void
}) {
  const { draggingId, dragY, displayed, bindHandle, registerEl } = useDragReorder<BlockExercise>({
    items: block.exercises,
    getId: (be) => be.id ?? `${be.exerciseId}`,
    onCommit: onCommitOrder,
  })

  return (
    <div className="space-y-3">
      {displayed.map((be) => {
        const ex = exById.get(be.exerciseId)
        if (!ex) return null
        const id = be.id ?? `${be.exerciseId}`
        const isDragging = draggingId === id
        // Find this card's absolute index in the ORIGINAL block.exercises (for actions)
        const absIdx = block.exercises.findIndex((x) => (x.id ?? `${x.exerciseId}`) === id)
        return (
          <div
            key={id}
            ref={(el) => registerEl(id, el)}
            className={insertedIds.has(id) ? 'animate-card-insert' : ''}
            style={{
              transform: isDragging ? `translateY(${dragY}px) scale(1.02)` : undefined,
              boxShadow: isDragging ? '0 16px 40px -8px rgba(0,0,0,0.5)' : undefined,
              opacity: isDragging ? 0.95 : 1,
              transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
              zIndex: isDragging ? 20 : 'auto',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <ExerciseCard
              block={block}
              blockExerciseIdx={absIdx >= 0 ? absIdx : 0}
              session={session}
              ex={ex}
              units={units}
              onOpenActions={() => onOpenActions(absIdx)}
              onSetCompleted={onSetCompleted}
              onReplace={() => onReplace(absIdx)}
              dragHandleBind={bindHandle(id)}
            />
          </div>
        )
      })}
    </div>
  )
}

// ---------- EXERCISE CARD — Fitbod-style with PREVIOUS column ----------
function ExerciseCard({ block, blockExerciseIdx, session, ex, units, onOpenActions, onSetCompleted, onReplace, dragHandleBind }: {
  block: WorkoutBlock
  blockExerciseIdx: number
  session: WorkoutSession
  ex: Exercise
  units: 'imperial' | 'metric'
  onOpenActions: () => void
  onSetCompleted?: (restSec: number) => void
  onReplace?: () => void
  dragHandleBind?: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchMove: (e: React.TouchEvent) => void
    onTouchEnd: (e: React.TouchEvent) => void
    onTouchCancel: (e: React.TouchEvent) => void
  }
}) {
  const be = block.exercises[blockExerciseIdx]
  const sets = useLiveQuery<WorkoutSet[]>(
    () => db.workoutSets
      .where('sessionId').equals(session.id!)
      .filter((s) => s.blockId === block.id && (be.id ? s.blockExerciseId === be.id : s.exerciseId === be.exerciseId))
      .toArray(),
    [session.id, block.id, be.id, be.exerciseId],
  )
  const [extraSlots, setExtraSlots] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [lastSessionSets, setLastSessionSets] = useState<WorkoutSet[]>([])

  // Load previous session's sets for PREVIOUS column
  useEffect(() => {
    let cancel = false
    getLastSessionSets(ex.id!, session.id).then((res) => {
      if (cancel) return
      setLastSessionSets(res?.sets ?? [])
    })
    return () => { cancel = true }
  }, [ex.id, session.id])

  const targetSets = be.sets ?? 3
  const maxExisting = (sets ?? []).reduce((m, s) => Math.max(m, s.setIndex), 0)
  const total = Math.max(targetSets, maxExisting) + extraSlots
  const slots = Array.from({ length: total }, (_, i) => i + 1)

  // Determine "active" set (first incomplete)
  const completedIndices = new Set((sets ?? []).filter((s) => s.completed === 1).map((s) => s.setIndex))
  const activeIdx = slots.find((idx) => !completedIndices.has(idx))

  const longPress = useLongPress({
    onLongPress: () => { haptic('chime'); onOpenActions() },
    ms: 450,
  })

  const lastBySetIdx = new Map<number, WorkoutSet>()
  for (const s of lastSessionSets) lastBySetIdx.set(s.setIndex, s)

  return (
    <div className="card overflow-hidden">
      {/* Header — tap to collapse, long-press for actions */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--color-border)]">
        <div
          {...longPress}
          onClick={() => setCollapsed((c) => !c)}
          className="flex-1 min-w-0 cursor-pointer select-none"
        >
          <div className="display text-white truncate" style={{ fontSize: 18 }}>{ex.name}</div>
          <div className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wider mt-0.5">
            {MUSCLE_LABELS[ex.primary]}
            {ex.category && ex.category !== 'other' ? ` · ${CATEGORY_LABELS[ex.category]}` : ''}
          </div>
        </div>
        {/* Drag-reorder handle */}
        {dragHandleBind && (
          <button
            {...dragHandleBind}
            aria-label="Drag to reorder"
            className="w-9 h-9 flex items-center justify-center text-[var(--color-text-faint)] active:bg-[var(--color-surface-2)] rounded-full touch-none"
            style={{ touchAction: 'none' }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
          </button>
        )}
        <button
          onClick={onOpenActions}
          aria-label="Exercise options"
          className="w-9 h-9 flex items-center justify-center text-[var(--color-text-dim)] active:bg-[var(--color-surface-2)] rounded-full"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 py-3">
          {/* Column headers */}
          <div className="grid items-center gap-2 mb-2 px-1" style={{ gridTemplateColumns: '28px 78px 1fr 1fr 44px' }}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] text-center">Set</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Previous</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] text-center">{units === 'metric' ? 'KG' : 'LB'}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] text-center">Reps</span>
            <span></span>
          </div>

          {/* Set rows */}
          <div className="space-y-1">
            {slots.map((idx) => {
              const cur = (sets ?? []).find((s) => s.setIndex === idx)
              const lastSet = lastBySetIdx.get(idx)
              return (
                <SetRow
                  key={idx}
                  idx={idx}
                  current={cur}
                  lastSet={lastSet}
                  prescription={{ reps: be.reps, weight: be.weight, repsText: be.repsText }}
                  units={units}
                  isActive={activeIdx === idx}
                  onDelete={cur ? () => db.workoutSets.delete(cur.id!) : undefined}
                  onReplace={onReplace}
                  onDuplicate={async () => {
                    // Insert a copy of this set right after, shifting later setIndices up.
                    if (!cur) return
                    const allLater = (sets ?? []).filter((s) => s.setIndex > idx).sort((a, b) => b.setIndex - a.setIndex)
                    for (const s of allLater) {
                      await db.workoutSets.update(s.id!, { setIndex: s.setIndex + 1 })
                    }
                    await db.workoutSets.add({
                      sessionId: session.id!,
                      blockId: block.id,
                      blockExerciseId: be.id,
                      exerciseId: ex.id!,
                      setIndex: idx + 1,
                      weight: cur.weight,
                      reps: cur.reps,
                      kind: 'set',
                      completed: 0,
                      createdAt: Date.now(),
                    })
                    setExtraSlots((n) => n + 1)
                    toast.show({ title: 'Set duplicated', variant: 'success' })
                  }}
                  onSet={async (values, completed) => {
                    const res = await logSet({
                      sessionId: session.id!,
                      blockId: block.id,
                      blockExerciseId: be.id,
                      exerciseId: ex.id!,
                      setIndex: idx,
                      weight: values.weight,
                      reps: values.reps,
                      kind: 'set',
                      completed: completed ? 1 : 0,
                    })
                    if (completed) {
                      // Auto-start rest timer (per-exercise restSec, fallback 90s)
                      onSetCompleted?.(be.restSec ?? 90)
                      if (res.isPr) {
                        toast.pr('🏆 NEW PR', ex.name)
                        const s = await getSettings()
                        if (s.soundOn) sound.fanfare()
                      }
                    }
                    return { isPr: res.isPr }
                  }}
                />
              )
            })}
          </div>

          {/* Footer — add set + previous-session strip */}
          <button
            onClick={() => { setExtraSlots((n) => n + 1); haptic('tap') }}
            className="mt-2.5 w-full py-2.5 rounded-xl border border-dashed border-[var(--color-border)] text-[var(--color-text-dim)] text-[11px] font-bold uppercase tracking-wider active:scale-[0.99] transition-transform"
          >+ Add set</button>
        </div>
      )}
    </div>
  )
}

// Categorized exercise picker with Recents / Favorites / By Category.
// `singleSelect` mode confirms immediately on first pick (used for Replace).
function ExercisePickerSheet({ excludeIds, onConfirm, onClose, title, singleSelect }: {
  excludeIds: number[]
  onConfirm: (ids: number[]) => void
  onClose: () => void
  title?: string
  singleSelect?: boolean
}) {
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<ExerciseCategory | 'all'>('all')
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const all = (exercises ?? []).filter((e) => !excludeIds.includes(e.id!))
  const qq = q.trim().toLowerCase()

  const recents = qq ? [] : all
    .filter((e) => e.lastUsedAt != null)
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
    .slice(0, 6)
  const favorites = qq ? [] : all.filter((e) => e.favorite === 1)

  const main = all
    .filter((e) => category === 'all' || e.category === category)
    .filter((e) => !qq || e.name.toLowerCase().includes(qq))
    .sort((a, b) => a.name.localeCompare(b.name))

  function pick(id: number) {
    if (singleSelect) {
      onConfirm([id])
      return
    }
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    haptic('tap')
  }

  return (
    <Sheet open title={title ?? `Add exercises${selected.size > 0 ? ` (${selected.size})` : ''}`} onClose={onClose} fullHeight>
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-[var(--color-border)] space-y-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search exercises..."
            autoFocus
            className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)] outline-none"
          />
          {/* Category pills */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
            <CategoryPill active={category === 'all'} onClick={() => setCategory('all')}>All</CategoryPill>
            {(Object.keys(CATEGORY_LABELS) as ExerciseCategory[]).map((c) => (
              <CategoryPill key={c} active={category === c} onClick={() => setCategory(c)}>{CATEGORY_LABELS[c]}</CategoryPill>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {favorites.length > 0 && (
            <PickerSection title="Favorites">
              {favorites.map((e) => (
                <PickerRow key={e.id} ex={e} selected={selected.has(e.id!)} singleSelect={singleSelect} onClick={() => pick(e.id!)} />
              ))}
            </PickerSection>
          )}
          {recents.length > 0 && (
            <PickerSection title="Recent">
              {recents.map((e) => (
                <PickerRow key={e.id} ex={e} selected={selected.has(e.id!)} singleSelect={singleSelect} onClick={() => pick(e.id!)} />
              ))}
            </PickerSection>
          )}
          <PickerSection title={qq ? `Results (${main.length})` : (category === 'all' ? 'All exercises' : CATEGORY_LABELS[category])}>
            {main.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--color-text-dim)]">
                {(exercises ?? []).length === 0 ? 'No exercises yet — add some in the Library.' : 'No matches.'}
              </div>
            ) : main.map((e) => (
              <PickerRow key={e.id} ex={e} selected={selected.has(e.id!)} singleSelect={singleSelect} onClick={() => pick(e.id!)} />
            ))}
          </PickerSection>
        </div>
        {!singleSelect && selected.size > 0 && (
          <div className="p-4 border-t border-[var(--color-border)]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
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

function CategoryPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors ${
        active ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white' : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
      }`}
    >{children}</button>
  )
}

function PickerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-4 pt-4 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-faint)]">{title}</div>
      {children}
    </div>
  )
}

function PickerRow({ ex, selected, singleSelect, onClick }: { ex: Exercise; selected: boolean; singleSelect?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between ${
        selected ? 'bg-[var(--color-accent-soft)]' : 'active:bg-[var(--color-surface-2)]'
      }`}
    >
      <div className="min-w-0 flex items-baseline gap-2">
        {ex.favorite === 1 && <span className="text-[var(--color-accent)] text-xs">★</span>}
        <div className="min-w-0">
          <div className="font-medium truncate">{ex.name}</div>
          <div className="text-[11px] text-[var(--color-text-faint)]">
            {MUSCLE_LABELS[ex.primary]}{ex.equipment ? ` · ${ex.equipment}` : ''}
          </div>
        </div>
      </div>
      {!singleSelect && (
        <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 text-xs font-bold flex-shrink-0 ${
          selected ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white' : 'border-[var(--color-border)] text-transparent'
        }`}>✓</div>
      )}
    </button>
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
