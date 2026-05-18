import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings, saveSettings, type Peptide } from '../db'
import { today, shiftDate } from '../lib/date'
import { calculateReconstitution, SCHEDULE_OPTIONS, isDueOn } from '../lib/peptide'
import { exportBackup, importBackup } from '../lib/backup'
import { syncToGist, restoreFromGist, daysSinceLastBackup } from '../lib/autoBackup'
import { downloadSnapshot, hasSnapshot } from '../lib/preflight'
import { addStarterExercises, addStarterFoods } from '../db/seed'
import { toast } from '../lib/toast'
import { EmptyState, EmptyIcons } from '../components/EmptyState'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { DayDetailSheet } from '../components/DayDetailSheet'
import { Header } from '../components/Header'
import { Card } from '../components/Card'
import { HeatmapCalendar, type DayValue } from '../components/HeatmapCalendar'
import { Sheet } from '../components/Sheet'
import { Field, Select } from '../components/Field'
import { PrimaryButton } from '../components/PrimaryButton'

export function More() {
  // Acts as the Settings screen now. Calendar + Peptides moved to Progress.
  return (
    <div className="pb-32">
      <Header title="Settings" subtitle="Make it yours" />
      <ErrorBoundary fallbackLabel="Settings hit a bug.">
        <SettingsTab />
      </ErrorBoundary>
    </div>
  )
}

