import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, MEALS, getSettings, saveSettings, type Meal, type Food, type Sex, type Activity, type Goal } from '../db'
import { today, shiftDate, prettyDate } from '../lib/date'
import { calculateTdee, ACTIVITY_LABELS, GOAL_LABELS } from '../lib/tdee'
import { lbToKg, inToCm } from '../lib/format'
import { Header, Segmented } from '../components/Header'
import { Card } from '../components/Card'
import { MacroBar } from '../components/MacroBar'
import { Sheet } from '../components/Sheet'
import { Field, Select } from '../components/Field'
import { PrimaryButton } from '../components/PrimaryButton'

type View = 'today' | 'foods' | 'calc'

export function Eat() {
  const [view, setView] = useState<View>('today')

  return (
    <div className="pb-32">
      <Header
        title="Fuel"
        subtitle="Eat with intent"
        right={
          <button
            onClick={() => setView('calc')}
            className="text-xs font-semibold px-3 py-2 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] border border-[var(--color-accent)]/30"
          >Calc</button>
        }
      />
      <div className="px-4 mb-3">
        <Segmented<View>
          options={[
            { value: 'today', label: 'Today' },
            { value: 'foods', label: 'Foods' },
            { value: 'calc', label: 'Calc' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'today' && <NutritionToday />}
      {view === 'foods' && <FoodLibrary />}
      {view === 'calc' && <CalorieCalculator />}
    </div>
  )
}

// ---------- TODAY ----------
function NutritionToday() {
  const [date, setDate] = useState(today())
  const [pickerMeal, setPickerMeal] = useState<Meal | null>(null)

  const entries = useLiveQuery(() => db.logEntries.where('date').equals(date).toArray(), [date])
  const foods = useLiveQuery(() => db.foods.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])

  const metric = useLiveQuery(() => db.metrics.where('date').equals(date).first(), [date])

  const foodById = new Map((foods ?? []).map((f) => [f.id!, f]))
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 }
  for (const e of entries ?? []) {
    const f = foodById.get(e.foodId)
    if (!f) continue
    totals.kcal += f.kcal * e.servings
    totals.protein += f.protein * e.servings
    totals.carbs += f.carbs * e.servings
    totals.fat += f.fat * e.servings
    totals.fiber += (f.fiber ?? 0) * e.servings
    totals.sodium += (f.sodium ?? 0) * e.servings
  }

  async function logFood(foodId: number, meal: Meal, servings: number) {
    await db.logEntries.add({ date, meal, foodId, servings, createdAt: Date.now() })
    setPickerMeal(null)
  }

  async function updateWater(delta: number) {
    const cur = await db.metrics.where('date').equals(date).first()
    const water = Math.max(0, (cur?.water ?? 0) + delta)
    if (cur) await db.metrics.update(cur.id!, { water })
    else await db.metrics.add({ date, water })
  }

  return (
    <div className="px-4 space-y-3">
      {/* Date nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => setDate(shiftDate(date, -1))} className="px-3 py-2 text-[var(--color-text-dim)]">‹</button>
        <span className="font-semibold">{prettyDate(date)}</span>
        <button
          onClick={() => setDate(shiftDate(date, 1))}
          disabled={date >= today()}
          className="px-3 py-2 text-[var(--color-text-dim)] disabled:opacity-30"
        >›</button>
      </div>

      {/* Totals + macros */}
      <Card padded>
        <div className="flex items-baseline justify-between mb-3">
          <div className="font-bold tabnum" style={{ fontSize: 'clamp(28px, 8vw, 34px)' }}>
            {Math.round(totals.kcal)}
            <span className="text-[var(--color-text-dim)] font-normal text-sm ml-2">
              / {settings?.kcal ?? 0} kcal
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <MacroBar label="Protein" value={totals.protein} target={settings?.protein ?? 0} />
          <MacroBar label="Carbs" value={totals.carbs} target={settings?.carbs ?? 0} />
          <MacroBar label="Fat" value={totals.fat} target={settings?.fat ?? 0} />
          {(settings?.fiber ?? 0) > 0 && (
            <MacroBar label="Fiber" value={totals.fiber} target={settings?.fiber ?? 0} color="var(--color-good)" />
          )}
          {(settings?.sodium ?? 0) > 0 && (
            <MacroBar label="Sodium" value={totals.sodium} target={settings?.sodium ?? 0} unit="mg" color="var(--color-warn)" />
          )}
        </div>
      </Card>

      {/* Water */}
      <Card padded>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider">Water</div>
            <div className="font-bold tabnum mt-1" style={{ fontSize: 'clamp(20px, 6vw, 24px)' }}>
              {metric?.water ?? 0}
              <span className="text-[var(--color-text-dim)] text-xs ml-1 font-normal">
                / {settings?.waterTargetMl ?? 3000} ml
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => updateWater(-250)} className="w-10 h-10 rounded-full bg-[var(--color-surface-2)] text-lg">−</button>
            <button onClick={() => updateWater(250)} className="w-10 h-10 rounded-full bg-[var(--color-accent)] text-lg">+</button>
          </div>
        </div>
      </Card>

      {/* Meals */}
      {MEALS.map((m) => {
        const list = (entries ?? []).filter((e) => e.meal === m)
        const mealKcal = list.reduce((s, e) => {
          const f = foodById.get(e.foodId)
          return s + (f ? f.kcal * e.servings : 0)
        }, 0)
        return (
          <Card key={m} padded={false}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <div>
                <h3 className="capitalize font-semibold">{m}</h3>
                <div className="text-xs text-[var(--color-text-dim)] tabnum">{Math.round(mealKcal)} kcal</div>
              </div>
              <button
                onClick={() => setPickerMeal(m)}
                className="text-[var(--color-accent)] text-sm font-semibold px-2 py-1"
              >+ Add</button>
            </div>
            {list.length === 0 ? (
              <div className="px-4 py-3 text-sm text-[var(--color-text-faint)]">Nothing logged.</div>
            ) : (
              list.map((e) => {
                const f = foodById.get(e.foodId)
                if (!f) return null
                return (
                  <div key={e.id} className="px-4 py-3 flex items-center justify-between border-t border-[var(--color-border)] first:border-t-0">
                    <div className="min-w-0">
                      <div className="text-sm truncate">{f.name} <span className="text-[var(--color-text-dim)]">×{e.servings}</span></div>
                      <div className="text-xs text-[var(--color-text-faint)] tabnum">
                        {Math.round(f.kcal * e.servings)} kcal · P{Math.round(f.protein * e.servings)} C{Math.round(f.carbs * e.servings)} F{Math.round(f.fat * e.servings)}
                      </div>
                    </div>
                    <button
                      onClick={() => db.logEntries.delete(e.id!)}
                      className="text-[var(--color-text-faint)] px-2 text-xl"
                      aria-label="Delete"
                    >×</button>
                  </div>
                )
              })
            )}
          </Card>
        )
      })}

      <FoodPickerSheet
        open={pickerMeal != null}
        initialMeal={pickerMeal ?? 'breakfast'}
        onClose={() => setPickerMeal(null)}
        onConfirm={logFood}
      />
    </div>
  )
}

