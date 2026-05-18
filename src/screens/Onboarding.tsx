import { useState, useMemo } from 'react'
import { saveSettings, type Activity, type Goal, type Sex, type UnitSystem } from '../db'
import { calculateTdee, ACTIVITY_LABELS, GOAL_LABELS } from '../lib/tdee'
import { inToCm, lbToKg } from '../lib/format'
import { addStarterExercises, addStarterFoods } from '../db/seed'
import { requestPersistentStorage } from '../lib/autoBackup'

interface Props {
  onDone: () => void
}

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6

export function Onboarding({ onDone }: Props) {
  const [step, setStep] = useState<Step>(0)
  const [name, setName] = useState('')
  const [units, setUnits] = useState<UnitSystem>('imperial')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<Sex>('male')
  const [heightFt, setHeightFt] = useState('5')
  const [heightIn, setHeightIn] = useState('10')
  const [heightCm, setHeightCm] = useState('178')
  const [weightLb, setWeightLb] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [activity, setActivity] = useState<Activity>('moderate')
  const [goal, setGoal] = useState<Goal>('maintain')
  const [loadStarter, setLoadStarter] = useState<'yes' | 'no' | null>(null)
  const [busy, setBusy] = useState(false)

  const result = useMemo(() => {
    const ageN = Number(age) || 25
    const cm = units === 'metric' ? Number(heightCm) || 178 : inToCm(Number(heightFt) * 12 + Number(heightIn))
    const kg = units === 'metric'
      ? Number(weightKg) || 80
      : lbToKg(Number(weightLb) || 180)
    return calculateTdee({ age: ageN, sex, heightCm: cm, weightKg: kg, activity, goal })
  }, [age, sex, heightFt, heightIn, heightCm, weightLb, weightKg, activity, goal, units])

  function next() { setStep((s) => Math.min(6, s + 1) as Step) }
  function back() { setStep((s) => Math.max(0, s - 1) as Step) }

  async function finish() {
    setBusy(true)
    try {
      const cm = units === 'metric' ? Number(heightCm) : inToCm(Number(heightFt) * 12 + Number(heightIn))
      const kg = units === 'metric' ? Number(weightKg) : lbToKg(Number(weightLb))
      await saveSettings({
        name: name.trim() || undefined,
        units,
        age: Number(age) || undefined,
        sex,
        heightCm: cm,
        weightKg: kg,
        activity,
        goal,
        kcal: result.recommended,
        protein: result.proteinG,
        carbs: result.carbsG,
        fat: result.fatG,
        onboardedAt: Date.now(),
      })
      if (loadStarter === 'yes') {
        await addStarterExercises()
        await addStarterFoods()
      }
      await requestPersistentStorage()
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const canNext: Record<Step, boolean> = {
    0: true,
    1: true,
    2: Number(age) > 0,
    3: units === 'metric'
      ? Number(heightCm) > 0 && Number(weightKg) > 0
      : Number(heightFt) >= 0 && Number(weightLb) > 0,
    4: true,
    5: loadStarter !== null,
    6: true,
  }

  return (
    <div className="min-h-full bg-[var(--color-bg)] flex flex-col" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
      {/* Progress dots */}
      <div className="px-6 mb-6 flex gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 h-1 rounded-full transition-colors"
            style={{ background: i <= step ? 'var(--color-accent)' : 'var(--color-surface-3)' }}
          />
        ))}
      </div>

      <div className="flex-1 px-6 pb-32 animate-fade-in" key={step}>
        {step === 0 && <Welcome />}
        {step === 1 && (
          <FormStep
            eyebrow="Step 01"
            title="What's your name?"
            subtitle="So the app can greet you. Skip if you'd rather not."
          >
            <BigInput
              value={name}
              onChange={setName}
              placeholder="Your name"
              autoFocus
            />
            <UnitToggle units={units} setUnits={setUnits} />
          </FormStep>
        )}
        {step === 2 && (
          <FormStep
            eyebrow="Step 02"
            title="A little about you"
            subtitle="Needed to calculate your calorie targets."
          >
            <BigInput
              value={age}
              onChange={setAge}
              placeholder="Age"
              type="number"
              inputMode="numeric"
              autoFocus
            />
            <div className="flex gap-2">
              {(['male', 'female'] as Sex[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSex(s)}
                  className={`flex-1 py-4 rounded-2xl font-bold capitalize tracking-tight transition-all ${
                    sex === s
                      ? 'bg-[var(--color-accent)] text-white shadow-[0_8px_24px_-12px_var(--color-accent)]'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)] border border-[var(--color-border)]'
                  }`}
                >{s}</button>
              ))}
            </div>
          </FormStep>
        )}
        {step === 3 && (
          <FormStep
            eyebrow="Step 03"
            title="Body stats"
            subtitle={units === 'metric' ? 'Centimeters and kilograms.' : 'Feet/inches and pounds.'}
          >
            {units === 'imperial' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <BigInput value={heightFt} onChange={setHeightFt} placeholder="Height ft" type="number" inputMode="numeric" />
                  <BigInput value={heightIn} onChange={setHeightIn} placeholder="in" type="number" inputMode="numeric" />
                </div>
                <BigInput value={weightLb} onChange={setWeightLb} placeholder="Weight (lb)" type="number" inputMode="decimal" />
              </>
            ) : (
              <>
                <BigInput value={heightCm} onChange={setHeightCm} placeholder="Height (cm)" type="number" inputMode="numeric" />
                <BigInput value={weightKg} onChange={setWeightKg} placeholder="Weight (kg)" type="number" inputMode="decimal" />
              </>
            )}
          </FormStep>
        )}
        {step === 4 && (
          <FormStep
            eyebrow="Step 04"
            title="How active are you?"
            subtitle="And what's the goal?"
          >
            <div className="space-y-2">
              <div className="eyebrow mb-1">Activity</div>
              {(Object.keys(ACTIVITY_LABELS) as Activity[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setActivity(a)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${
                    activity === a
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-2)]'
                  }`}
                >
                  <div className="font-bold capitalize">{a}</div>
                  <div className="text-xs text-[var(--color-text-dim)] mt-0.5">{ACTIVITY_LABELS[a]}</div>
                </button>
              ))}
            </div>
            <div className="space-y-2 mt-4">
              <div className="eyebrow mb-1">Goal</div>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGoal(g)}
                    className={`p-3 rounded-2xl text-center transition-all ${
                      goal === g
                        ? 'bg-[var(--color-accent)] text-white shadow-[0_8px_24px_-12px_var(--color-accent)]'
                        : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)] border border-[var(--color-border)]'
                    }`}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider">{GOAL_LABELS[g].split(' ')[0]}</div>
                  </button>
                ))}
              </div>
            </div>
          </FormStep>
        )}
        {step === 5 && (
          <FormStep
            eyebrow="Step 05"
            title="Your targets"
            subtitle="Based on Mifflin-St Jeor. Editable anytime."
          >
            <div className="card-paper p-5 space-y-2">
              <Row label="Calories" value={`${result.recommended} kcal`} accent />
              <Row label="Protein" value={`${result.proteinG} g`} />
              <Row label="Carbs" value={`${result.carbsG} g`} />
              <Row label="Fat" value={`${result.fatG} g`} />
              <hr className="border-[var(--color-ink-dim)]/15 my-2" />
              <Row label="Est. weekly change" value={`${result.weeklyLbChange >= 0 ? '+' : ''}${result.weeklyLbChange} lb/wk`} small />
            </div>
            <div className="space-y-3 mt-2">
              <div className="eyebrow">Starter content?</div>
              <p className="text-sm text-[var(--color-text-dim)] leading-relaxed">
                Want some common exercises (squat, bench, deadlift…) and basic foods (chicken, rice, eggs…) to start with? You can delete anything you don't want.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setLoadStarter('yes')}
                  className={`p-4 rounded-2xl border-2 transition-all ${
                    loadStarter === 'yes'
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-2)]'
                  }`}
                >
                  <div className="font-bold">Yes, load</div>
                  <div className="text-xs text-[var(--color-text-dim)] mt-0.5">24 exercises + 10 foods</div>
                </button>
                <button
                  onClick={() => setLoadStarter('no')}
                  className={`p-4 rounded-2xl border-2 transition-all ${
                    loadStarter === 'no'
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-2)]'
                  }`}
                >
                  <div className="font-bold">Empty</div>
                  <div className="text-xs text-[var(--color-text-dim)] mt-0.5">Add my own</div>
                </button>
              </div>
            </div>
          </FormStep>
        )}
        {step === 6 && (
          <FormStep
            eyebrow="Last step"
            title={name ? `Let's lift, ${name}.` : "You're set."}
            subtitle="Tap finish to dive in. Your data stays on this device — back up regularly."
          >
            <div className="card-accent p-5">
              <div className="eyebrow opacity-80">Daily target</div>
              <div className="display mt-1.5" style={{ fontSize: 'clamp(36px, 12vw, 56px)' }}>
                {result.recommended}
              </div>
              <div className="text-xs font-semibold opacity-80 mt-1">CALORIES</div>
            </div>
            <ul className="space-y-2 mt-4 text-sm text-[var(--color-text-dim)]">
              <li>• Home shows your daily diary at a glance</li>
              <li>• Train logs lifts and tracks progression</li>
              <li>• Eat handles meals and macros</li>
              <li>• Body shows recovery and progress</li>
              <li>• More holds settings, calendar, peptides</li>
            </ul>
          </FormStep>
        )}
      </div>

      {/* Sticky footer nav */}
      <div
        className="fixed inset-x-0 z-30 px-6 py-4 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)] to-transparent"
        style={{ bottom: 0, paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
      >
        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={back}
              className="px-5 py-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] font-bold text-sm text-[var(--color-text-dim)]"
            >Back</button>
          )}
          {step < 6 ? (
            <button
              onClick={next}
              disabled={!canNext[step]}
              className="flex-1 py-4 rounded-2xl bg-[var(--color-accent)] text-white font-bold shadow-[0_12px_30px_-12px_var(--color-accent)] active:scale-[0.97] transition-transform disabled:opacity-30"
            >Continue</button>
          ) : (
            <button
              onClick={finish}
              disabled={busy}
              className="flex-1 py-4 rounded-2xl bg-[var(--color-accent)] text-white font-bold shadow-[0_12px_30px_-12px_var(--color-accent)] active:scale-[0.97] transition-transform disabled:opacity-50"
            >{busy ? 'Setting up…' : 'Finish'}</button>
          )}
        </div>
      </div>
    </div>
  )
}