// ---------- CALENDAR ----------
export function CalendarTab() {
  const sessions = useLiveQuery(() => db.workoutSessions.toArray(), [])
  const logEntries = useLiveQuery(() => db.logEntries.toArray(), [])
  const foods = useLiveQuery(() => db.foods.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const measurements = useLiveQuery(() => db.measurements.toArray(), [])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

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
        <HeatmapCalendar values={values} onSelect={(iso) => setSelectedDay(iso)} />
        <div className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wider font-semibold mt-3 text-center">
          Tap any day to view / edit
        </div>
      </Card>
      <DayDetailSheet iso={selectedDay} onClose={() => setSelectedDay(null)} />

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
export function PeptidesTab() {
  // Defensive queries — avoid chained Collection ops that can be brittle.
  const peptides = useLiveQuery(async () => {
    const all = await db.peptides.toArray()
    return all.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  }, [])
  const doses = useLiveQuery(async () => {
    const all = await db.peptideDoses.toArray()
    return all
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, 50)
  }, [])
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
          <EmptyState
            icon={EmptyIcons.capsule}
            title="NO PROTOCOLS"
            body="Track peptides with dose, schedule, and cycle length. Calculator built in."
            compact
          />
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
  const [fileEl, setFileEl] = useState<HTMLInputElement | null>(null)
  const [showGist, setShowGist] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastBackupDays, setLastBackupDays] = useState<number | null>(null)

  useEffect(() => {
    daysSinceLastBackup().then((d) => setLastBackupDays(Number.isFinite(d) ? d : null))
  }, [settings?.lastBackupAt, settings?.lastGistSyncAt])

  function flash(m: string) {
    // Route all status messages through the global toast
    toast.show(m)
  }

  async function onExport() {
    try {
      await exportBackup()
      await saveSettings({ lastBackupAt: Date.now() })
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

  async function onGistSync() {
    setBusy(true)
    try {
      const { id, updated } = await syncToGist()
      flash(updated ? 'Synced to cloud.' : `New gist created (${id.slice(0, 6)}…)`)
    } catch (e) {
      flash('Cloud sync failed: ' + (e as Error).message)
    } finally { setBusy(false) }
  }

  async function onGistRestore() {
    if (!confirm('Restore from cloud? Replaces all local data.')) return
    setBusy(true)
    try {
      await restoreFromGist()
      flash('Restored from cloud.')
    } catch (e) {
      flash('Restore failed: ' + (e as Error).message)
    } finally { setBusy(false) }
  }

  async function loadStarterFoodsClick() {
    const n = await addStarterFoods()
    flash(n > 0 ? `Added ${n} starter foods.` : 'You already have foods — none added.')
  }
  async function loadStarterExercisesClick() {
    const n = await addStarterExercises()
    flash(n > 0 ? `Added ${n} starter exercises.` : 'You already have exercises — none added.')
  }

  if (!settings) return <div className="px-4">Loading...</div>

  const backupStatus =
    lastBackupDays === null ? { label: 'Never backed up', tone: 'danger' as const } :
    lastBackupDays < 1       ? { label: 'Backed up today',     tone: 'good' as const } :
    lastBackupDays < 7       ? { label: `${Math.floor(lastBackupDays)}d ago`, tone: 'ok' as const } :
                               { label: `${Math.floor(lastBackupDays)}d ago — overdue`, tone: 'danger' as const }

  return (
    <div className="px-4 space-y-3">
      <Card title="Profile">
        <div className="space-y-3">
          <Field label="Name" value={settings.name ?? ''} onChange={(v) => saveSettings({ name: v })} placeholder="Optional" />
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

      <Card title="Backup" action={
        <span className={`text-xs font-bold uppercase tracking-wider ${
          backupStatus.tone === 'good' ? 'text-[var(--color-good)]' :
          backupStatus.tone === 'danger' ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-dim)]'
        }`}>{backupStatus.label}</span>
      }>
        <p className="text-xs text-[var(--color-text-dim)] mb-3 leading-relaxed">
          iOS Safari can wipe site data after ~7 days. Export weekly to Files / iCloud, or set up cloud sync.
        </p>
        <div className="space-y-2">
          <PrimaryButton onClick={onExport}>Download backup (.json)</PrimaryButton>
          <PrimaryButton onClick={() => fileEl?.click()} variant="ghost">Import backup…</PrimaryButton>
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
          {hasSnapshot() && (
            <PrimaryButton
              variant="ghost"
              onClick={() => {
                const ok = downloadSnapshot()
                flash(ok ? 'Pre-v3 snapshot downloaded' : 'No snapshot found')
              }}
            >Download pre-v3 snapshot</PrimaryButton>
          )}
        </div>
      </Card>

      <Card title="Cloud sync (GitHub Gist)" action={
        settings.gistToken ? (
          <span className="text-xs font-bold text-[var(--color-good)]">CONNECTED</span>
        ) : null
      }>
        <p className="text-xs text-[var(--color-text-dim)] leading-relaxed mb-3">
          Paste a free GitHub Personal Access Token (classic, <span className="font-semibold">gist</span> scope only) and the app auto-syncs your data to a private gist daily.
        </p>
        <div className="space-y-2">
          <PrimaryButton onClick={() => setShowGist(true)} variant="ghost">
            {settings.gistToken ? 'Edit connection' : 'Set up cloud sync'}
          </PrimaryButton>
          {settings.gistToken && (
            <>
              <PrimaryButton onClick={onGistSync} disabled={busy}>
                {busy ? 'Syncing…' : 'Sync to cloud now'}
              </PrimaryButton>
              {settings.gistId && (
                <PrimaryButton onClick={onGistRestore} variant="ghost" disabled={busy}>
                  Restore from cloud
                </PrimaryButton>
              )}
            </>
          )}
        </div>
      </Card>

      <Card title="Starter content">
        <p className="text-xs text-[var(--color-text-dim)] mb-3 leading-relaxed">
          Optional helpers. Only adds items if the table is empty — won't duplicate.
        </p>
        <div className="space-y-2">
          <PrimaryButton onClick={loadStarterFoodsClick} variant="ghost">Add 10 starter foods</PrimaryButton>
          <PrimaryButton onClick={loadStarterExercisesClick} variant="ghost">Add 24 starter exercises</PrimaryButton>
        </div>
      </Card>

      <Card title="Theme">
        <div className="space-y-3">
          <div>
            <div className="text-xs text-[var(--color-text-dim)] mb-2">Accent color</div>
            <div className="flex gap-2.5">
              {THEME_SWATCHES.map((sw) => {
                const active = (settings.accentColor ?? '#ff2d3d').toLowerCase() === sw.hex.toLowerCase()
                return (
                  <button
                    key={sw.hex}
                    onClick={() => saveSettings({ accentColor: sw.hex })}
                    className={`w-11 h-11 rounded-full border-2 transition-all active:scale-90 ${
                      active ? 'scale-110 border-white' : 'border-transparent'
                    }`}
                    style={{ background: sw.hex }}
                    aria-label={sw.name}
                  />
                )
              })}
            </div>
          </div>
          <label className="flex items-center justify-between text-sm pt-1">
            <span>
              <span className="font-semibold">Sound effects</span>
              <span className="block text-xs text-[var(--color-text-dim)]">Set-completion tick, PR fanfare, rest-timer chime</span>
            </span>
            <input
              type="checkbox"
              checked={settings.soundOn === 1}
              onChange={(e) => saveSettings({ soundOn: e.target.checked ? 1 : 0 })}
              className="w-5 h-5"
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>
              <span className="font-semibold">Restart onboarding</span>
              <span className="block text-xs text-[var(--color-text-dim)]">Walk through the welcome flow again</span>
            </span>
            <button
              onClick={async () => {
                if (!confirm('Restart onboarding? Your data stays intact.')) return
                await saveSettings({ onboardedAt: undefined })
              }}
              className="text-[var(--color-accent)] font-bold text-sm px-3 py-1.5 rounded-full border border-[var(--color-accent)]/40"
            >Restart</button>
          </label>
        </div>
      </Card>

      <Card title="About">
        <div className="text-xs text-[var(--color-text-faint)] leading-relaxed">
          Dialed Dawg v0.3 · Local-first PWA. All data lives on this device.
          Add to home screen for the full-screen experience.
        </div>
      </Card>

      {showGist && <GistSetupSheet onClose={() => setShowGist(false)} flash={flash} />}
    </div>
  )
}

const THEME_SWATCHES = [
  { name: 'Red',    hex: '#ff2d3d' },
  { name: 'Orange', hex: '#ff6b1a' },
  { name: 'Amber',  hex: '#facc15' },
  { name: 'Green',  hex: '#22c55e' },
  { name: 'Blue',   hex: '#3b82f6' },
  { name: 'Purple', hex: '#a855f7' },
]

function GistSetupSheet({ onClose, flash }: { onClose: () => void; flash: (m: string) => void }) {
  const settings = useLiveQuery(() => getSettings(), [])
  const [token, setToken] = useState('')
  const [gistId, setGistId] = useState('')

  // Pre-fill once settings load
  if (settings && token === '' && settings.gistToken && !gistId) {
    // we don't actually surface the token (security), but allow editing gistId
  }

  async function save() {
    await saveSettings({
      gistToken: token.trim() || undefined,
      gistId: gistId.trim() || undefined,
    })
    flash(token ? 'Connected.' : 'Cloud sync removed.')
    onClose()
  }

  async function disconnect() {
    if (!confirm('Remove cloud sync? The gist itself stays on GitHub.')) return
    await saveSettings({ gistToken: undefined, gistId: undefined, lastGistSyncAt: undefined })
    flash('Cloud sync removed.')
    onClose()
  }

  return (
    <Sheet open title="GitHub Gist sync" onClose={onClose}>
      <div className="p-4 space-y-3 text-sm">
        <p className="text-[var(--color-text-dim)] leading-relaxed">
          1. On GitHub, go to <span className="font-mono text-xs bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded">Settings → Developer settings → Personal access tokens (classic)</span>.
        </p>
        <p className="text-[var(--color-text-dim)] leading-relaxed">
          2. Generate new token — give it a name, check only the <span className="font-bold text-[var(--color-accent)]">gist</span> scope, generate.
        </p>
        <p className="text-[var(--color-text-dim)] leading-relaxed">
          3. Paste the token here.
        </p>
        <Field
          label="GitHub Token"
          value={token}
          onChange={setToken}
          type="password"
          placeholder={settings?.gistToken ? '(saved — paste new to replace)' : 'ghp_…'}
          autoFocus
        />
        <Field
          label="Existing Gist ID (optional)"
          value={gistId}
          onChange={setGistId}
          placeholder={settings?.gistId ?? 'leave blank — auto-created on first sync'}
        />
        <p className="text-[11px] text-[var(--color-text-faint)] leading-relaxed">
          Token is stored only on this device. If you ever revoke it on GitHub, it stops working — no harm done.
        </p>
        <div className="flex gap-2 pt-1">
          {settings?.gistToken && (
            <PrimaryButton onClick={disconnect} variant="danger" block={false}>Disconnect</PrimaryButton>
          )}
          <PrimaryButton onClick={save} size="lg">Save</PrimaryButton>
        </div>
      </div>
    </Sheet>
  )
}