// ---------- FOOD PICKER SHEET ----------
function FoodPickerSheet({ open, initialMeal, onClose, onConfirm }: {
  open: boolean
  initialMeal: Meal
  onClose: () => void
  onConfirm: (foodId: number, meal: Meal, servings: number) => void
}) {
  const [query, setQuery] = useState('')
  const [meal, setMeal] = useState<Meal>(initialMeal)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [servings, setServings] = useState('1')

  const foods = useLiveQuery(() => db.foods.orderBy('name').toArray(), [])
  const filtered = useMemo(() => {
    if (!foods) return []
    const q = query.trim().toLowerCase()
    return q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods
  }, [foods, query])
  const selected = filtered.find((f) => f.id === selectedId) ?? null
  const n = Number(servings) || 0

  return (
    <Sheet open={open} title="Log food" onClose={onClose} fullHeight>
      <div className="px-4 py-3 border-b border-[var(--color-border)]">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods..."
          className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)]"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-text-dim)] text-sm">
            {foods?.length === 0 ? 'No foods yet — add some in Foods tab.' : 'No matches.'}
          </div>
        ) : filtered.map((f) => (
          <button
            key={f.id}
            onClick={() => setSelectedId(f.id!)}
            className={`w-full text-left px-4 py-3 border-b border-[var(--color-border)] ${
              selectedId === f.id ? 'bg-[var(--color-surface-2)]' : ''
            }`}
          >
            <div className="flex justify-between items-baseline">
              <span className="font-medium truncate pr-2">{f.name}</span>
              <span className="text-[var(--color-text-dim)] tabnum text-sm flex-shrink-0">{f.kcal} kcal</span>
            </div>
            <div className="text-xs text-[var(--color-text-faint)] tabnum">
              per {f.servingSize}{f.servingUnit} · P{f.protein} C{f.carbs} F{f.fat}
            </div>
          </button>
        ))}
      </div>
      {selected && (
        <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Meal" value={meal} onChange={(v) => setMeal(v as Meal)} options={MEALS.map((m) => ({ value: m, label: m }))} />
            <Field label="Servings" type="number" value={servings} onChange={setServings} step="0.1" min="0" />
          </div>
          <div className="text-xs text-[var(--color-text-dim)] tabnum">
            = {Math.round(selected.kcal * n)} kcal · P{Math.round(selected.protein * n)} C{Math.round(selected.carbs * n)} F{Math.round(selected.fat * n)}
          </div>
          <PrimaryButton
            disabled={!selected || n <= 0}
            onClick={() => onConfirm(selected.id!, meal, n)}
            size="lg"
          >Log it</PrimaryButton>
        </div>
      )}
    </Sheet>
  )
}

