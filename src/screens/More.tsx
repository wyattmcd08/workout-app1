import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings, saveSettings, type Peptide } from '../db'
import { today, shiftDate } from '../lib/date'
import { calculateReconstitution, SCHEDULE_OPTIONS, isDueOn } from '../lib/peptide'
import { exportBackup, importBackup } from '../lib/backup'
import { Header, Segmented } from '../components/Header'
import { Card } from '../components/Card'
import { HeatmapCalendar, type DayValue } from '../components/HeatmapCalendar'
import { Sheet } from '../components/Sheet'
import { Field, Select } from '../components/Field'
import { PrimaryButton } from '../components/PrimaryButton'

type View = 'calendar' | 'peptides' | 'settings'

export function More() {
  const [view, setView] = useState<View>('calendar')
  return (
    <div className="pb-32">
      <Header title="More" subtitle="Calendar, peptides, settings" />
      <div className="px-4 mb-3">
        <Segmented<View>
          options={[
            { value: 'calendar', label: 'Calendar' },
            { value: 'peptides', label: 'Peptides' },
            { value: 'settings', label: 'Settings' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'calendar' && <CalendarTab />}
      {view === 'peptides' && <PeptidesTab />}
      {view === 'settings' && <SettingsTab />}
    </div>
  )
}

// ---------- CALENDAR ----------
function CalendarTab() {
  const sessions = useLiveQuery(() => db.workoutSessions.toArray(), [])
  const logEntries = useLiveQuery(() => db.logEntries.toArray(), [])
  const foods = useLiveQuery(() => db.foods.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const measurements = useLiveQuery(() => db.measurements.toArray(), [])

  const foodById = new Map((foods ?? []).map((f) => [f.id!, f]))
  const sessionDates = new Set((sessions ?? []).map((s) => s.date))

  // Calculate kcal per date
  const kcalByDate = new Map<string, number>()
  for (const e of logEntries ?? []) {
    const f = foodById.get(e.foodId)
    if (!f) continue
    kcalByDate.set(e.date, (kcalByDate.get(e.date) ?? 0) + f.kcal * e.servings)
  }

  const target = settings?.kcal ?? 2400

  const values: DayValue[] = useMemo(() => {
    const all = new Set([...sessionDates, ...kcalByDate.keys(), ...(measurements ?? []).map((m) => m.date)])
    return Array.from(all).map((iso) => {
      const workoutLogged = sessionDates.has(iso)
      const kcal = kcalByDate.get(iso) ?? 0
      const kcalHit = kcal >= target * 0.85 && kcal <= target * 1.15
      let level: 0 | 1 | 2 | 3 | 4 = 0
      if (workoutLogged && kcalHit) level = 4
      else if (workoutLogged) level = 3
      else if (kcalHit) level = 2
      else if (kcal > 0) level = 1
      return { iso, level, workoutLogged, kcalHit }
    })
  }, [Array.from(sessionDates).join(','), Array.from(kcalByDate.entries()).map(([k, v]) => `${k}:${v}`).join(','), target])

  // Last 30 days streak / consistency
  const todayISO = today()
  const last30 = Array.from({ length: 30 }, (_, i) => shiftDate(todayISO, -i))
  const workoutsLast30 = last30.filter((d) => sessionDates.has(d)).length
  const consistencyPct = Math.round((workoutsLast30 / 30) * 100)

  let streak = 0
  for (let i = 0; i < 365; i++) {
    if (sessionDates.has(shiftDate(todayISO, -i))) streak++
    else if (i > 0) break
  }

  return (
    <div className="px-4 space-y-3">
      <Card padded>
        <HeatmapCalendar values={values} />
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card padded>
          <div className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider">Streak</div>
          <div className="font-bold tabnum text-[var(--color-accent)]" style={{ fontSize: 'clamp(20px, 6vw, 26px)' }}>{streak}<span className="text-sm text-[var(--color-text-dim)] font-normal ml-1">d</span></div>
        </Card>
        <Card padded>
          <div className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider">30-day</div>
          <div className="font-bold tabnum" style={{ fontSize: 'clamp(20px, 6vw, 26px)' }}>{workoutsLast30}<span className="text-sm text-[var(--color-text-dim)] font-normal ml-1">/30</span></div>
        </Card>
        <Card padded>
          <div className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider">Consistency</div>
          <div className="font-bold tabnum" style={{ fontSize: 'clamp(20px, 6vw, 26px)' }}>{consistencyPct}<span className="text-sm text-[var(--color-text-dim)] font-normal ml-1">%</span></div>
        </Card>
      </div>

      <Card title="Legend">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ background: 'rgba(255,45,61,0.25)' }} />Meals only</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ background: 'rgba(255,45,61,0.45)' }} />Hit kcal</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ background: 'rgba(255,45,61,0.7)' }} />Trained</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ background: 'rgba(255,45,61,1)' }} />Both ✓</div>
        </div>
      </Card>
    </div>
  )
}

