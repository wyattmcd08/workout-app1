import { useState, useRef, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings, type BodyMeasurement, type ProgressPhoto, type PhotoView, type PhotoState, type PhotoLight } from '../db'
import { today, shiftDate } from '../lib/date'
import { computeFatigue, overallRecovery } from '../lib/recovery'
import { Header, Segmented } from '../components/Header'
import { Card, Stat } from '../components/Card'
import { BodyDiagram } from '../components/BodyDiagram'
import { Spark } from '../components/Spark'
import { Sheet } from '../components/Sheet'
import { Field, Select } from '../components/Field'
import { PrimaryButton } from '../components/PrimaryButton'

type View = 'recovery' | 'measure' | 'photos'

export function Body() {
  const [view, setView] = useState<View>('recovery')
  return (
    <div className="pb-32">
      <Header title="Body" subtitle="Track the temple" />
      <div className="px-4 mb-3">
        <Segmented<View>
          options={[
            { value: 'recovery', label: 'Recovery' },
            { value: 'measure', label: 'Stats' },
            { value: 'photos', label: 'Photos' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'recovery' && <Recovery />}
      {view === 'measure' && <Measurements />}
      {view === 'photos' && <Photos />}
    </div>
  )
}

// ---------- RECOVERY ----------
function Recovery() {
  const sets = useLiveQuery(() => db.workoutSets.toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const metrics = useLiveQuery(() => db.metrics.toArray(), [])
  const fatigues = computeFatigue({ sets: sets ?? [], exercises: exercises ?? [], metrics: metrics ?? [] })
  const score = overallRecovery(fatigues)

  const todayISO = today()
  const todayMetric = (metrics ?? []).find((m) => m.date === todayISO)
  const [showLog, setShowLog] = useState(false)

  return (
    <div className="px-4 space-y-3">
      <Card padded>
        <div className="flex items-center justify-between">
          <Stat label="Recovery score" value={`${score}%`} accent />
          <div className="text-right">
            <div className="text-xs text-[var(--color-text-faint)] uppercase tracking-wider">Status</div>
            <div className="font-bold">
              {score >= 80 ? 'Ready' : score >= 50 ? 'Building' : 'Drained'}
            </div>
          </div>
        </div>
      </Card>

      <Card padded>
        <BodyDiagram fatigues={fatigues} />
        <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
          <Legend color="var(--color-good)" label="Fresh" />
          <Legend color="var(--color-warn)" label="Moderate" />
          <Legend color="var(--color-danger)" label="Hammered" />
        </div>
      </Card>

      <Card title="Today's signals" action={
        <button onClick={() => setShowLog(true)} className="text-xs text-[var(--color-accent)] font-semibold">Log</button>
      }>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Sleep" value={todayMetric?.sleep ?? '—'} unit="hr" />
          <Stat label="Energy" value={todayMetric?.energy ?? '—'} unit="/10" />
          <Stat label="Water" value={todayMetric?.water ?? 0} unit="ml" />
        </div>
        {todayMetric?.notes && (
          <div className="text-xs text-[var(--color-text-dim)] mt-3 italic">"{todayMetric.notes}"</div>
        )}
      </Card>

      {showLog && <LogMetricSheet onClose={() => setShowLog(false)} />}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 h-3 rounded-full" style={{ background: color }} />
      <span className="text-[var(--color-text-dim)]">{label}</span>
    </div>
  )
}

function LogMetricSheet({ onClose }: { onClose: () => void }) {
  const todayISO = today()
  const existing = useLiveQuery(() => db.metrics.where('date').equals(todayISO).first(), [todayISO])
  const [sleep, setSleep] = useState(String(existing?.sleep ?? ''))
  const [energy, setEnergy] = useState(String(existing?.energy ?? ''))
  const [notes, setNotes] = useState(existing?.notes ?? '')

  async function save() {
    const patch = {
      sleep: sleep ? Number(sleep) : undefined,
      energy: energy ? Number(energy) : undefined,
      notes: notes || undefined,
    }
    if (existing?.id) await db.metrics.update(existing.id, patch)
    else await db.metrics.add({ date: todayISO, ...patch })
    onClose()
  }

  return (
    <Sheet open title="Log today" onClose={onClose}>
      <div className="p-4 space-y-3">
        <Field label="Sleep (hours)" type="number" value={sleep} onChange={setSleep} placeholder="7.5" />
        <Field label="Energy (1-10)" type="number" value={energy} onChange={setEnergy} placeholder="7" min="1" max="10" />
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider font-medium">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)]"
          />
        </label>
        <PrimaryButton onClick={save} size="lg">Save</PrimaryButton>
      </div>
    </Sheet>
  )
}

// ---------- MEASUREMENTS ----------
function Measurements() {
  const settings = useLiveQuery(() => getSettings(), [])
  const measurements = useLiveQuery(() => db.measurements.toArray(), [])
  const [editing, setEditing] = useState<BodyMeasurement | 'new' | null>(null)
  const unit = settings?.units === 'metric' ? 'kg' : 'lb'
  const lenUnit = settings?.units === 'metric' ? 'cm' : 'in'

  const sorted = (measurements ?? []).slice().sort((a, b) => a.date.localeCompare(b.date))
  const series = useMemo(() => ({
    weight: sorted.filter((m) => m.weight != null).map((m) => ({ date: m.date, value: m.weight as number })),
    bf:     sorted.filter((m) => m.bodyFat != null).map((m) => ({ date: m.date, value: m.bodyFat as number })),
    waist:  sorted.filter((m) => m.waist != null).map((m) => ({ date: m.date, value: m.waist as number })),
    arm:    sorted.filter((m) => m.arm != null).map((m) => ({ date: m.date, value: m.arm as number })),
    chest:  sorted.filter((m) => m.chest != null).map((m) => ({ date: m.date, value: m.chest as number })),
    leg:    sorted.filter((m) => m.leg != null).map((m) => ({ date: m.date, value: m.leg as number })),
  }), [sorted])

  const latest = sorted[sorted.length - 1]

  return (
    <div className="px-4 space-y-3">
      <Card padded>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider">Latest</div>
            <div className="text-xs text-[var(--color-text-faint)]">{latest?.date ?? '—'}</div>
          </div>
          <button
            onClick={() => setEditing('new')}
            className="bg-[var(--color-accent)] text-white font-semibold px-3 py-2 rounded-lg text-sm active:scale-95"
          >+ Log</button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Weight" value={latest?.weight ?? '—'} unit={unit} />
          <Stat label="BF%" value={latest?.bodyFat ?? '—'} unit="%" />
          <Stat label="Waist" value={latest?.waist ?? '—'} unit={lenUnit} />
        </div>
      </Card>

      <MeasurementChart title="Weight" data={series.weight} unit={unit} />
      <MeasurementChart title="Body fat %" data={series.bf} unit="%" />
      <MeasurementChart title="Waist" data={series.waist} unit={lenUnit} />
      <MeasurementChart title="Arm" data={series.arm} unit={lenUnit} />
      <MeasurementChart title="Chest" data={series.chest} unit={lenUnit} />
      <MeasurementChart title="Leg" data={series.leg} unit={lenUnit} />

      <Card title="History">
        {sorted.length === 0 ? (
          <div className="text-sm text-[var(--color-text-dim)] py-2">No entries yet.</div>
        ) : (
          <ul className="divide-y divide-[var(--color-border)] -mx-4">
            {sorted.slice().reverse().map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => setEditing(m)}
                  className="w-full text-left px-4 py-2.5 active:bg-[var(--color-surface-2)]"
                >
                  <div className="flex justify-between text-sm">
                    <span>{m.date}</span>
                    <span className="tabnum text-[var(--color-text-dim)]">
                      {m.weight ? `${m.weight} ${unit}` : ''}
                      {m.bodyFat ? ` · ${m.bodyFat}%` : ''}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && <MeasurementEditor editing={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function MeasurementChart({ title, data, unit }: { title: string; data: { date: string; value: number }[]; unit: string }) {
  const latest = data[data.length - 1]?.value
  const first = data[0]?.value
  const delta = latest != null && first != null ? (latest - first) : null
  return (
    <Card title={title}>
      <div className="flex items-baseline justify-between mb-2">
        <div className="font-bold tabnum" style={{ fontSize: 'clamp(20px, 6vw, 24px)' }}>
          {latest != null ? `${latest}` : '—'}
          {latest != null && <span className="text-sm text-[var(--color-text-dim)] font-normal ml-1">{unit}</span>}
        </div>
        {delta != null && (
          <div className={`text-sm tabnum ${delta > 0 ? 'text-[var(--color-good)]' : delta < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-dim)]'}`}>
            {delta > 0 ? '+' : ''}{Math.round(delta * 10) / 10}
          </div>
        )}
      </div>
      <Spark data={data} height={60} />
    </Card>
  )
}

function MeasurementEditor({ editing, onClose }: { editing: BodyMeasurement | 'new'; onClose: () => void }) {
  const isNew = editing === 'new'
  const initial: BodyMeasurement = isNew
    ? { date: today(), createdAt: Date.now() }
    : editing as BodyMeasurement
  const [form, setForm] = useState({
    date: initial.date,
    weight: initial.weight?.toString() ?? '',
    bodyFat: initial.bodyFat?.toString() ?? '',
    waist: initial.waist?.toString() ?? '',
    chest: initial.chest?.toString() ?? '',
    arm: initial.arm?.toString() ?? '',
    leg: initial.leg?.toString() ?? '',
    notes: initial.notes ?? '',
  })

  async function save() {
    const data: BodyMeasurement = {
      date: form.date,
      weight: form.weight ? Number(form.weight) : undefined,
      bodyFat: form.bodyFat ? Number(form.bodyFat) : undefined,
      waist: form.waist ? Number(form.waist) : undefined,
      chest: form.chest ? Number(form.chest) : undefined,
      arm: form.arm ? Number(form.arm) : undefined,
      leg: form.leg ? Number(form.leg) : undefined,
      notes: form.notes || undefined,
      createdAt: initial.createdAt,
    }
    // upsert on date
    const existing = await db.measurements.where('date').equals(data.date).first()
    if (existing?.id) await db.measurements.update(existing.id, data)
    else await db.measurements.add(data)
    onClose()
  }

  async function remove() {
    if (isNew || !('id' in initial) || !initial.id) return
    if (!confirm('Delete this entry?')) return
    await db.measurements.delete(initial.id)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? 'Log measurement' : 'Edit'}>
      <div className="p-4 space-y-3">
        <Field label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weight" type="number" value={form.weight} onChange={(v) => setForm({ ...form, weight: v })} />
          <Field label="Body fat %" type="number" value={form.bodyFat} onChange={(v) => setForm({ ...form, bodyFat: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Waist" type="number" value={form.waist} onChange={(v) => setForm({ ...form, waist: v })} />
          <Field label="Chest" type="number" value={form.chest} onChange={(v) => setForm({ ...form, chest: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Arm" type="number" value={form.arm} onChange={(v) => setForm({ ...form, arm: v })} />
          <Field label="Leg" type="number" value={form.leg} onChange={(v) => setForm({ ...form, leg: v })} />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider font-medium">Notes</span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)]"
          />
        </label>
        <div className="flex gap-2 pt-2">
          {!isNew && <PrimaryButton onClick={remove} variant="danger" block={false}>Delete</PrimaryButton>}
          <PrimaryButton onClick={save} size="lg">Save</PrimaryButton>
        </div>
      </div>
    </Sheet>
  )
}

// ---------- PHOTOS ----------
function Photos() {
  const photos = useLiveQuery(() => db.photos.orderBy('date').reverse().toArray(), [])
  const [uploadOpen, setUploadOpen] = useState(false)
  const [viewingId, setViewingId] = useState<number | null>(null)
  const [compareIds, setCompareIds] = useState<number[]>([])

  function toggleCompare(id: number) {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) :
      prev.length < 2 ? [...prev, id] : [prev[1], id]
    )
  }

  const compareMode = compareIds.length > 0
  const viewing = (photos ?? []).find((p) => p.id === viewingId)

  return (
    <div className="px-4 space-y-3">
      <div className="flex gap-2">
        <PrimaryButton onClick={() => setUploadOpen(true)} size="lg">+ Upload</PrimaryButton>
        {compareMode && (
          <button
            onClick={() => setCompareIds([])}
            className="px-4 rounded-xl border border-[var(--color-border)] text-sm"
          >Clear ({compareIds.length})</button>
        )}
      </div>

      {compareIds.length === 2 && (
        <Card title="Compare">
          <div className="grid grid-cols-2 gap-2">
            {compareIds.map((id) => {
              const p = (photos ?? []).find((x) => x.id === id)
              if (!p) return null
              return (
                <div key={id} className="space-y-1">
                  <PhotoImg blob={p.blob} />
                  <div className="text-xs text-center text-[var(--color-text-dim)]">{p.date}</div>
                  <div className="text-[10px] text-center text-[var(--color-text-faint)]">
                    {p.view} · {p.state}
                    {p.weight && ` · ${p.weight}`}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {(photos ?? []).length === 0 ? (
        <Card padded>
          <div className="text-sm text-[var(--color-text-dim)] text-center py-6">
            No photos yet. Tap upload to track your physique over time.
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {(photos ?? []).map((p) => (
            <button
              key={p.id}
              onClick={() => compareMode ? toggleCompare(p.id!) : setViewingId(p.id!)}
              onContextMenu={(e) => { e.preventDefault(); toggleCompare(p.id!) }}
              className={`relative aspect-[3/4] rounded-xl overflow-hidden border-2 ${
                compareIds.includes(p.id!) ? 'border-[var(--color-accent)]' : 'border-transparent'
              }`}
            >
              <PhotoImg blob={p.thumbBlob ?? p.blob} />
              <div className="absolute bottom-0 inset-x-0 px-2 py-1 bg-gradient-to-t from-black/80 to-transparent text-[10px] text-white">
                {p.date.slice(5)} · {p.view}
              </div>
            </button>
          ))}
        </div>
      )}

      {uploadOpen && <UploadPhotoSheet onClose={() => setUploadOpen(false)} />}
      {viewing && <PhotoViewer photo={viewing} onClose={() => setViewingId(null)} onCompare={() => { toggleCompare(viewing.id!); setViewingId(null) }} />}
    </div>
  )
}

function PhotoImg({ blob }: { blob: Blob }) {
  const url = useObjectUrl(blob)
  return <img src={url} alt="" className="w-full h-full object-cover" />
}

function useObjectUrl(blob: Blob): string {
  const ref = useRef<{ blob: Blob; url: string } | null>(null)
  if (!ref.current || ref.current.blob !== blob) {
    if (ref.current) URL.revokeObjectURL(ref.current.url)
    ref.current = { blob, url: URL.createObjectURL(blob) }
  }
  return ref.current.url
}

function UploadPhotoSheet({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(today())
  const [view, setView] = useState<PhotoView>('front')
  const [state, setState] = useState<PhotoState>('cold')
  const [lighting, setLighting] = useState<PhotoLight>('natural')
  const [weight, setWeight] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save() {
    if (!file) return
    await db.photos.add({
      date,
      view,
      state,
      lighting,
      weight: weight ? Number(weight) : undefined,
      blob: file,
      createdAt: Date.now(),
    })
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title="Upload progress photo">
      <div className="p-4 space-y-3">
        <div onClick={() => fileRef.current?.click()} className="aspect-[3/4] rounded-xl border-2 border-dashed border-[var(--color-border)] flex items-center justify-center bg-[var(--color-surface-2)]">
          {file ? (
            <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover rounded-xl" />
          ) : (
            <div className="text-center text-[var(--color-text-dim)]">
              <div className="text-3xl mb-2">📷</div>
              <div className="text-sm">Tap to choose photo</div>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Field label="Date" type="date" value={date} onChange={setDate} />
        <div className="grid grid-cols-3 gap-2">
          <Select label="View" value={view} onChange={(v) => setView(v as PhotoView)} options={[
            { value: 'front', label: 'Front' }, { value: 'back', label: 'Back' }, { value: 'side', label: 'Side' },
          ]} />
          <Select label="State" value={state} onChange={(v) => setState(v as PhotoState)} options={[
            { value: 'cold', label: 'Cold' }, { value: 'pumped', label: 'Pumped' },
          ]} />
          <Select label="Light" value={lighting} onChange={(v) => setLighting(v as PhotoLight)} options={[
            { value: 'natural', label: 'Natural' }, { value: 'gym', label: 'Gym' }, { value: 'bathroom', label: 'Bath' }, { value: 'other', label: 'Other' },
          ]} />
        </div>
        <Field label="Body weight (optional)" type="number" value={weight} onChange={setWeight} />
        <PrimaryButton onClick={save} disabled={!file} size="lg">Save photo</PrimaryButton>
      </div>
    </Sheet>
  )
}

function PhotoViewer({ photo, onClose, onCompare }: { photo: ProgressPhoto; onClose: () => void; onCompare: () => void }) {
  async function remove() {
    if (!confirm('Delete this photo?')) return
    await db.photos.delete(photo.id!)
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title={photo.date} fullHeight>
      <div className="p-4 space-y-3">
        <PhotoImg blob={photo.blob} />
        <div className="grid grid-cols-2 gap-2 text-sm text-[var(--color-text-dim)]">
          <div>View: <span className="text-[var(--color-text)] capitalize">{photo.view}</span></div>
          <div>State: <span className="text-[var(--color-text)] capitalize">{photo.state}</span></div>
          <div>Lighting: <span className="text-[var(--color-text)] capitalize">{photo.lighting}</span></div>
          {photo.weight && <div>Weight: <span className="text-[var(--color-text)] tabnum">{photo.weight}</span></div>}
        </div>
        <div className="flex gap-2 pt-2">
          <PrimaryButton onClick={onCompare} variant="ghost">Add to compare</PrimaryButton>
          <PrimaryButton onClick={remove} variant="danger">Delete</PrimaryButton>
        </div>
        <PrimaryButton onClick={() => { setTimeout(onClose, 0); shiftDate(today(), 0) }} variant="ghost">Close</PrimaryButton>
      </div>
    </Sheet>
  )
}
