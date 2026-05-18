import { useState, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, MUSCLE_LABELS, getSettings, type MuscleGroup, type Exercise, type WorkoutTemplate, type TemplateExercise, type WorkoutSet, type WorkoutSession } from '../db'
import { today } from '../lib/date'
import { estimated1RM } from '../lib/format'
import { detectPr, formatPr } from '../lib/pr'
import { getLastSessionSets, getExerciseHistory, formatLastSession } from '../lib/workout'
import { suggestNext, type OverloadSuggestion } from '../lib/overload'
import { haptic } from '../lib/haptic'
import { sound } from '../lib/sound'
import { toast } from '../lib/toast'
import { useSwipeAction } from '../lib/useSwipeAction'
import { Header, Segmented } from '../components/Header'
import { Card, Stat } from '../components/Card'
import { Sheet } from '../components/Sheet'
import { Field, Select } from '../components/Field'
import { PrimaryButton } from '../components/PrimaryButton'
import { Spark } from '../components/Spark'
import { EmptyState, EmptyIcons } from '../components/EmptyState'
import { AnimatedCheck } from '../components/AnimatedCheck'

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
            { value: 'split', label: 'Plans' },
            { value: 'progress', label: 'Progress' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'today' && <TodayWorkout />}
      {view === 'split' && <PlansTab />}
      {view === 'progress' && <Progression />}
    </div>
  )
}