// ---------- PEPTIDES ----------
function PeptidesTab() {
  const peptides = useLiveQuery(() => db.peptides.orderBy('createdAt').toArray(), [])
  const doses = useLiveQuery(() => db.peptideDoses.orderBy('date').reverse().limit(50).toArray(), [])
  const [editing, setEditing] = useState<Peptide | 'new' | null>(null)
  const [calcOpen, setCalcOpen] = useState(false)
  const todayISO = today()

  async function logDose(p: Peptide) {
    await db.peptideDoses.add({
      peptideId: p.id!,
      date: todayISO,
      takenAt: Date.now(),
      doseMcg: p.doseMcg,
    })
  }

  const dosesByPeptide = new Map<number, number>()
  for (const d of doses ?? []) {
    if (d.date === todayISO) dosesByPeptide.set(d.peptideId, (dosesByPeptide.get(d.peptideId) ?? 0) + 1)
  }

  return (
    <div className="px-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <PrimaryButton onClick={() => setEditing('new')}>+ Add peptide</PrimaryButton>
        <PrimaryButton onClick={() => setCalcOpen(true)} variant="ghost">Recon calc</PrimaryButton>
      </div>

      <Card title="Today's schedule">
        {(peptides ?? []).filter((p) => p.active && isDueOn(p.schedule, todayISO)).length === 0 ? (
          <div className="text-sm text-[var(--color-text-dim)]">Nothing due today.</div>
        ) : (
          (peptides ?? []).filter((p) => p.active && isDueOn(p.schedule, todayISO)).map((p) => {
            const taken = dosesByPeptide.get(p.id!) ?? 0
            return (
              <div key={p.id} className="flex items-center justify-between py-2 border-t border-[var(--color-border)] first:border-t-0">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-[var(--color-text-faint)]">{p.doseMcg} mcg</div>
                </div>
                <button
                  onClick={() => logDose(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                    taken > 0 ? 'bg-[var(--color-good)]/20 text-[var(--color-good)]' : 'bg-[var(--color-accent)] text-white'
                  }`}
                >{taken > 0 ? `✓ ${taken}` : 'Take'}</button>
              </div>
            )
          })
        )}
      </Card>

      <Card title="Stack">
        {(peptides ?? []).length === 0 ? (
          <div className="text-sm text-[var(--color-text-dim)]">No peptides yet.</div>
        ) : (
          <div className="space-y-2">
            {(peptides ?? []).map((p) => (
              <button
                key={p.id}
                onClick={() => setEditing(p)}
                className="w-full text-left bg-[var(--color-surface-2)] rounded-xl p-3"
              >
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold">{p.name}</span>
                  <span className={`text-[10px] uppercase tracking-wider ${p.active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-faint)]'}`}>
                    {p.active ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div className="text-xs text-[var(--color-text-dim)] tabnum mt-1">
                  {p.doseMcg} mcg · {SCHEDULE_OPTIONS.find((s) => s.value === p.schedule)?.label ?? p.schedule}
                  {p.protocolDays ? ` · ${p.protocolDays}d cycle` : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card title="Recent doses">
        {(doses ?? []).length === 0 ? (
          <div className="text-sm text-[var(--color-text-dim)]">No doses logged yet.</div>
        ) : (
          <ul className="text-sm divide-y divide-[var(--color-border)] -mx-4">
            {(doses ?? []).slice(0, 12).map((d) => {
              const p = (peptides ?? []).find((x) => x.id === d.peptideId)
              return (
                <li key={d.id} className="px-4 py-2 flex justify-between">
                  <span>{p?.name ?? '(deleted)'}</span>
                  <span className="text-[var(--color-text-dim)] tabnum">{d.date} · {d.doseMcg}mcg</span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {editing && <PeptideEditor editing={editing} onClose={() => setEditing(null)} />}
      {calcOpen && <ReconCalc onClose={() => setCalcOpen(false)} />}
    </div>
  )
}

function PeptideEditor({ editing, onClose }: { editing: Peptide | 'new'; onClose: () => void }) {
  const isNew = editing === 'new'
  const initial: Peptide = isNew
    ? { name: '', vialSizeMg: 5, bacWaterMl: 2, doseMcg: 250, syringeUnits: 100, schedule: 'daily', active: 1, createdAt: Date.now() }
    : editing as Peptide
  const [form, setForm] = useState({
    name: initial.name,
    vialSizeMg: String(initial.vialSizeMg),
    bacWaterMl: String(initial.bacWaterMl),
    doseMcg: String(initial.doseMcg),
    syringeUnits: String(initial.syringeUnits),
    schedule: initial.schedule,
    protocolDays: String(initial.protocolDays ?? ''),
    notes: initial.notes ?? '',
    active: initial.active === 1,
  })

  const recon = useMemo(() => calculateReconstitution({
    vialMg: Number(form.vialSizeMg) || 0,
    bacWaterMl: Number(form.bacWaterMl) || 0,
    doseMcg: Number(form.doseMcg) || 0,
    syringeUnits: Number(form.syringeUnits) || 100,
  }), [form.vialSizeMg, form.bacWaterMl, form.doseMcg, form.syringeUnits])

  async function save() {
    const data: Peptide = {
      name: form.name.trim(),
      vialSizeMg: Number(form.vialSizeMg) || 0,
      bacWaterMl: Number(form.bacWaterMl) || 0,
      doseMcg: Number(form.doseMcg) || 0,
      syringeUnits: Number(form.syringeUnits) || 100,
      schedule: form.schedule,
      protocolDays: form.protocolDays ? Number(form.protocolDays) : undefined,
      notes: form.notes || undefined,
      active: form.active ? 1 : 0,
      createdAt: initial.createdAt,
    }
    if (!data.name) return
    if (isNew) await db.peptides.add(data)
    else await db.peptides.update((editing as Peptide).id!, data)
    onClose()
  }

  async function remove() {
    if (isNew) return
    const id = (editing as Peptide).id!
    if (!confirm('Delete this peptide and all its dose history?')) return
    await db.peptides.delete(id)
    await db.peptideDoses.where('peptideId').equals(id).delete()
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? 'New peptide' : 'Edit peptide'} fullHeight>
      <div className="p-4 space-y-3">
        <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="BPC-157" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vial (mg)" type="number" value={form.vialSizeMg} onChange={(v) => setForm({ ...form, vialSizeMg: v })} />
          <Field label="BAC water (ml)" type="number" value={form.bacWaterMl} onChange={(v) => setForm({ ...form, bacWaterMl: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dose (mcg)" type="number" value={form.doseMcg} onChange={(v) => setForm({ ...form, doseMcg: v })} />
          <Field label="Syringe units" type="number" value={form.syringeUnits} onChange={(v) => setForm({ ...form, syringeUnits: v })} />
        </div>
        <Card title="Reconstitution result">
          <div className="space-y-1 text-sm">
            <Row label="Concentration" value={`${recon.mgPerMl} mg/mL`} />
            <Row label="Per syringe unit" value={`${recon.mcgPerUnit} mcg`} />
            <Row label="Draw" value={`${recon.drawUnits} units (${recon.drawMl} mL)`} accent />
            <Row label="Doses per vial" value={`~${recon.totalDosesInVial}`} />
          </div>
        </Card>
        <Select label="Schedule" value={form.schedule} onChange={(v) => setForm({ ...form, schedule: v })} options={SCHEDULE_OPTIONS} />
        <Field label="Cycle length days (opt)" type="number" value={form.protocolDays} onChange={(v) => setForm({ ...form, protocolDays: v })} />
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider font-medium">Notes</span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)]"
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          <span className="text-sm">Active in stack</span>
        </label>
        <div className="flex gap-2 pt-2">
          {!isNew && <PrimaryButton onClick={remove} variant="danger" block={false}>Delete</PrimaryButton>}
          <PrimaryButton onClick={save} disabled={!form.name.trim()} size="lg">Save</PrimaryButton>
        </div>
      </div>
    </Sheet>
  )
}

function ReconCalc({ onClose }: { onClose: () => void }) {
  const [vialMg, setVialMg] = useState('5')
  const [bacMl, setBacMl] = useState('2')
  const [doseMcg, setDoseMcg] = useState('250')
  const [units, setUnits] = useState('100')
  const r = calculateReconstitution({
    vialMg: Number(vialMg) || 0,
    bacWaterMl: Number(bacMl) || 0,
    doseMcg: Number(doseMcg) || 0,
    syringeUnits: Number(units) || 100,
  })
  return (
    <Sheet open onClose={onClose} title="Reconstitution Calculator">
      <div className="p-4 space-y-3">
        <Field label="Vial size (mg)" type="number" value={vialMg} onChange={setVialMg} />
        <Field label="BAC water (ml)" type="number" value={bacMl} onChange={setBacMl} />
        <Field label="Dose (mcg)" type="number" value={doseMcg} onChange={setDoseMcg} />
        <Field label="Syringe units" type="number" value={units} onChange={setUnits} hint="100 for a typical insulin syringe (1mL)" />
        <Card title="Result">
          <div className="space-y-1 text-sm">
            <Row label="Concentration" value={`${r.mgPerMl} mg/mL`} />
            <Row label="Per unit" value={`${r.mcgPerUnit} mcg`} />
            <Row label="Draw" value={`${r.drawUnits} units`} accent />
            <Row label="(= ml)" value={`${r.drawMl} mL`} />
            <Row label="Doses per vial" value={`~${r.totalDosesInVial}`} />
          </div>
        </Card>
      </div>
    </Sheet>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[var(--color-text-dim)]">{label}</span>
      <span className={`tabnum font-semibold ${accent ? 'text-[var(--color-accent)]' : ''}`}>{value}</span>
    </div>
  )
}

// ---------- SETTINGS ----------
function SettingsTab() {
  const settings = useLiveQuery(() => getSettings(), [])
  const [message, setMessage] = useState<string | null>(null)
  const [fileEl, setFileEl] = useState<HTMLInputElement | null>(null)

  function flash(m: string) {
    setMessage(m)
    setTimeout(() => setMessage(null), 2500)
  }

  async function onExport() {
    try {
      await exportBackup()
      flash('Backup downloaded.')
    } catch (e) {
      flash('Export failed: ' + (e as Error).message)
    }
  }

  async function onImport(file: File) {
    if (!confirm('Importing will REPLACE all current data. Continue?')) return
    try {
      await importBackup(file)
      flash('Backup restored.')
    } catch (e) {
      flash('Import failed: ' + (e as Error).message)
    }
  }

  if (!settings) return <div className="px-4">Loading...</div>

  return (
    <div className="px-4 space-y-3">
      <Card title="Profile">
        <div className="space-y-3">
          <Select label="Units" value={settings.units} onChange={(v) => saveSettings({ units: v as 'metric' | 'imperial' })} options={[
            { value: 'imperial', label: 'Imperial (lb, in)' }, { value: 'metric', label: 'Metric (kg, cm)' },
          ]} />
        </div>
      </Card>

      <Card title="Targets">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Calories" type="number" value={settings.kcal} onChange={(v) => saveSettings({ kcal: Number(v) || 0 })} />
          <Field label="Protein (g)" type="number" value={settings.protein} onChange={(v) => saveSettings({ protein: Number(v) || 0 })} />
          <Field label="Carbs (g)" type="number" value={settings.carbs} onChange={(v) => saveSettings({ carbs: Number(v) || 0 })} />
          <Field label="Fat (g)" type="number" value={settings.fat} onChange={(v) => saveSettings({ fat: Number(v) || 0 })} />
          <Field label="Fiber (g)" type="number" value={settings.fiber ?? 30} onChange={(v) => saveSettings({ fiber: Number(v) || 0 })} />
          <Field label="Sodium (mg)" type="number" value={settings.sodium ?? 2300} onChange={(v) => saveSettings({ sodium: Number(v) || 0 })} />
          <Field label="Water (ml)" type="number" value={settings.waterTargetMl ?? 3000} onChange={(v) => saveSettings({ waterTargetMl: Number(v) || 0 })} />
          <Field label="Sleep (hr)" type="number" value={settings.sleepTargetHrs ?? 8} onChange={(v) => saveSettings({ sleepTargetHrs: Number(v) || 0 })} />
        </div>
      </Card>

      <Card title="Backup">
        <p className="text-xs text-[var(--color-text-dim)] mb-3">
          iOS Safari can wipe site data after ~7 days. Export weekly to Files / iCloud.
        </p>
        <div className="space-y-2">
          <PrimaryButton onClick={onExport} variant="ghost">Export backup (.json)</PrimaryButton>
          <PrimaryButton onClick={() => fileEl?.click()} variant="ghost">Import backup...</PrimaryButton>
          <input
            ref={setFileEl}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImport(f)
              e.target.value = ''
            }}
          />
        </div>
      </Card>

      <Card title="Cloud sync">
        <div className="text-sm text-[var(--color-text-dim)]">
          Coming later. For now, manual backup keeps your data safe.
        </div>
      </Card>

      <Card title="About">
        <div className="text-xs text-[var(--color-text-faint)] leading-relaxed">
          Dialed Dawg v0.1 · Local-first PWA. All data lives on this device.
          Add to home screen for the full-screen experience.
        </div>
      </Card>

      {message && (
        <div className="fixed bottom-24 left-4 right-4 bg-[var(--color-surface-2)] border border-[var(--color-border)] text-center py-3 rounded-xl z-50 animate-pop-in">
          {message}
        </div>
      )}
    </div>
  )
}
