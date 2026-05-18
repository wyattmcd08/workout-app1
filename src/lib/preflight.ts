import { db } from '../db'

// Snapshot key — single slot, overwritten only if the user explicitly chooses to.
const KEY = 'dialed-dawg:v2-snapshot'
const VERSION_MARKER = 'dialed-dawg:v3-migrated-at'

const TABLES = [
  'foods','logEntries','exercises','workoutTemplates','templateExercises',
  'workoutSessions','workoutSets','measurements','metrics',
  'peptides','peptideDoses','settings',
] as const

// Build a backup payload using the same shape as lib/backup.ts so it's restorable.
async function buildPayload(): Promise<string> {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) {
    data[t] = await (db as unknown as Record<string, { toArray: () => Promise<unknown[]> }>)[t].toArray()
  }
  return JSON.stringify({
    version: 2,
    exportedAt: new Date().toISOString(),
    app: 'dialed-dawg',
    note: 'Pre-v3 safety snapshot (auto-generated).',
    data,
  })
}

// Run once per device on the first launch that sees the v3 schema. Stores a
// snapshot of the v2 data in localStorage so the user has an offline recovery
// path if migration goes sideways. localStorage is independent of IndexedDB.
export async function autoSnapshotIfFirstV3Launch(): Promise<void> {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(KEY)) return // already snapshotted
  try {
    const payload = await buildPayload()
    localStorage.setItem(KEY, payload)
    localStorage.setItem(VERSION_MARKER, new Date().toISOString())
  } catch (e) {
    console.warn('[preflight] snapshot failed:', e)
  }
}

// Read back the saved snapshot, if present, as a downloadable Blob.
export function readSnapshotBlob(): { blob: Blob; filename: string } | null {
  if (typeof localStorage === 'undefined') return null
  const text = localStorage.getItem(KEY)
  if (!text) return null
  const blob = new Blob([text], { type: 'application/json' })
  const filename = `dialed-dawg-pre-v3-${new Date().toISOString().slice(0, 10)}.json`
  return { blob, filename }
}

export function downloadSnapshot(): boolean {
  const r = readSnapshotBlob()
  if (!r) return false
  const url = URL.createObjectURL(r.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = r.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return true
}

export function hasSnapshot(): boolean {
  return typeof localStorage !== 'undefined' && !!localStorage.getItem(KEY)
}