// ---------- FOOD LIBRARY ----------
type EditingFood = Food | 'new' | null

function FoodLibrary() {
  const [editing, setEditing] = useState<EditingFood>(null)
  const [query, setQuery] = useState('')
  const foods = useLiveQuery(() => db.foods.orderBy('name').toArray(), [])
  const filtered = (foods ?? []).filter((f) =>
    !query.trim() || f.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <div className="px-4 space-y-3">
      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          className="flex-1 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)]"
        />
        <button
          onClick={() => setEditing('new')}
          className="bg-[var(--color-accent)] text-white font-semibold px-4 rounded-xl active:scale-95 transition-transform"
        >+ New</button>
      </div>

      <button
        onClick={() => alert('Barcode scanning UI placeholder — needs a camera library (e.g. zxing-js) wired up.')}
        className="w-full text-left bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-xl p-4"
      >
        <div className="font-semibold text-sm">Scan barcode</div>
        <div className="text-xs text-[var(--color-text-faint)] mt-1">Coming soon — placeholder UI</div>
      </button>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center text-[var(--color-text-dim)] py-12 text-sm">
            {foods?.length === 0 ? 'No foods yet.' : 'No matches.'}
          </div>
        )}
        {filtered.map((f) => (
          <button
            key={f.id}
            onClick={() => setEditing(f)}
            className="w-full text-left bg-[var(--color-surface)] rounded-xl p-4 active:scale-[0.99] transition-transform"
          >
            <div className="flex justify-between items-baseline">
              <span className="font-semibold flex items-center gap-1.5">
                {f.favorite ? <span className="text-[var(--color-accent)] text-xs">★</span> : null}
                {f.name}
              </span>
              <span className="tabnum text-[var(--color-text-dim)] text-sm">{f.kcal} kcal</span>
            </div>
            <div className="text-xs text-[var(--color-text-faint)] tabnum mt-1">
              per {f.servingSize}{f.servingUnit} · P{f.protein} C{f.carbs} F{f.fat}
            </div>
          </button>
        ))}
      </div>

      {editing && <FoodEditor editing={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function FoodEditor({ editing, onClose }: { editing: EditingFood; onClose: () => void }) {
  const isNew = editing === 'new'
  const initial: Food = isNew
    ? { name: '', servingSize: 1, servingUnit: 'serving', kcal: 0, protein: 0, carbs: 0, fat: 0, createdAt: Date.now() }
    : (editing as Food)
  const [form, setForm] = useState({
    name: initial.name,
    servingSize: String(initial.servingSize),
    servingUnit: initial.servingUnit,
    kcal: String(initial.kcal),
    protein: String(initial.protein),
    carbs: String(initial.carbs),
    fat: String(initial.fat),
    fiber: String(initial.fiber ?? ''),
    sodium: String(initial.sodium ?? ''),
    favorite: (initial.favorite ?? 0) === 1,
  })

  async function save() {
    const data: Omit<Food, 'id'> = {
      name: form.name.trim(),
      servingSize: Number(form.servingSize) || 1,
      servingUnit: form.servingUnit.trim() || 'serving',
      kcal: Number(form.kcal) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fat: Number(form.fat) || 0,
      fiber: form.fiber ? Number(form.fiber) : undefined,
      sodium: form.sodium ? Number(form.sodium) : undefined,
      favorite: form.favorite ? 1 : 0,
      createdAt: initial.createdAt,
    }
    if (!data.name) return
    if (isNew) await db.foods.add(data)
    else await db.foods.update((editing as Food).id!, data)
    onClose()
  }

  async function remove() {
    if (isNew) return
    const id = (editing as Food).id!
    await db.foods.delete(id)
    await db.logEntries.where('foodId').equals(id).delete()
    onClose()
  }

  return (
    <Sheet open title={isNew ? 'New food' : 'Edit food'} onClose={onClose}>
      <div className="p-4 space-y-3">
        <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Serving" type="number" value={form.servingSize} onChange={(v) => setForm({ ...form, servingSize: v })} />
          <Field label="Unit" value={form.servingUnit} onChange={(v) => setForm({ ...form, servingUnit: v })} />
        </div>
        <Field label="Calories" type="number" value={form.kcal} onChange={(v) => setForm({ ...form, kcal: v })} />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Protein (g)" type="number" value={form.protein} onChange={(v) => setForm({ ...form, protein: v })} />
          <Field label="Carbs (g)" type="number" value={form.carbs} onChange={(v) => setForm({ ...form, carbs: v })} />
          <Field label="Fat (g)" type="number" value={form.fat} onChange={(v) => setForm({ ...form, fat: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fiber (g, opt)" type="number" value={form.fiber} onChange={(v) => setForm({ ...form, fiber: v })} />
          <Field label="Sodium (mg, opt)" type="number" value={form.sodium} onChange={(v) => setForm({ ...form, sodium: v })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.favorite}
            onChange={(e) => setForm({ ...form, favorite: e.target.checked })}
          />
          Mark as favorite
        </label>
        <div className="flex gap-2 pt-2">
          {!isNew && (
            <PrimaryButton onClick={remove} variant="danger" block={false}>Delete</PrimaryButton>
          )}
          <PrimaryButton onClick={save} disabled={!form.name.trim()} size="lg">Save</PrimaryButton>
        </div>
      </div>
    </Sheet>
  )
}

// ---------- TDEE CALCULATOR ----------
function CalorieCalculator() {
  const settings = useLiveQuery(() => getSettings(), [])
  const [units, setUnits] = useState<'metric' | 'imperial'>('imperial')
  const [age, setAge] = useState('25')
  const [sex, setSex] = useState<Sex>('male')
  const [heightFt, setHeightFt] = useState('5')
  const [heightIn, setHeightIn] = useState('10')
  const [heightCm, setHeightCm] = useState('178')
  const [weightLb, setWeightLb] = useState('180')
  const [weightKg, setWeightKg] = useState('82')
  const [activity, setActivity] = useState<Activity>('moderate')
  const [goal, setGoal] = useState<Goal>('maintain')

  const result = useMemo(() => {
    const ageNum = Number(age) || 25
    const cm = units === 'metric' ? Number(heightCm) || 178 : inToCm(Number(heightFt) * 12 + Number(heightIn))
    const kg = units === 'metric' ? Number(weightKg) || 82 : lbToKg(Number(weightLb))
    return calculateTdee({ age: ageNum, sex, heightCm: cm, weightKg: kg, activity, goal })
  }, [units, age, sex, heightFt, heightIn, heightCm, weightLb, weightKg, activity, goal])

  async function applyToTargets() {
    await saveSettings({
      kcal: result.recommended,
      protein: result.proteinG,
      carbs: result.carbsG,
      fat: result.fatG,
      age: Number(age),
      sex,
      heightCm: units === 'metric' ? Number(heightCm) : inToCm(Number(heightFt) * 12 + Number(heightIn)),
      weightKg: units === 'metric' ? Number(weightKg) : lbToKg(Number(weightLb)),
      activity,
      goal,
      units,
    })
    alert('Targets updated.')
  }

  return (
    <div className="px-4 space-y-3">
      <Card padded>
        <div className="mb-3">
          <Segmented<'metric' | 'imperial'>
            options={[{ value: 'imperial', label: 'lb / ft·in' }, { value: 'metric', label: 'kg / cm' }]}
            value={units}
            onChange={(v) => setUnits(v)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Age" type="number" value={age} onChange={setAge} />
          <Select label="Sex" value={sex} onChange={(v) => setSex(v as Sex)} options={[
            { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' },
          ]} />
        </div>
        {units === 'imperial' ? (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Height ft" type="number" value={heightFt} onChange={setHeightFt} />
              <Field label="in" type="number" value={heightIn} onChange={setHeightIn} />
            </div>
            <Field label="Weight (lb)" type="number" value={weightLb} onChange={setWeightLb} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="Height (cm)" type="number" value={heightCm} onChange={setHeightCm} />
            <Field label="Weight (kg)" type="number" value={weightKg} onChange={setWeightKg} />
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 mt-3">
          <Select label="Activity" value={activity} onChange={(v) => setActivity(v as Activity)} options={(Object.keys(ACTIVITY_LABELS) as Activity[]).map((a) => ({ value: a, label: ACTIVITY_LABELS[a] }))} />
          <Select label="Goal" value={goal} onChange={(v) => setGoal(v as Goal)} options={(Object.keys(GOAL_LABELS) as Goal[]).map((g) => ({ value: g, label: GOAL_LABELS[g] }))} />
        </div>
      </Card>

      <Card title="Result" padded>
        <div className="space-y-2">
          <Row label="BMR" value={`${result.bmr} kcal`} />
          <Row label="Maintenance" value={`${result.maintenance} kcal`} />
          <Row label="Recommended" value={`${result.recommended} kcal`} accent />
          <Row label="Est. weekly change" value={`${result.weeklyLbChange >= 0 ? '+' : ''}${result.weeklyLbChange} lb/wk`} />
          <hr className="border-[var(--color-border)] my-2" />
          <Row label="Protein" value={`${result.proteinG} g`} />
          <Row label="Carbs" value={`${result.carbsG} g`} />
          <Row label="Fat" value={`${result.fatG} g`} />
        </div>
        <PrimaryButton onClick={applyToTargets} size="lg" className="mt-4">
          Apply to my targets
        </PrimaryButton>
        {settings && (
          <div className="text-xs text-[var(--color-text-faint)] mt-2 text-center">
            Current: {settings.kcal} kcal · {settings.protein}P / {settings.carbs}C / {settings.fat}F
          </div>
        )}
      </Card>
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-[var(--color-text-dim)]">{label}</span>
      <span className={`tabnum font-semibold ${accent ? 'text-[var(--color-accent)]' : ''}`}>{value}</span>
    </div>
  )
}