// ---------- TODAY'S WORKOUT ----------
function TodayWorkout() {
  const todayISO = today()
  const session = useLiveQuery(() => db.workoutSessions.where('date').equals(todayISO).first(), [todayISO])
  const settings = useLiveQuery(() => getSettings(), [])
  const units = settings?.units ?? 'imperial'
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
  const baseOrder = (templateExercises ?? []).length > 0
    ? (templateExercises as TemplateExercise[]).map((te) => te.exerciseId)
    : Array.from(new Set((sets ?? []).map((s) => s.exerciseId)))

  // Mix in any exercises that were added mid-workout (have sets but not in template)
  const fromSets = Array.from(new Set((sets ?? []).map((s) => s.exerciseId)))
  for (const id of fromSets) if (!baseOrder.includes(id)) baseOrder.push(id)

  // Apply custom order (move user-reordered ids to their positions) then filter hidden
  const customOrder = session.customOrder ?? []
  const hidden = new Set(session.hiddenExerciseIds ?? [])
  const exerciseOrder = customOrder.length > 0
    ? [
        ...customOrder.filter((id) => baseOrder.includes(id)),
        ...baseOrder.filter((id) => !customOrder.includes(id)),
      ].filter((id) => !hidden.has(id))
    : baseOrder.filter((id) => !hidden.has(id))

  async function removeExercise(exId: number) {
    if (!session) return
    if (!confirm('Remove this exercise from today\'s workout?')) return
    // Delete sets in this session for this exercise
    await db.workoutSets.where('sessionId').equals(session.id!).filter((s) => s.exerciseId === exId).delete()
    const newHidden = Array.from(new Set([...(session.hiddenExerciseIds ?? []), exId]))
    await db.workoutSessions.update(session.id!, { hiddenExerciseIds: newHidden })
    haptic('tap')
    toast.show({ title: 'Exercise removed', variant: 'default' })
  }

  async function moveExercise(exId: number, dir: -1 | 1) {
    if (!session) return
    const order = customOrder.length > 0 ? [...customOrder] : [...baseOrder]
    // Ensure the id is in the order list
    if (!order.includes(exId)) order.push(exId)
    const i = order.indexOf(exId)
    const j = i + dir
    if (j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    await db.workoutSessions.update(session.id!, { customOrder: order })
    haptic('tap')
  }

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
            units={units}
            onRest={(sec) => setTimerSec(sec)}
            onRemove={() => removeExercise(exId)}
            onMove={(dir) => moveExercise(exId, dir)}
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
            // Un-hide if previously removed
            if ((session.hiddenExerciseIds ?? []).includes(e.id!)) {
              await db.workoutSessions.update(session.id!, {
                hiddenExerciseIds: (session.hiddenExerciseIds ?? []).filter((id) => id !== e.id!),
              })
            }
            // Only add an empty set if there are none yet for this exercise in the session
            const has = (sets ?? []).some((s) => s.exerciseId === e.id!)
            if (!has) {
              await db.workoutSets.add({
                sessionId: session.id!,
                exerciseId: e.id!,
                setIndex: 1,
                weight: 0,
                reps: 0,
                completed: 0,
                createdAt: Date.now(),
              })
            }
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
function ExerciseLog({ sessionId, exercise, templateExercise, existingSets, units, onRest, onRemove, onMove }: {
  sessionId: number
  exercise: Exercise
  templateExercise?: TemplateExercise
  existingSets: WorkoutSet[]
  units: 'imperial' | 'metric'
  onRest: (sec: number) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [lastSession, setLastSession] = useState<{ session: WorkoutSession; sets: WorkoutSet[] } | null>(null)
  const [overload, setOverload] = useState<OverloadSuggestion | null>(null)
  const [overloadApplied, setOverloadApplied] = useState(false)

  // Compute overload suggestion once we have history + (optional) template.
  useEffect(() => {
    let cancelled = false
    getExerciseHistory(exercise.id!).then((history) => {
      if (cancelled) return
      const s = suggestNext(history, templateExercise, units)
      setOverload(s)
    })
    return () => { cancelled = true }
  }, [exercise.id, templateExercise?.id, units])

  // Suggestion to autofill into set 1
  const overloadAutofill = !overloadApplied && existingSets.length === 0 ? overload : null

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
      <div className="w-full px-4 py-3 flex justify-between items-center border-b border-[var(--color-border)]">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="font-bold tracking-tight truncate">{exercise.name}</div>
          <div className="text-xs text-[var(--color-text-faint)] mt-0.5">
            {MUSCLE_LABELS[exercise.primary]}
            {templateExercise && ` · ${templateExercise.sets} × ${templateExercise.repsLow}-${templateExercise.repsHigh}`}
          </div>
          {lastStrip && (
            <div className="text-[11px] text-[var(--color-text-dim)] mt-1 tabnum truncate">{lastStrip}</div>
          )}
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-9 h-9 flex items-center justify-center text-[var(--color-text-dim)] active:bg-[var(--color-surface-2)] rounded-full"
            aria-label="Exercise options"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-10 z-40 card p-1.5 min-w-[180px] animate-pop-in shadow-[0_12px_40px_-12px_rgba(0,0,0,0.7)]">
                <MenuItem onClick={() => { setMenuOpen(false); onMove(-1) }}>Move up</MenuItem>
                <MenuItem onClick={() => { setMenuOpen(false); onMove(1) }}>Move down</MenuItem>
                <MenuItem onClick={() => { setMenuOpen(false); onRemove() }} danger>Remove from workout</MenuItem>
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-2 text-[var(--color-text-faint)] text-xs"
          aria-label="Toggle"
        >{expanded ? '−' : '+'}</button>
      </div>
      {expanded && (
        <div className="px-3 py-3 space-y-2">
          {overloadAutofill && (
            <button
              onClick={() => {
                setOverloadApplied(true)
                // Pre-fill set 1
                setVal(1, overloadAutofill.weight, overloadAutofill.reps, 0)
                haptic('tap')
                toast.show({ title: 'Suggestion applied', variant: 'success' })
              }}
              className="w-full text-left px-4 py-3 rounded-2xl border-2 border-dashed border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] active:scale-[0.99] transition-transform"
            >
              <div className="flex items-baseline justify-between">
                <div className="eyebrow text-[var(--color-accent)]">Try this</div>
                <div className="display-num text-[var(--color-accent)]" style={{ fontSize: 22 }}>
                  {overloadAutofill.weight} × {overloadAutofill.reps}
                </div>
              </div>
              <div className="text-[11px] text-[var(--color-text-dim)] mt-1">
                {overloadAutofill.reasoning} <span className="text-[var(--color-accent)] font-bold ml-1">Tap to use →</span>
              </div>
            </button>
          )}
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
                units={units}
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

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold active:bg-[var(--color-surface-2)] ${
        danger ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'
      }`}
    >{children}</button>
  )
}

// ---------- SET ROW ----------
function SetRow({ idx, weight, reps, completed, isPr, lastWeight, lastReps, units, onSet, onComplete, onDelete, onRest }: {
  idx: number
  weight: number
  reps: number
  completed: boolean
  isPr: boolean
  lastWeight?: number
  lastReps?: number
  units: 'imperial' | 'metric'
  onSet: (w: number, r: number, c: boolean) => void
  onComplete: (idx: number, w: number, r: number) => Promise<{ isPr: boolean }>
  onDelete: () => void
  onRest: () => void
}) {
  const [w, setW] = useState(String(weight || ''))
  const [r, setR] = useState(String(reps || ''))
  const [flash, setFlash] = useState(false)

  // Keep local state in sync if parent updates
  useEffect(() => { setW(String(weight || '')) }, [weight])
  useEffect(() => { setR(String(reps || '')) }, [reps])

  const wn = Number(w) || 0
  const rn = Number(r) || 0
  const oneRm = wn > 0 && rn > 0 ? estimated1RM(wn, rn) : 0
  const weightStep = units === 'metric' ? 2.5 : 5

  // Swipe-to-delete
  const swipe = useSwipeAction({
    onLeft: () => { haptic('tap'); onDelete() },
  })

  async function toggleCompleted() {
    if (!completed) {
      const useW = wn || lastWeight || 0
      const useR = rn || lastReps || 0
      if (useW <= 0 || useR <= 0) return
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
    haptic('tap')
  }

  function bumpWeight(delta: number) {
    const base = wn || lastWeight || 0
    const next = Math.max(0, base + delta)
    setW(String(next))
    onSet(next, rn, completed)
    haptic('tap')
  }
  function bumpReps(delta: number) {
    const base = rn || lastReps || 0
    const next = Math.max(0, base + delta)
    setR(String(next))
    onSet(wn, next, completed)
    haptic('tap')
  }

  const placeholderW = lastWeight != null ? String(lastWeight) : '—'
  const placeholderR = lastReps != null ? String(lastReps) : '—'

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Red delete tile revealed on swipe */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end pr-5 text-white font-bold text-sm"
        style={{ background: 'var(--color-accent)', width: Math.max(0, -swipe.dx) }}
      >
        {swipe.dx <= -60 ? 'Release to delete' : null}
      </div>
      <div
        {...swipe.bind}
        style={{
          transform: swipe.dx < 0 ? `translateX(${swipe.dx}px)` : undefined,
          transition: swipe.active ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className={`relative bg-[var(--color-surface)] ${flash ? 'animate-pr-flash' : ''}`}
      >
        <div className="grid grid-cols-[36px_1fr_1fr_56px] gap-2 items-center p-2">
          {/* Set number badge — tap to autofill */}
          <button
            onClick={tapAutofill}
            className={`w-9 h-9 rounded-full flex flex-col items-center justify-center font-bold tabnum text-sm border ${
              completed
                ? 'bg-[var(--color-accent-soft)] border-[var(--color-accent)]/40 text-[var(--color-text)]'
                : 'bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-dim)]'
            }`}
            aria-label="Set number — tap to autofill"
          >
            {isPr ? (
              <span className="text-[9px] leading-none text-[var(--color-accent)] font-black">PR</span>
            ) : null}
            <span className="leading-none">{idx}</span>
          </button>

          {/* Weight stepper */}
          <SetCell
            value={w}
            onChange={setW}
            onBlur={() => onSet(wn, rn, completed)}
            onMinus={() => bumpWeight(-weightStep)}
            onPlus={() => bumpWeight(weightStep)}
            placeholder={placeholderW}
            label={units === 'metric' ? 'KG' : 'LB'}
          />

          {/* Reps stepper */}
          <SetCell
            value={r}
            onChange={setR}
            onBlur={() => onSet(wn, rn, completed)}
            onMinus={() => bumpReps(-1)}
            onPlus={() => bumpReps(1)}
            placeholder={placeholderR}
            label="REPS"
          />

          {/* Big check button with animated checkmark */}
          <button
            onClick={toggleCompleted}
            className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 ${
              completed
                ? 'bg-[var(--color-accent)] text-white shadow-[0_6px_18px_-6px_var(--color-accent)]'
                : 'bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-dim)]'
            }`}
            aria-label="Toggle set completed"
          >
            <AnimatedCheck checked={completed} size={22} strokeWidth={3} />
          </button>
        </div>

        {oneRm > 0 && completed && (
          <div className="text-[10px] text-[var(--color-text-faint)] tabnum px-12 pb-2 -mt-1">
            ≈ {Math.round(oneRm)} 1RM
          </div>
        )}
      </div>
    </div>
  )
}

function SetCell({ value, onChange, onBlur, onMinus, onPlus, placeholder, label }: {
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  onMinus: () => void
  onPlus: () => void
  placeholder: string
  label: string
}) {
  return (
    <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl flex items-stretch overflow-hidden h-12">
      <button
        onClick={onMinus}
        className="w-8 flex items-center justify-center text-[var(--color-text-dim)] text-lg active:bg-[var(--color-surface-3)] transition-colors"
        aria-label="Decrease"
      >−</button>
      <div className="flex-1 flex flex-col items-center justify-center">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className="w-full text-center display-num bg-transparent focus:outline-none placeholder:text-[var(--color-text-faint)]/40"
          style={{ fontSize: 18 }}
        />
        <span className="text-[8px] text-[var(--color-text-faint)] uppercase tracking-wider leading-none -mt-0.5">{label}</span>
      </div>
      <button
        onClick={onPlus}
        className="w-8 flex items-center justify-center text-[var(--color-text-dim)] text-lg active:bg-[var(--color-surface-3)] transition-colors"
        aria-label="Increase"
      >+</button>
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

// ---------- PLANS TAB (sub-tabs: Splits | Exercises) ----------
type PlansView = 'splits' | 'exercises'

function PlansTab() {
  const [view, setView] = useState<PlansView>('splits')
  return (
    <div>
      <div className="px-4 mb-3">
        <Segmented<PlansView>
          options={[
            { value: 'splits', label: 'Splits' },
            { value: 'exercises', label: 'Exercises' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'splits' && <SplitPlanner />}
      {view === 'exercises' && <ExerciseLibrary />}
    </div>
  )
}

// ---------- EXERCISE LIBRARY ----------
function ExerciseLibrary() {
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all')

  const filtered = (exercises ?? [])
    .filter((e) => muscle === 'all' || e.primary === muscle)
    .filter((e) => !query.trim() || e.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="px-4 space-y-3">
      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises..."
          className="flex-1 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)]"
        />
        <button
          onClick={() => setEditing('new')}
          className="bg-[var(--color-accent)] text-white font-bold px-4 rounded-xl active:scale-95 transition-transform shadow-[0_8px_24px_-12px_var(--color-accent)]"
        >+ New</button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        <Pill active={muscle === 'all'} onClick={() => setMuscle('all')}>All</Pill>
        {(Object.keys(MUSCLE_LABELS) as MuscleGroup[]).map((m) => (
          <Pill key={m} active={muscle === m} onClick={() => setMuscle(m)}>{MUSCLE_LABELS[m]}</Pill>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card padded>
          <EmptyState
            icon={EmptyIcons.dumbbell}
            title={(exercises ?? []).length === 0 ? 'BUILD YOUR LIBRARY' : 'NO MATCHES'}
            body={(exercises ?? []).length === 0
              ? 'Add the exercises you actually run. Bench, squat, anything custom — your gym, your terms.'
              : 'Try a different search or muscle filter.'}
            action={
              (exercises ?? []).length === 0 ? (
                <PrimaryButton onClick={() => setEditing('new')} size="lg">+ Add your first exercise</PrimaryButton>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <button
              key={e.id}
              onClick={() => setEditing(e)}
              className="w-full text-left card p-4 active:scale-[0.99] transition-transform"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold tracking-tight truncate">{e.name}</span>
                {e.custom === 1 && (
                  <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-accent)] flex-shrink-0">CUSTOM</span>
                )}
              </div>
              <div className="text-xs text-[var(--color-text-faint)] mt-0.5">
                <span className="text-[var(--color-text-dim)] font-semibold">{MUSCLE_LABELS[e.primary]}</span>
                {e.secondary.length > 0 && (
                  <span> · {e.secondary.map((s) => MUSCLE_LABELS[s]).join(', ')}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <ExerciseDetailSheet
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ---------- EXERCISE DETAIL SHEET (CRUD + chart) ----------
function ExerciseDetailSheet({ editing, onClose }: { editing: Exercise | 'new'; onClose: () => void }) {
  const isNew = editing === 'new'
  const initial: Exercise = isNew
    ? { name: '', primary: 'chest', secondary: [], notes: '', custom: 1, createdAt: Date.now() }
    : editing as Exercise

  const [name, setName] = useState(initial.name)
  const [primary, setPrimary] = useState<MuscleGroup>(initial.primary)
  const [secondary, setSecondary] = useState<MuscleGroup[]>(initial.secondary ?? [])
  const [notes, setNotes] = useState(initial.notes ?? '')

  const sets = useLiveQuery<WorkoutSet[]>(
    () => isNew ? Promise.resolve<WorkoutSet[]>([]) : db.workoutSets.where('exerciseId').equals((editing as Exercise).id!).toArray(),
    [isNew ? null : (editing as Exercise).id],
  )
  const completed = (sets ?? []).filter((s) => s.completed === 1)

  // 1RM per day for the chart
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
  const lastDate = completed.length > 0
    ? new Date(Math.max(...completed.map((s) => s.createdAt))).toISOString().slice(0, 10)
    : null

  function toggleSecondary(m: MuscleGroup) {
    setSecondary((cur) => cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m])
  }

  async function save() {
    if (!name.trim()) return
    const data: Omit<Exercise, 'id'> = {
      name: name.trim(),
      primary,
      secondary: secondary.filter((s) => s !== primary),
      notes: notes.trim() || undefined,
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
    if (!confirm(`Delete "${initial.name}"? This removes it from every plan and history reference.`)) return
    await db.templateExercises.where('exerciseId').equals(id).delete()
    await db.exercises.delete(id)
    toast.show({ title: 'Exercise deleted', variant: 'default' })
    onClose()
  }

  return (
    <Sheet open title={isNew ? 'New exercise' : initial.name} onClose={onClose} fullHeight>
      <div className="p-4 space-y-4">
        <Field label="Name" value={name} onChange={setName} placeholder="e.g. Incline DB Press" autoFocus />

        <Select
          label="Primary muscle"
          value={primary}
          onChange={(v) => setPrimary(v as MuscleGroup)}
          options={(Object.keys(MUSCLE_LABELS) as MuscleGroup[]).map((m) => ({ value: m, label: MUSCLE_LABELS[m] }))}
        />

        <div>
          <div className="eyebrow mb-2">Secondary muscles</div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(MUSCLE_LABELS) as MuscleGroup[]).filter((m) => m !== primary).map((m) => (
              <Pill key={m} active={secondary.includes(m)} onClick={() => toggleSecondary(m)}>
                {MUSCLE_LABELS[m]}
              </Pill>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider font-medium">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Cues, setup, anything"
            className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)] resize-none"
            rows={3}
          />
        </label>

        {!isNew && chartData.length > 0 && (
          <Card title="Progression">
            <Spark data={chartData} height={120} showAxes yLabel="1RM" />
            <div className="grid grid-cols-3 gap-3 mt-3">
              <Stat label="Top set" value={topPr ? Math.round(topPr) : '—'} unit="lb" accent />
              <Stat label="Sessions" value={chartData.length} />
              <Stat label="Last" value={lastDate ? lastDate.slice(5) : '—'} />
            </div>
          </Card>
        )}
        {!isNew && chartData.length === 0 && (
          <Card padded>
            <EmptyState
              icon={EmptyIcons.trophy}
              title="No history"
              body="Log this exercise in a workout to see your progression."
              compact
            />
          </Card>
        )}

        <div className="flex gap-2 pt-2">
          {!isNew && (
            <PrimaryButton onClick={remove} variant="danger" block={false}>Delete</PrimaryButton>
          )}
          <PrimaryButton onClick={save} disabled={!name.trim()} size="lg">Save</PrimaryButton>
        </div>
      </div>
    </Sheet>
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
