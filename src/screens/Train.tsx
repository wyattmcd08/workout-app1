import { useState, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, MUSCLE_LABELS, getSettings, type MuscleGroup, type Exercise, type WorkoutTemplate, type TemplateExercise, type WorkoutSet, type WorkoutSession } from '../db'
import { today } from '../lib/date'
import { estimated1RM } from '../lib/format'
import { detectPr, formatPr } from '../lib/pr'
import { getLastSessionSets, getExerciseHistory, formatLastSession } from '../lib/workout'
import { haptic } from '../lib/haptic'
import { sound } from '../lib/sound'
import { toast } from '../lib/toast'
import { Header, Segmented } from '../components/Header'
import { Card, Stat } from '../components/Card'
import { Sheet } from '../components/Sheet'
import { Field, Select } from '../components/Field'
import { PrimaryButton } from '../components/PrimaryButton'
import { Spark } from '../components/Spark'
import { EmptyState, EmptyIcons } from '../components/EmptyState'

type View = 'today' | 'split' | 'progress'

export function Train() {
  const [view, setView] = useState<View>('today')
  return (
    <div className="pb-32">
      <Header title="Workout" subtitle="Train hard" />
      <div className="px-4 mb-3">
        <Segmented<View>
          options={[
            { value: 'today', label: "Today" },
            { value: 'split', label: 'Split' },
            { value: 'progress', label: 'Progress' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'today' && <TodayWorkout />}
      {view === 'split' && <SplitPlanner />}
      {view === 'progress' && <Progression />}
    </div>
  )
}

// ---------- TODAY'S WORKOUT ----------
function TodayWorkout() {
  const todayISO = today()
  const session = useLiveQuery(() => db.workoutSessions.where('date').equals(todayISO).first(), [todayISO])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const templates = useLiveQuery(() => db.workoutTemplates.orderBy('order').toArray(), [])
  const templateExercises = useLiveQuery<TemplateExercise[]>(
    () => session?.templateId
      ? db.templateExercises.where('templateId').equals(session.templateId).sortBy('order')
      : Promise.resolve<TemplateExercise[]>([]),
    [session?.templateId],
  )
  const sets = useLiveQuery<WorkoutSet[]>(
    () => session
      ? db.workoutSets.where('sessionId').equals(session.id!).toArray()
      : Promise.resolve<WorkoutSet[]>([]),
    [session?.id],
  )

  const [pickTemplateOpen, setPickTemplateOpen] = useState(false)
  const [addExerciseOpen, setAddExerciseOpen] = useState(false)
  const [timerSec, setTimerSec] = useState<number | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)

  async function startEmpty() {
    await db.workoutSessions.add({
      date: todayISO,
      name: 'Workout',
      startedAt: Date.now(),
    })
    haptic('success')
    toast.show({ title: 'Session started', variant: 'success' })
  }

  async function startFromTemplate(t: WorkoutTemplate) {
    await db.workoutSessions.add({
      date: todayISO,
      templateId: t.id,
      name: t.name,
      startedAt: Date.now(),
    })
    setPickTemplateOpen(false)
    haptic('success')
    toast.show({ title: `Started: ${t.name}`, variant: 'success' })
  }

  async function endSession() {
    if (!session) return
    await db.workoutSessions.update(session.id!, { endedAt: Date.now() })
    setSummaryOpen(true)
    haptic('success')
  }

  async function discardSession() {
    if (!session || !confirm('Discard this session and all logged sets?')) return
    await db.workoutSets.where('sessionId').equals(session.id!).delete()
    await db.workoutSessions.delete(session.id!)
  }

  if (!session) {
    return (
      <div className="px-4 space-y-3">
        <Card padded>
          <EmptyState
            icon={EmptyIcons.dumbbell}
            title="READY TO LIFT"
            body="Run a split template, or start an empty workout and add exercises as you go."
            action={
              <div className="flex flex-col gap-2 w-full max-w-xs">
                <PrimaryButton onClick={() => setPickTemplateOpen(true)} size="lg">From split template</PrimaryButton>
                <PrimaryButton onClick={startEmpty} variant="ghost" size="lg">Empty workout</PrimaryButton>
              </div>
            }
          />
        </Card>
        <Sheet open={pickTemplateOpen} title="Pick template" onClose={() => setPickTemplateOpen(false)}>
          <div className="p-4 space-y-2">
            {(templates ?? []).length === 0 && (
              <EmptyState
                icon={EmptyIcons.dumbbell}
                title="No templates yet"
                body="Build your split in the Split tab — push, pull, legs, whatever you run."
                compact
              />
            )}
            {(templates ?? []).map((t) => (
              <button
                key={t.id}
                onClick={() => startFromTemplate(t)}
                className="w-full bg-[var(--color-surface-2)] rounded-xl p-4 text-left active:scale-[0.99] transition-transform border border-[var(--color-border)]"
              >
                <div className="font-bold tracking-tight">{t.name}</div>
                {t.dayLabel && <div className="text-xs text-[var(--color-text-faint)] mt-0.5">{t.dayLabel}</div>}
              </button>
            ))}
          </div>
        </Sheet>
      </div>
    )
  }

  const exById = new Map((exercises ?? []).map((e) => [e.id!, e]))
  const setsByExercise = new Map<number, WorkoutSet[]>()
  for (const s of sets ?? []) {
    const arr = setsByExercise.get(s.exerciseId) ?? []
    arr.push(s)
    setsByExercise.set(s.exerciseId, arr)
  }

  // Use template order if present, else order by first appearance
  const exerciseOrder = (templateExercises ?? []).length > 0
    ? (templateExercises as TemplateExercise[]).map((te) => te.exerciseId)
    : Array.from(new Set((sets ?? []).map((s) => s.exerciseId)))

  return (
    <div className="px-4 space-y-3">
      <Card padded>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="eyebrow">Active session</div>
            <div className="display text-white mt-1" style={{ fontSize: 'clamp(22px, 6.5vw, 28px)' }}>{session.name}</div>
          </div>
          <Elapsed startedAt={session.startedAt} />
        </div>
      </Card>

      {exerciseOrder.map((exId) => {
        const ex = exById.get(exId)
        if (!ex) return null
        const te = (templateExercises ?? []).find((t: TemplateExercise) => t.exerciseId === exId)
        return (
          <ExerciseLog
            key={exId}
            sessionId={session.id!}
            exercise={ex}
            templateExercise={te}
            existingSets={setsByExercise.get(exId) ?? []}
            onRest={(sec) => setTimerSec(sec)}
          />
        )
      })}

      <PrimaryButton onClick={() => setAddExerciseOpen(true)} variant="ghost" size="lg">
        + Add exercise
      </PrimaryButton>

      <div className="grid grid-cols-2 gap-2">
        <PrimaryButton onClick={discardSession} variant="danger">Discard</PrimaryButton>
        <PrimaryButton onClick={endSession}>Finish</PrimaryButton>
      </div>

      <Sheet open={addExerciseOpen} title="Add exercise" onClose={() => setAddExerciseOpen(false)} fullHeight>
        <ExercisePicker
          exercises={exercises ?? []}
          onPick={async (e) => {
            await db.workoutSets.add({
              sessionId: session.id!,
              exerciseId: e.id!,
              setIndex: 1,
              weight: 0,
              reps: 0,
              completed: 0,
              createdAt: Date.now(),
            })
            setAddExerciseOpen(false)
          }}
        />
      </Sheet>

      {timerSec != null && (
        <RestTimer initialSec={timerSec} onClose={() => setTimerSec(null)} />
      )}

      {summaryOpen && session && (
        <SessionSummarySheet
          session={session}
          sets={sets ?? []}
          exercises={exercises ?? []}
          onClose={() => setSummaryOpen(false)}
        />
      )}
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
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return <div className="display-num text-[var(--color-accent)]" style={{ fontSize: 22 }}>
    {m}:{String(s).padStart(2, '0')}
  </div>
}

// ---------- EXERCISE LOG (per-exercise card) ----------
function ExerciseLog({ sessionId, exercise, templateExercise, existingSets, onRest }: {
  sessionId: number
  exercise: Exercise
  templateExercise?: TemplateExercise
  existingSets: WorkoutSet[]
  onRest: (sec: number) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [lastSession, setLastSession] = useState<{ session: WorkoutSession; sets: WorkoutSet[] } | null>(null)

  // Load previous session's sets for autofill placeholders
  useEffect(() => {
    let cancelled = false
    getLastSessionSets(exercise.id!, sessionId).then((res) => {
      if (!cancelled) setLastSession(res)
    })
    return () => { cancelled = true }
  }, [exercise.id, sessionId])

  const targetSets = templateExercise?.sets ?? Math.max(3, existingSets.length || lastSession?.sets.length || 3)
  const slots = Array.from({ length: Math.max(targetSets, existingSets.length) }, (_, i) => i + 1)

  async function setVal(idx: number, weight: number, reps: number, completed: 0 | 1): Promise<void> {
    const existing = existingSets.find((s) => s.setIndex === idx)
    if (existing && existing.id) {
      await db.workoutSets.update(existing.id, { weight, reps, completed })
    } else {
      await db.workoutSets.add({
        sessionId,
        exerciseId: exercise.id!,
        setIndex: idx,
        weight,
        reps,
        completed,
        createdAt: Date.now(),
      })
    }
  }

  async function deleteSet(idx: number) {
    const existing = existingSets.find((s) => s.setIndex === idx)
    if (existing?.id) await db.workoutSets.delete(existing.id)
  }

  // On set completion: detect PR, mark it, fire toast + haptic.
  async function onCompleteSet(idx: number, weight: number, reps: number): Promise<{ isPr: boolean }> {
    // Find or create the set first
    let existing = existingSets.find((s) => s.setIndex === idx)
    if (!existing) {
      const id = await db.workoutSets.add({
        sessionId,
        exerciseId: exercise.id!,
        setIndex: idx,
        weight,
        reps,
        completed: 1,
        createdAt: Date.now(),
      })
      existing = await db.workoutSets.get(Number(id))!
    } else {
      await db.workoutSets.update(existing.id!, { weight, reps, completed: 1 })
      existing = { ...existing, weight, reps, completed: 1 }
    }

    // PR check (history excludes this set)
    const history = await getExerciseHistory(exercise.id!, existing!.id)
    const pr = detectPr(existing as WorkoutSet, history)
    if (pr) {
      await db.workoutSets.update(existing!.id!, { isPr: 1 })
      const s = await getSettings()
      toast.pr('🏆 NEW PR', `${exercise.name} — ${formatPr(pr)}`)
      haptic('success')
      if (s.soundOn) sound.fanfare()
      return { isPr: true }
    }
    haptic('tap')
    const s = await getSettings()
    if (s.soundOn) sound.tick()
    return { isPr: false }
  }

  const lastStrip = lastSession
    ? formatLastSession(lastSession.sets, lastSession.session.date, today())
    : ''

  // Build a quick lookup of last-session sets by index for placeholders.
  const lastBySetIndex = new Map<number, WorkoutSet>()
  for (const s of lastSession?.sets ?? []) lastBySetIndex.set(s.setIndex, s)

  return (
    <Card padded={false}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex justify-between items-center border-b border-[var(--color-border)]"
      >
        <div className="min-w-0 text-left">
          <div className="font-bold tracking-tight truncate">{exercise.name}</div>
          <div className="text-xs text-[var(--color-text-faint)] mt-0.5">
            {MUSCLE_LABELS[exercise.primary]}
            {templateExercise && ` · ${templateExercise.sets} × ${templateExercise.repsLow}-${templateExercise.repsHigh}`}
          </div>
          {lastStrip && (
            <div className="text-[11px] text-[var(--color-text-dim)] mt-1 tabnum truncate">{lastStrip}</div>
          )}
        </div>
        <span className="text-[var(--color-text-faint)] text-xs ml-2">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="px-4 py-3 space-y-2">
          <div className="grid grid-cols-[28px_1fr_1fr_44px_36px] gap-2 text-[10px] uppercase text-[var(--color-text-faint)] tracking-wider">
            <span>Set</span><span>Weight</span><span>Reps</span><span></span><span></span>
          </div>
          {slots.map((idx) => {
            const ex = existingSets.find((s) => s.setIndex === idx)
            const last = lastBySetIndex.get(idx)
            return (
              <SetRow
                key={idx}
                idx={idx}
                weight={ex?.weight ?? 0}
                reps={ex?.reps ?? 0}
                completed={ex?.completed === 1}
                isPr={ex?.isPr === 1}
                lastWeight={last?.weight}
                lastReps={last?.reps}
                onSet={(w, r, c) => setVal(idx, w, r, c ? 1 : 0)}
                onComplete={onCompleteSet}
                onDelete={() => deleteSet(idx)}
                onRest={() => onRest(templateExercise?.restSec ?? 90)}
              />
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ---------- SET ROW ----------
function SetRow({ idx, weight, reps, completed, isPr, lastWeight, lastReps, onSet, onComplete, onDelete, onRest }: {
  idx: number
  weight: number
  reps: number
  completed: boolean
  isPr: boolean
  lastWeight?: number
  lastReps?: number
  onSet: (w: number, r: number, c: boolean) => void
  onComplete: (idx: number, w: number, r: number) => Promise<{ isPr: boolean }>
  onDelete: () => void
  onRest: () => void
}) {
  const [w, setW] = useState(String(weight || ''))
  const [r, setR] = useState(String(reps || ''))
  const [flash, setFlash] = useState(false)

  // Keep local state in sync if parent updates (e.g. set was just created)
  useEffect(() => { setW(String(weight || '')) }, [weight])
  useEffect(() => { setR(String(reps || '')) }, [reps])

  const wn = Number(w) || 0
  const rn = Number(r) || 0
  const oneRm = wn > 0 && rn > 0 ? estimated1RM(wn, rn) : 0

  async function toggleCompleted() {
    // When marking complete: detect PR and fire celebration.
    if (!completed) {
      const useW = wn || lastWeight || 0
      const useR = rn || lastReps || 0
      if (useW <= 0 || useR <= 0) return
      // Reflect autofill into the inputs if user hadn't typed
      if (wn === 0 && lastWeight) setW(String(lastWeight))
      if (rn === 0 && lastReps) setR(String(lastReps))
      const res = await onComplete(idx, useW, useR)
      if (res.isPr) {
        setFlash(true)
        setTimeout(() => setFlash(false), 720)
      }
      onRest()
    } else {
      onSet(wn, rn, false)
    }
  }

  function tapAutofill() {
    if (completed) return
    if (lastWeight) setW(String(lastWeight))
    if (lastReps) setR(String(lastReps))
  }

  const placeholderW = lastWeight != null ? String(lastWeight) : 'lb'
  const placeholderR = lastReps != null ? String(lastReps) : 'reps'

  return (
    <div className={flash ? 'animate-pr-flash rounded-lg' : ''}>
      <div className="grid grid-cols-[28px_1fr_1fr_44px_36px] gap-2 items-center">
        <button
          onClick={tapAutofill}
          className="text-[var(--color-text-dim)] font-bold tabnum text-left"
          aria-label="Fill with previous"
        >
          {idx}
          {isPr && <span className="block text-[9px] text-[var(--color-accent)] font-bold leading-none">PR</span>}
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={w}
          onChange={(e) => setW(e.target.value)}
          onBlur={() => onSet(wn, rn, completed)}
          placeholder={placeholderW}
          className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-2 py-2 tabnum focus:border-[var(--color-accent)] placeholder:text-[var(--color-text-faint)]/50"
        />
        <input
          type="number"
          inputMode="numeric"
          value={r}
          onChange={(e) => setR(e.target.value)}
          onBlur={() => onSet(wn, rn, completed)}
          placeholder={placeholderR}
          className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-2 py-2 tabnum focus:border-[var(--color-accent)] placeholder:text-[var(--color-text-faint)]/50"
        />
        <button
          onClick={toggleCompleted}
          className={`h-10 rounded-lg font-semibold text-sm transition-all ${
            completed
              ? 'bg-[var(--color-accent)] text-white shadow-[0_4px_14px_-6px_var(--color-accent)]'
              : 'bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-dim)]'
          }`}
          aria-label="Toggle set completed"
        >✓</button>
        <button onClick={onDelete} className="text-[var(--color-text-faint)] text-xl" aria-label="Delete">×</button>
      </div>
      {oneRm > 0 && completed && (
        <div className="text-[10px] text-[var(--color-text-faint)] tabnum ml-9 mt-0.5">
          ≈ {Math.round(oneRm)} 1RM
        </div>
      )}
    </div>
  )
}

// ---------- REST TIMER ----------
function RestTimer({ initialSec, onClose }: { initialSec: number; onClose: () => void }) {
  const [secLeft, setSecLeft] = useState(initialSec)
  const [overShoot, setOverShoot] = useState(0)
  const chimedRef = useRef(false)

  useEffect(() => {
    const i = setInterval(() => {
      setSecLeft((s) => {
        const next = s - 1
        if (next === 0 && !chimedRef.current) {
          chimedRef.current = true
          haptic('chime')
          getSettings().then((cfg) => { if (cfg.soundOn) sound.ding() })
        }
        if (next < 0) {
          setOverShoot((o) => o + 1)
        }
        return next
      })
    }, 1000)
    return () => clearInterval(i)
  }, [])

  const isCountingUp = secLeft <= 0
  const displaySec = isCountingUp ? overShoot : secLeft
  const m = Math.max(0, Math.floor(displaySec / 60))
  const s = Math.max(0, displaySec % 60)

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40 glass border border-[var(--color-border-strong)] rounded-full px-5 py-2.5 flex items-center gap-3 animate-pop-in"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 80px)' }}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
        {isCountingUp ? 'Rested' : 'Rest'}
      </span>
      <span className={`display-num ${secLeft <= 5 && secLeft > 0 ? 'text-[var(--color-accent)]' : ''}`} style={{ fontSize: 18 }}>
        {m}:{String(s).padStart(2, '0')}
      </span>
      <button onClick={onClose} className="text-[var(--color-text-faint)] text-xs px-2 font-semibold">skip</button>
    </div>
  )
}

// ---------- SESSION SUMMARY SHEET ----------
function SessionSummarySheet({ session, sets, exercises, onClose }: {
  session: WorkoutSession
  sets: WorkoutSet[]
  exercises: Exercise[]
  onClose: () => void
}) {
  const exById = new Map(exercises.map((e) => [e.id!, e]))
  const completed = sets.filter((s) => s.completed === 1)
  const totalVolume = completed.reduce((acc, s) => acc + s.weight * s.reps, 0)
  const prs = completed.filter((s) => s.isPr === 1)
  const durationMs = (session.endedAt ?? Date.now()) - session.startedAt
  const minutes = Math.round(durationMs / 60000)
  const [notes, setNotes] = useState(session.notes ?? '')

  async function save() {
    await db.workoutSessions.update(session.id!, { notes: notes.trim() || undefined })
    toast.show({ title: 'Workout saved', variant: 'success' })
    onClose()
  }

  return (
    <Sheet open title="Session summary" onClose={onClose}>
      <div className="p-4 space-y-3">
        <div className="card-paper p-5">
          <div className="eyebrow text-[var(--color-ink-dim)]">Total volume</div>
          <div className="display-num mt-1" style={{ fontSize: 'clamp(40px, 12vw, 56px)' }}>
            {Math.round(totalVolume).toLocaleString()}
            <span className="text-sm font-bold ml-2 text-[var(--color-ink-dim)]">LB</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-dim)]">Duration</div>
              <div className="display-num text-[var(--color-ink)]" style={{ fontSize: 22 }}>{minutes}m</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-dim)]">Sets</div>
              <div className="display-num text-[var(--color-ink)]" style={{ fontSize: 22 }}>{completed.length}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-dim)]">PRs</div>
              <div className="display-num" style={{ fontSize: 22, color: prs.length > 0 ? 'var(--color-accent)' : 'var(--color-ink)' }}>
                {prs.length}
              </div>
            </div>
          </div>
        </div>

        {prs.length > 0 && (
          <Card title="New records">
            <div className="space-y-2">
              {prs.map((s) => {
                const ex = exById.get(s.exerciseId)
                return (
                  <div key={s.id} className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold truncate pr-2">{ex?.name ?? '—'}</span>
                    <span className="tabnum text-[var(--color-accent)] font-bold text-sm">
                      {s.reps} × {s.weight} lb
                      <span className="text-[var(--color-text-dim)] text-[11px] ml-1.5">
                        ≈{Math.round(estimated1RM(s.weight, s.reps))} 1RM
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        <Card title="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did it feel? Anything to remember?"
            className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)] resize-none"
            rows={3}
          />
        </Card>

        <PrimaryButton onClick={save} size="lg">Save & close</PrimaryButton>
      </div>
    </Sheet>
  )
}

// ---------- EXERCISE PICKER ----------
function ExercisePicker({ exercises, onPick }: { exercises: Exercise[]; onPick: (e: Exercise) => void }) {
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all')
  const filtered = exercises
    .filter((e) => muscle === 'all' || e.primary === muscle)
    .filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 space-y-3 border-b border-[var(--color-border)]">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search..."
          className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)]"
        />
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          <Pill active={muscle === 'all'} onClick={() => setMuscle('all')}>All</Pill>
          {(Object.keys(MUSCLE_LABELS) as MuscleGroup[]).map((m) => (
            <Pill key={m} active={muscle === m} onClick={() => setMuscle(m)}>{MUSCLE_LABELS[m]}</Pill>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState
            icon={EmptyIcons.dumbbell}
            title="No matches"
            body={exercises.length === 0 ? 'Add exercises in Settings → Starter content, or create your own in the Split tab.' : 'Try a different search or muscle filter.'}
          />
        ) : filtered.map((e) => (
          <button
            key={e.id}
            onClick={() => onPick(e)}
            className="w-full text-left px-4 py-3 border-b border-[var(--color-border)] active:bg-[var(--color-surface-2)]"
          >
            <div className="font-medium">{e.name}</div>
            <div className="text-xs text-[var(--color-text-faint)]">
              {MUSCLE_LABELS[e.primary]}
              {e.secondary.length > 0 && ` · ${e.secondary.map((s) => MUSCLE_LABELS[s]).join(', ')}`}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Pill({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
        active
          ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
          : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
      }`}
    >{children}</button>
  )
}

// ---------- SPLIT PLANNER ----------
function SplitPlanner() {
  const templates = useLiveQuery(() => db.workoutTemplates.orderBy('order').toArray(), [])
  const [editing, setEditing] = useState<WorkoutTemplate | 'new' | null>(null)

  async function addTemplate() {
    const order = (templates?.length ?? 0) + 1
    const id = await db.workoutTemplates.add({
      name: `Day ${order}`,
      order,
      createdAt: Date.now(),
    })
    setEditing((await db.workoutTemplates.get(Number(id)))!)
  }

  async function duplicate(t: WorkoutTemplate) {
    const order = (templates?.length ?? 0) + 1
    const newId = await db.workoutTemplates.add({
      ...t, id: undefined, name: t.name + ' (copy)', order, createdAt: Date.now(),
    })
    const tes = await db.templateExercises.where('templateId').equals(t.id!).toArray()
    await db.templateExercises.bulkAdd(tes.map((te) => ({ ...te, id: undefined, templateId: Number(newId) })))
    toast.show({ title: `Copied ${t.name}`, variant: 'success' })
  }

  async function remove(t: WorkoutTemplate) {
    if (!confirm(`Delete "${t.name}"?`)) return
    await db.templateExercises.where('templateId').equals(t.id!).delete()
    await db.workoutTemplates.delete(t.id!)
  }

  return (
    <div className="px-4 space-y-3">
      {(templates ?? []).length === 0 && (
        <Card padded>
          <EmptyState
            icon={EmptyIcons.dumbbell}
            title="BUILD YOUR SPLIT"
            body="Push / pull / legs, full body, bro split — whatever you run. Add a day and stack exercises with sets, reps, and rest."
            action={
              <PrimaryButton onClick={addTemplate} size="lg">+ New workout day</PrimaryButton>
            }
          />
        </Card>
      )}
      {(templates ?? []).map((t) => (
        <TemplateCard
          key={t.id}
          template={t}
          onOpen={() => setEditing(t)}
          onDuplicate={() => duplicate(t)}
          onDelete={() => remove(t)}
        />
      ))}
      {(templates ?? []).length > 0 && (
        <PrimaryButton onClick={addTemplate} variant="ghost" size="lg">+ Add workout day</PrimaryButton>
      )}

      {editing && (
        <TemplateEditor
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function TemplateCard({ template, onOpen, onDuplicate, onDelete }: {
  template: WorkoutTemplate
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const tes = useLiveQuery(() => db.templateExercises.where('templateId').equals(template.id!).sortBy('order'), [template.id])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const exById = new Map((exercises ?? []).map((e) => [e.id!, e]))

  return (
    <Card padded={false}>
      <button onClick={onOpen} className="w-full text-left">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-baseline justify-between">
            <span className="font-bold tracking-tight">{template.name}</span>
            {template.dayLabel && (
              <span className="text-xs text-[var(--color-text-faint)]">{template.dayLabel}</span>
            )}
          </div>
          {template.notes && (
            <div className="text-xs text-[var(--color-text-dim)] mt-1">{template.notes}</div>
          )}
        </div>
      </button>
      <div className="px-4 py-2">
        {(tes ?? []).length === 0 ? (
          <div className="text-xs text-[var(--color-text-faint)] py-1">No exercises — tap to add.</div>
        ) : (
          <ul className="text-sm space-y-1">
            {(tes ?? []).map((te) => {
              const ex = exById.get(te.exerciseId)
              return (
                <li key={te.id} className="flex justify-between">
                  <span>{ex?.name ?? '(deleted)'}</span>
                  <span className="text-[var(--color-text-faint)] tabnum">
                    {te.sets}×{te.repsLow}-{te.repsHigh}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <div className="flex border-t border-[var(--color-border)]">
        <button onClick={onDuplicate} className="flex-1 py-2.5 text-xs text-[var(--color-text-dim)] border-r border-[var(--color-border)] font-semibold">Duplicate</button>
        <button onClick={onDelete} className="flex-1 py-2.5 text-xs text-[var(--color-danger)] font-semibold">Delete</button>
      </div>
    </Card>
  )
}

function TemplateEditor({ template, onClose }: { template: WorkoutTemplate | null; onClose: () => void }) {
  const [name, setName] = useState(template?.name ?? '')
  const [dayLabel, setDayLabel] = useState(template?.dayLabel ?? '')
  const [notes, setNotes] = useState(template?.notes ?? '')
  const tes = useLiveQuery<TemplateExercise[]>(
    () => template
      ? db.templateExercises.where('templateId').equals(template.id!).sortBy('order')
      : Promise.resolve<TemplateExercise[]>([]),
    [template?.id],
  )
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const exById = new Map((exercises ?? []).map((e) => [e.id!, e]))
  const [pickOpen, setPickOpen] = useState(false)

  async function save() {
    if (!template) return
    await db.workoutTemplates.update(template.id!, { name, dayLabel: dayLabel || undefined, notes: notes || undefined })
    toast.show({ title: 'Saved', variant: 'success' })
    onClose()
  }

  async function addExercise(ex: Exercise) {
    if (!template) return
    const order = (tes?.length ?? 0) + 1
    await db.templateExercises.add({
      templateId: template.id!,
      exerciseId: ex.id!,
      order,
      sets: 3,
      repsLow: 8,
      repsHigh: 12,
      restSec: 90,
    })
    setPickOpen(false)
  }

  async function updateTE(te: TemplateExercise, patch: Partial<TemplateExercise>) {
    await db.templateExercises.update(te.id!, patch)
  }

  async function removeTE(te: TemplateExercise) {
    await db.templateExercises.delete(te.id!)
  }

  return (
    <Sheet open onClose={onClose} title={template?.name || 'New day'} fullHeight>
      <div className="p-4 space-y-3">
        <Field label="Name" value={name} onChange={setName} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day label (opt)" value={dayLabel} onChange={setDayLabel} placeholder="Mon, Day 1, etc." />
          <Field label="Notes (opt)" value={notes} onChange={setNotes} placeholder="Deload week, etc." />
        </div>
        <div className="space-y-2">
          {(tes ?? []).map((te) => {
            const ex = exById.get(te.exerciseId)
            return (
              <div key={te.id} className="bg-[var(--color-surface-2)] rounded-xl p-3 border border-[var(--color-border)]">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="font-bold text-sm">{ex?.name ?? '(deleted)'}</span>
                  <button onClick={() => removeTE(te)} className="text-[var(--color-text-faint)] text-lg">×</button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <NumField label="Sets" value={te.sets} onChange={(v) => updateTE(te, { sets: v })} />
                  <NumField label="Low" value={te.repsLow} onChange={(v) => updateTE(te, { repsLow: v })} />
                  <NumField label="High" value={te.repsHigh} onChange={(v) => updateTE(te, { repsHigh: v })} />
                  <NumField label="Rest s" value={te.restSec} onChange={(v) => updateTE(te, { restSec: v })} />
                </div>
              </div>
            )
          })}
        </div>
        <PrimaryButton onClick={() => setPickOpen(true)} variant="ghost">+ Add exercise</PrimaryButton>
        <PrimaryButton onClick={save} size="lg">Save</PrimaryButton>
      </div>
      <Sheet open={pickOpen} title="Pick exercise" onClose={() => setPickOpen(false)} fullHeight>
        <ExercisePicker exercises={exercises ?? []} onPick={addExercise} />
      </Sheet>
    </Sheet>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-[var(--color-text-faint)] uppercase">{label}</span>
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

// ---------- PROGRESSION ----------
function Progression() {
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const sets = useLiveQuery(() => db.workoutSets.toArray(), [])
  const [exerciseId, setExerciseId] = useState<number | null>(null)

  const allByEx = new Map<number, WorkoutSet[]>()
  for (const s of sets ?? []) {
    const arr = allByEx.get(s.exerciseId) ?? []
    arr.push(s)
    allByEx.set(s.exerciseId, arr)
  }

  // Top 3 PRs (Bench, Squat, Deadlift)
  const liftNames = ['Bench Press', 'Squat', 'Deadlift']
  const topLifts = liftNames.map((target) => {
    const ex = (exercises ?? []).find((e) => e.name.toLowerCase().includes(target.toLowerCase()))
    if (!ex) return null
    const exSets = allByEx.get(ex.id!) ?? []
    const pr = exSets.reduce((max, s) => Math.max(max, estimated1RM(s.weight, s.reps)), 0)
    return { ex, pr }
  }).filter(Boolean) as { ex: Exercise; pr: number }[]

  // Selected exercise series
  const selected = (exercises ?? []).find((e) => e.id === exerciseId) ?? (exercises ?? [])[0]
  const selectedSets = selected ? (allByEx.get(selected.id!) ?? []) : []
  const byDay = new Map<string, number>()
  for (const s of selectedSets) {
    const d = new Date(s.createdAt).toISOString().slice(0, 10)
    const oneRm = estimated1RM(s.weight, s.reps)
    byDay.set(d, Math.max(byDay.get(d) ?? 0, oneRm))
  }
  const series = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }))
  const currentPr = series.length ? Math.max(...series.map((p) => p.value)) : 0

  const noData = (sets ?? []).length === 0

  return (
    <div className="px-4 space-y-3">
      {noData ? (
        <Card padded>
          <EmptyState
            icon={EmptyIcons.trophy}
            title="LIFT SOMETHING"
            body="Track the rise. Log a workout — PRs and trend lines appear here automatically."
          />
        </Card>
      ) : (
        <>
          <Card title="Top PRs">
            <div className="grid grid-cols-3 gap-3">
              {topLifts.length === 0 ? (
                <div className="col-span-3 text-sm text-[var(--color-text-dim)] py-2">No big-three lifts logged yet.</div>
              ) : topLifts.map(({ ex, pr }) => (
                <div key={ex.id} className="bg-[var(--color-surface-2)] rounded-xl p-3 text-center border border-[var(--color-border)]">
                  <div className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wider">{ex.name.replace('Barbell ', '')}</div>
                  <div className="display-num mt-1" style={{ fontSize: 'clamp(18px, 5.5vw, 22px)' }}>
                    {pr > 0 ? Math.round(pr) : '—'}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-faint)]">est 1RM</div>
                </div>
              ))}
            </div>
          </Card>

          <Card padded>
            <Select
              label="Exercise"
              value={String(selected?.id ?? '')}
              onChange={(v) => setExerciseId(Number(v))}
              options={(exercises ?? []).map((e) => ({ value: String(e.id), label: e.name }))}
            />
            <div className="mt-3">
              <Spark data={series} height={140} showAxes yLabel="1RM" />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <Stat label="Sessions" value={series.length} />
              <Stat label="Top set" value={currentPr ? Math.round(currentPr) : '—'} unit="lb" />
              <Stat
                label="Trend"
                value={series.length >= 2 ? (series[series.length - 1].value > series[0].value ? '↑' : '↓') : '—'}
                accent={series.length >= 2 && series[series.length - 1].value > series[0].value}
              />
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
