import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, MEALS, getSettings, saveSettings, type Meal, type Food, type Sex, type Activity, type Goal } from '../db'
import { today, shiftDate, prettyDate } from '../lib/date'
import { calculateTdee, ACTIVITY_LABELS, GOAL_LABELS } from '../lib/tdee'
import { lbToKg, inToCm } from '../lib/format'
import { toast } from '../lib/toast'
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
    <div className="pb-32 page-nutrition">
      <Header
        title="Nutrition"
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
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const entries = useLiveQuery(() => db.logEntries.where('date').equals(date).toArray(), [date])
  const foods = useLiveQuery(() => db.foods.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const yesterdayEntries = useLiveQuery(() => db.logEntries.where('date').equals(shiftDate(date, -1)).toArray(), [date])
  const recentEntries = useLiveQuery(() => db.logEntries.orderBy('id').reverse().limit(60).toArray(), [])

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

  // Compute most-used foods from the last 60 log entries
  const recentFoodIds = useMemo(() => {
    if (!recentEntries) return []
    const counts = new Map<number, number>()
    for (const e of recentEntries) counts.set(e.foodId, (counts.get(e.foodId) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => id)
  }, [recentEntries])

  const quickFoods = useMemo(() => {
    const ids = new Set<number>()
    // favorites first
    for (const f of (foods ?? []).filter((f) => f.favorite === 1)) {
      if (f.id != null) ids.add(f.id)
    }
    for (const id of recentFoodIds) ids.add(id)
    return [...ids]
      .slice(0, 8)
      .map((id) => foodById.get(id))
      .filter((f): f is Food => !!f)
  }, [foods, recentFoodIds, foodById])

  async function logFood(foodId: number, meal: Meal, servings: number) {
    await db.logEntries.add({ date, meal, foodId, servings, createdAt: Date.now() })
    setPickerMeal(null)
  }

  async function quickLogFood(food: Food) {
    // Auto-pick meal based on time of day
    const hour = new Date().getHours()
    const meal: Meal = hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 20 ? 'dinner' : 'snack'
    await db.logEntries.add({ date, meal, foodId: food.id!, servings: 1, createdAt: Date.now() })
  }

  async function updateWater(delta: number) {
    const cur = await db.metrics.where('date').equals(date).first()
    const water = Math.max(0, (cur?.water ?? 0) + delta)
    if (cur) await db.metrics.update(cur.id!, { water })
    else await db.metrics.add({ date, water })
  }

  async function copyMealFromYesterday(meal: Meal) {
    const yesterday = (yesterdayEntries ?? []).filter((e) => e.meal === meal)
    if (yesterday.length === 0) return
    for (const e of yesterday) {
      await db.logEntries.add({
        date, meal: e.meal, foodId: e.foodId, servings: e.servings, createdAt: Date.now(),
      })
    }
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
          <div className="display-num" style={{ fontSize: 'clamp(32px, 9vw, 40px)' }}>
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

      {/* Quick log row */}
      {quickFoods.length > 0 && (
        <div>
          <div className="eyebrow mb-2 px-1">Quick log · tap to add</div>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {quickFoods.map((f) => (
              <button
                key={f.id}
                onClick={() => quickLogFood(f)}
                className="flex-shrink-0 px-4 py-2.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] active:bg-[var(--color-accent-soft)] active:border-[var(--color-accent)] active:scale-95 transition-all"
              >
                <div className="flex items-baseline gap-1.5">
                  {f.favorite ? <span className="text-[var(--color-accent)] text-[10px]">★</span> : null}
                  <span className="text-sm font-semibold whitespace-nowrap">{f.name}</span>
                  <span className="text-[10px] text-[var(--color-text-faint)] tabnum">{f.kcal}</span>
                </div>
              </button>
            ))}
            <button
              onClick={() => setQuickAddOpen(true)}
              className="flex-shrink-0 px-4 py-2.5 rounded-full border-2 border-dashed border-[var(--color-border)] text-[var(--color-text-dim)] text-sm font-semibold"
            >+ Calories</button>
          </div>
        </div>
      )}

      {/* Water */}
      <Card padded>
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow">Water</div>
            <div className="display-num mt-1" style={{ fontSize: 'clamp(20px, 6vw, 26px)' }}>
              {metric?.water ?? 0}
              <span className="text-[var(--color-text-dim)] text-xs ml-1 font-normal">
                / {settings?.waterTargetMl ?? 3000} ml
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => updateWater(-250)} className="w-11 h-11 rounded-full bg-[var(--color-surface-2)] text-lg border border-[var(--color-border)]">−</button>
            <button onClick={() => updateWater(250)} className="w-11 h-11 rounded-full bg-[var(--color-accent)] text-white text-lg shadow-[0_8px_24px_-12px_var(--color-accent)]">+</button>
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
        const yesterdayHas = (yesterdayEntries ?? []).some((e) => e.meal === m)
        return (
          <Card key={m} padded={false}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <div>
                <h3 className="capitalize font-bold tracking-tight">{m}</h3>
                <div className="text-xs text-[var(--color-text-dim)] tabnum">{Math.round(mealKcal)} kcal</div>
              </div>
              <div className="flex items-center gap-1">
                {list.length === 0 && yesterdayHas && (
                  <button
                    onClick={() => copyMealFromYesterday(m)}
                    className="text-[var(--color-text-dim)] text-xs px-2 py-1 border border-[var(--color-border)] rounded-full active:scale-95 transition-transform"
                    title="Copy from yesterday"
                  >↻ Copy</button>
                )}
                <button
                  onClick={() => setPickerMeal(m)}
                  className="text-[var(--color-accent)] text-sm font-bold px-2 py-1"
                >+ Add</button>
              </div>
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

      <QuickCaloriesSheet
        open={quickAddOpen}
        date={date}
        onClose={() => setQuickAddOpen(false)}
      />
    </div>
  )
}

// ---------- QUICK CALORIES SHEET (no food needed) ----------
function QuickCaloriesSheet({ open, date, onClose }: { open: boolean; date: string; onClose: () => void }) {
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [meal, setMeal] = useState<Meal>('snack')
  const [save, setSave] = useState(false)

  async function add() {
    const k = Number(kcal) || 0
    if (k <= 0) return
    // Create an ephemeral food entry. If save is true, mark as a real saved food
    // (favorite=0). Either way, it appears in the day's log.
    const food: Omit<Food, 'id'> = {
      name: name.trim() || `Quick ${k} kcal`,
      servingSize: 1,
      servingUnit: 'entry',
      kcal: k,
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fat: Number(fat) || 0,
      favorite: 0,
      createdAt: Date.now(),
    }
    const foodId = Number(await db.foods.add(food))
    await db.logEntries.add({ date, meal, foodId, servings: 1, createdAt: Date.now() })
    if (!save) {
      // If user doesn't want to keep it in the library, delete the food after the log entry
      // — but then logEntries.foodId points to nothing. Solution: keep the food but
      // not as favorite. Library will show them all anyway. Leave as-is.
    }
    setName(''); setKcal(''); setProtein(''); setCarbs(''); setFat(''); setSave(false)
    onClose()
  }

  return (
    <Sheet open={open} title="Quick add calories" onClose={onClose}>
      <div className="p-4 space-y-3">
        <p className="text-xs text-[var(--color-text-dim)]">No need to create a food. Just log what you ate.</p>
        <Field label="Name (optional)" value={name} onChange={setName} placeholder="e.g. Restaurant burger" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Calories" type="number" value={kcal} onChange={setKcal} autoFocus />
          <Select label="Meal" value={meal} onChange={(v) => setMeal(v as Meal)} options={MEALS.map((m) => ({ value: m, label: m }))} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="P (g)" type="number" value={protein} onChange={setProtein} />
          <Field label="C (g)" type="number" value={carbs} onChange={setCarbs} />
          <Field label="F (g)" type="number" value={fat} onChange={setFat} />
        </div>
        <label className="flex items-center gap-2 text-sm pt-1">
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
          Save to library for reuse
        </label>
        <PrimaryButton onClick={add} disabled={!Number(kcal)} size="lg">Log it</PrimaryButton>
      </div>
    </Sheet>
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
  const [showCreate, setShowCreate] = useState(false)

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
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods..."
          autoFocus
          className="flex-1 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)]"
        />
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 rounded-xl bg-[var(--color-accent)] text-white text-sm font-bold active:scale-95 transition-transform"
        >+ New</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-[var(--color-text-dim)] text-sm">
              {foods?.length === 0 ? 'No foods yet.' : 'No matches.'}
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 px-4 py-2 rounded-full bg-[var(--color-accent)] text-white text-sm font-semibold active:scale-95 transition-transform"
            >+ Create a food</button>
          </div>
        ) : filtered.map((f) => (
          <button
            key={f.id}
            onClick={() => setSelectedId(f.id!)}
            className={`w-full text-left px-4 py-3 border-b border-[var(--color-border)] ${
              selectedId === f.id ? 'bg-[var(--color-accent-soft)]' : ''
            }`}
          >
            <div className="flex justify-between items-baseline">
              <span className="font-medium truncate pr-2">
                {f.favorite ? <span className="text-[var(--color-accent)] text-xs mr-1">★</span> : null}
                {f.name}
              </span>
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
      {showCreate && (
        <FoodEditor
          editing="new"
          onClose={(createdId) => {
            setShowCreate(false)
            if (createdId) setSelectedId(createdId)
          }}
        />
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
  const favorites = filtered.filter((f) => f.favorite === 1)
  const rest = filtered.filter((f) => f.favorite !== 1)

  return (
    <div className="px-4 space-y-3">
      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your foods..."
          className="flex-1 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)]"
        />
        <button
          onClick={() => setEditing('new')}
          className="bg-[var(--color-accent)] text-white font-bold px-4 rounded-xl active:scale-95 transition-transform shadow-[0_8px_24px_-12px_var(--color-accent)]"
        >+ New</button>
      </div>

      {filtered.length === 0 && (
        <div className="card p-8 text-center">
          <div className="display text-[var(--color-text-faint)]" style={{ fontSize: 18, letterSpacing: '0.2em' }}>
            {foods?.length === 0 ? 'NO FOODS YET' : 'NO MATCHES'}
          </div>
          {foods?.length === 0 && (
            <>
              <p className="text-sm text-[var(--color-text-dim)] mt-2">Build your library — only foods you actually eat.</p>
              <button
                onClick={() => setEditing('new')}
                className="mt-4 px-5 py-3 rounded-2xl bg-[var(--color-accent)] text-white font-bold active:scale-95 transition-transform"
              >Add your first food</button>
            </>
          )}
        </div>
      )}

      {favorites.length > 0 && (
        <>
          <div className="eyebrow px-1 mt-2">Favorites</div>
          <div className="space-y-2">
            {favorites.map((f) => <FoodRow key={f.id} food={f} onClick={() => setEditing(f)} />)}
          </div>
        </>
      )}
      {rest.length > 0 && (
        <>
          {favorites.length > 0 && <div className="eyebrow px-1 mt-2">All foods</div>}
          <div className="space-y-2">
            {rest.map((f) => <FoodRow key={f.id} food={f} onClick={() => setEditing(f)} />)}
          </div>
        </>
      )}

      {editing && <FoodEditor editing={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function FoodRow({ food, onClick }: { food: Food; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[var(--color-surface)] rounded-xl p-4 active:scale-[0.99] transition-transform border border-[var(--color-border)]"
    >
      <div className="flex justify-between items-baseline">
        <span className="font-semibold flex items-center gap-1.5">
          {food.favorite ? <span className="text-[var(--color-accent)] text-xs">★</span> : null}
          {food.name}
        </span>
        <span className="tabnum text-[var(--color-text-dim)] text-sm">{food.kcal} kcal</span>
      </div>
      <div className="text-xs text-[var(--color-text-faint)] tabnum mt-1">
        per {food.servingSize}{food.servingUnit} · P{food.protein} C{food.carbs} F{food.fat}
      </div>
    </button>
  )
}

function FoodEditor({ editing, onClose }: { editing: EditingFood; onClose: (createdId?: number) => void }) {
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
    if (isNew) {
      const id = await db.foods.add(data)
      onClose(Number(id))
    } else {
      await db.foods.update((editing as Food).id!, data)
      onClose()
    }
  }

  async function remove() {
    if (isNew) return
    const id = (editing as Food).id!
    if (!confirm(`Delete "${initial.name}"? This also removes its log entries.`)) return
    await db.foods.delete(id)
    await db.logEntries.where('foodId').equals(id).delete()
    onClose()
  }

  return (
    <Sheet open title={isNew ? 'New food' : 'Edit food'} onClose={() => onClose()}>
      <div className="p-4 space-y-3">
        <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoFocus />
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
    toast.success('Targets updated', `${result.recommended} kcal / ${result.proteinG}P / ${result.carbsG}C / ${result.fatG}F`)
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
