import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings, MUSCLE_LABELS } from '../db'
import { today, shiftDate, toISODate } from '../lib/date'
import { computeFatigue, overallRecovery, suggestedToTrain, overtrainingWarnings } from '../lib/recovery'
import { Header, HeaderChip } from '../components/Header'
import { Card, Stat } from '../components/Card'
import { MacroBar } from '../components/MacroBar'
import { ProgressRing } from '../components/ProgressRing'
import { Spark } from '../components/Spark'

const QUOTES = [
  'Pain is temporary. PRs last forever.',
  'No one cares. Work harder.',
  'The barbell is honest.',
  'Discipline beats motivation.',
  'Comfort built nothing.',
  'Eat. Lift. Sleep. Repeat.',
  'You vs you. Every day.',
  'Strong is a habit.',
]

interface Props {
  goTrain: () => void
  goEat: () => void
}

export function Home({ goTrain, goEat }: Props) {
  const settings = useLiveQuery(() => getSettings(), [])
  const todayISO = today()

  const entriesToday = useLiveQuery(() => db.logEntries.where('date').equals(todayISO).toArray(), [todayISO])
  const foods = useLiveQuery(() => db.foods.toArray(), [])
  const sessions = useLiveQuery(() => db.workoutSessions.toArray(), [])
  const sets = useLiveQuery(() => db.workoutSets.toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const metrics = useLiveQuery(() => db.metrics.toArray(), [])
  const measurements = useLiveQuery(() => db.measurements.toArray(), [])
  const templates = useLiveQuery(() => db.workoutTemplates.orderBy('order').toArray(), [])

  const foodById = new Map((foods ?? []).map((f) => [f.id!, f]))
  const macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  for (const e of entriesToday ?? []) {
    const f = foodById.get(e.foodId)
    if (!f) continue
    macros.kcal += f.kcal * e.servings
    macros.protein += f.protein * e.servings
    macros.carbs += f.carbs * e.servings
    macros.fat += f.fat * e.servings
  }
  const targetK = settings?.kcal ?? 0
  const kcalRemaining = Math.max(0, Math.round(targetK - macros.kcal))
  const pctOfDay = targetK > 0 ? Math.min(100, Math.round((macros.kcal / targetK) * 100)) : 0

  // Streak: consecutive past days with logged workout
  const sessionByDate = new Set((sessions ?? []).map((s) => s.date))
  let streak = 0
  for (let i = 0; i < 365; i++) {
    if (sessionByDate.has(shiftDate(todayISO, -i))) streak++
    else if (i > 0) break
  }

  // Weekly consistency
  const last7 = Array.from({ length: 7 }, (_, i) => shiftDate(todayISO, -i))
  const sessionsLast7 = last7.filter((d) => sessionByDate.has(d)).length
  const consistency = Math.round((sessionsLast7 / 7) * 100)

  // Recovery
  const fatigues = computeFatigue({ sets: sets ?? [], exercises: exercises ?? [], metrics: metrics ?? [] })
  const recoveryScore = overallRecovery(fatigues)
  const toTrain = suggestedToTrain(fatigues, 3)
  const warnings = overtrainingWarnings(fatigues)

  // Weight trend
  const weightSeries = (measurements ?? [])
    .filter((m) => m.weight != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: m.date, value: m.weight as number }))
  const latestWeight = weightSeries[weightSeries.length - 1]?.value

  const todayMetric = (metrics ?? []).find((m) => m.date === todayISO)
  const water = todayMetric?.water ?? 0
  const sleep = todayMetric?.sleep ?? 0

  const quote = QUOTES[(new Date().getDate() + new Date().getMonth()) % QUOTES.length]

  // Today's plan
  const dayIdx = (new Date().getDay() + 6) % 7
  const todaysTemplate = (templates ?? [])[dayIdx % Math.max(1, templates?.length ?? 1)]

  // Week strip (Mon-Sun current week)
  const weekStart = useMemo(() => {
    const d = new Date()
    const dow = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - dow)
    return d
  }, [])
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i)
    return { date: d, iso: toISODate(d), label: 'MTWTFSS'[i] }
  })

  return (
    <div className="pb-32">
      <Header
        title="Diary"
        subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        right={<HeaderChip
          icon={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5" /></svg>}
        />}
      />

      <div className="px-4 space-y-3">
        {/* Week strip */}
        <div className="flex justify-between px-1">
          {weekDays.map((d) => {
            const isToday = d.iso === todayISO
            const hasSession = sessionByDate.has(d.iso)
            return (
              <div key={d.iso} className="flex flex-col items-center gap-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">{d.label}</div>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold tabnum ${
                  isToday
                    ? 'bg-[var(--color-accent)] text-white'
                    : hasSession
                      ? 'bg-[var(--color-surface-2)] border border-[var(--color-accent)]/40 text-[var(--color-text)]'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)]'
                }`}>{d.date.getDate()}</div>
              </div>
            )
          })}
        </div>

        {/* Hero PAPER card: calories + macro bars */}
        <div className="card-paper p-5 animate-pop-in">
          <div className="flex items-center justify-between mb-4">
            <div className="eyebrow text-[var(--color-ink-dim)]">Calories</div>
            <div className="text-[11px] font-semibold text-[var(--color-ink-dim)] tabnum">{pctOfDay}%</div>
          </div>
          <div className="flex items-center gap-5">
            <ProgressRing
              value={macros.kcal}
              target={targetK || 1}
              size={140}
              stroke={12}
              centerValue={kcalRemaining}
              unit="LEFT"
              color="var(--color-accent)"
              inverted
            />
            <div className="flex-1 min-w-0 space-y-3">
              <MacroBar label="Protein" value={macros.protein} target={settings?.protein ?? 0} inverted color="var(--color-accent)" />
              <MacroBar label="Carbs" value={macros.carbs} target={settings?.carbs ?? 0} inverted color="#facc15" />
              <MacroBar label="Fat" value={macros.fat} target={settings?.fat ?? 0} inverted color="#60a5fa" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-5">
            <button onClick={goEat} className="bg-[var(--color-ink)] text-white py-3 rounded-2xl font-bold tracking-tight active:scale-[0.97] transition-transform">
              + Log meal
            </button>
            <button onClick={goTrain} className="bg-transparent border-2 border-[var(--color-ink)] text-[var(--color-ink)] py-3 rounded-2xl font-bold tracking-tight active:scale-[0.97] transition-transform">
              Start lift
            </button>
          </div>
        </div>

        {/* 2x2 stat tiles */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <Stat label="Streak" value={streak} unit="DAYS" accent big />
          </div>
          <div className="card p-4">
            <Stat label="Recovery" value={`${recoveryScore}`} unit="%" big />
          </div>
          <div className="card p-4">
            <Stat label="Water" value={water} unit="ML" hint={`of ${settings?.waterTargetMl ?? 3000}`} />
          </div>
          <div className="card p-4">
            <Stat label="Sleep" value={sleep || '—'} unit="HR" hint={`of ${settings?.sleepTargetHrs ?? 8}`} />
          </div>
        </div>

        {/* Today's plan card */}
        <Card title="Today's plan" action={
          <button onClick={goTrain} className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--color-accent)]">Open ›</button>
        }>
          {todaysTemplate ? (
            <div>
              <div className="display text-white" style={{ fontSize: 'clamp(22px, 6.5vw, 28px)' }}>
                {todaysTemplate.name}
              </div>
              {todaysTemplate.notes && (
                <div className="text-sm text-[var(--color-text-dim)] mt-1">{todaysTemplate.notes}</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-[var(--color-text-dim)]">No split built yet — Train → Split.</div>
          )}
        </Card>

        {/* Train next + warnings (accent card if warnings) */}
        {warnings.length > 0 ? (
          <div className="card-accent p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-80">Overtraining risk</div>
            <div className="display mt-1.5" style={{ fontSize: 'clamp(20px, 6vw, 24px)' }}>
              Rest: {warnings.map((m) => MUSCLE_LABELS[m]).join(', ')}
            </div>
          </div>
        ) : (
          <Card title="Train next">
            <div className="flex flex-wrap gap-2">
              {toTrain.length === 0 ? (
                <span className="text-sm text-[var(--color-text-dim)]">Log a workout to get suggestions.</span>
              ) : toTrain.map((m) => (
                <span key={m} className="px-3.5 py-2 rounded-full bg-[var(--color-surface-2)] text-[12px] font-semibold border border-[var(--color-border)]">
                  {MUSCLE_LABELS[m]}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Weight trend + quote row */}
        <div className="grid grid-cols-2 gap-3">
          <Card padded>
            <div className="eyebrow">Weight</div>
            <div
              className="display-num mt-1.5"
              style={{ fontSize: 'clamp(22px, 6.5vw, 28px)' }}
            >
              {latestWeight ?? '—'}
              <span className="text-[11px] font-semibold ml-1.5 text-[var(--color-text-dim)]">
                {settings?.units === 'metric' ? 'KG' : 'LB'}
              </span>
            </div>
            <div className="mt-3"><Spark data={weightSeries} height={48} /></div>
          </Card>
          <Card padded>
            <div className="eyebrow">Daily quote</div>
            <div className="mt-2 text-sm leading-snug italic text-[var(--color-text)]">"{quote}"</div>
          </Card>
        </div>

        {/* Weekly consistency card */}
        <Card padded>
          <div className="flex items-center justify-between mb-3">
            <div className="eyebrow">Weekly consistency</div>
            <div className="text-[11px] font-bold tabnum text-[var(--color-accent)]">{consistency}%</div>
          </div>
          <div className="flex gap-1 h-12">
            {last7.slice().reverse().map((iso, i) => {
              const hasSession = sessionByDate.has(iso)
              return (
                <div
                  key={iso}
                  className="flex-1 rounded-md"
                  style={{
                    background: hasSession ? 'var(--color-accent)' : 'var(--color-surface-3)',
                    opacity: hasSession ? 1 : 0.4 + i * 0.05,
                  }}
                />
              )
            })}
          </div>
          <div className="flex justify-between mt-2">
            {['M','T','W','T','F','S','S'].map((d, i) => (
              <span key={i} className="text-[10px] text-[var(--color-text-faint)] font-bold w-4 text-center">{d}</span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