function Welcome() {
  return (
    <div className="flex flex-col items-start justify-center min-h-[70vh]">
      <div className="eyebrow text-[var(--color-accent)]">Welcome</div>
      <h1 className="display mt-3" style={{ fontSize: 'clamp(48px, 14vw, 78px)', lineHeight: 0.92 }}>
        Dialed
        <br/>Dawg
      </h1>
      <p className="text-[var(--color-text-dim)] text-base leading-relaxed mt-6 max-w-sm">
        A no-nonsense fitness tracker for the obsessed. Calories, lifts, recovery, peptides, and progress — all on your phone, all yours.
      </p>
      <div className="mt-8 flex gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
        <span>Local-first</span><span>·</span><span>No accounts</span><span>·</span><span>Free</span>
      </div>
    </div>
  )
}

function FormStep({ eyebrow, title, subtitle, children }: {
  eyebrow: string
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="eyebrow text-[var(--color-accent)]">{eyebrow}</div>
        <h2 className="display mt-2" style={{ fontSize: 'clamp(28px, 8vw, 40px)', lineHeight: 1 }}>{title}</h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-2 leading-relaxed">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function BigInput({ value, onChange, placeholder, type = 'text', inputMode, autoFocus }: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: string
  inputMode?: 'numeric' | 'decimal' | 'text'
  autoFocus?: boolean
}) {
  return (
    <input
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-2xl px-4 py-4 text-lg font-semibold focus:border-[var(--color-accent)] transition-colors placeholder:text-[var(--color-text-faint)] placeholder:font-normal"
    />
  )
}

function UnitToggle({ units, setUnits }: { units: UnitSystem; setUnits: (u: UnitSystem) => void }) {
  return (
    <div className="inline-flex w-full bg-[var(--color-surface-2)] rounded-2xl p-1 border border-[var(--color-border)]">
      {(['imperial', 'metric'] as UnitSystem[]).map((u) => (
        <button
          key={u}
          onClick={() => setUnits(u)}
          className={`flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
            units === u ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-dim)]'
          }`}
        >{u === 'imperial' ? 'lb / ft' : 'kg / cm'}</button>
      ))}
    </div>
  )
}

function Row({ label, value, accent, small }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`${small ? 'text-xs' : 'text-sm'} text-[var(--color-ink-dim)] font-semibold uppercase tracking-wider`}>{label}</span>
      <span className={`tabnum font-bold ${accent ? 'text-[var(--color-accent)] text-xl' : 'text-[var(--color-ink)] text-base'}`}>{value}</span>
    </div>
  )
}
