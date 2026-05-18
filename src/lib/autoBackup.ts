import { db, getSettings, saveSettings } from '../db'
import { exportBackup } from './backup'

const TABLES = [
  'foods','logEntries','exercises','workoutTemplates','templateExercises',
  'workoutSessions','workoutSets','measurements','metrics',
  'peptides','peptideDoses','settings',
] as const

// Ask iOS / browser to grant durable storage so Safari won't evict the IndexedDB
// after ~7 days of no use. Safe to call repeatedly.
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  try {
    const already = await navigator.storage.persisted?.()
    if (already) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

// Build the full backup payload — same shape exportBackup uses for the file.
async function buildPayload(): Promise<string> {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) {
    data[t] = await (db as unknown as Record<string, { toArray: () => Promise<unknown[]> }>)[t].toArray()
  }
  return JSON.stringify({
    version: 2,
    exportedAt: new Date().toISOString(),
    app: 'dialed-dawg',
    data,
  })
}

function daysSince(ts?: number): number {
  if (!ts) return Infinity
  return (Date.now() - ts) / (1000 * 60 * 60 * 24)
}

// Returns true if a backup is overdue (no backup ever, or older than threshold).
export async function isBackupOverdue(): Promise<boolean> {
  const s = await getSettings()
  const threshold = s.autoBackupDays ?? 7
  const localOK = daysSince(s.lastBackupAt) < threshold
  const cloudOK = !!s.gistToken && daysSince(s.lastGistSyncAt) < threshold
  return !(localOK || cloudOK)
}

export async function daysSinceLastBackup(): Promise<number> {
  const s = await getSettings()
  const local = daysSince(s.lastBackupAt)
  const cloud = s.gistToken ? daysSince(s.lastGistSyncAt) : Infinity
  return Math.min(local, cloud)
}

// Trigger a local file download — works on iOS as long as user has tapped recently.
export async function downloadBackup(): Promise<void> {
  await exportBackup()
  await saveSettings({ lastBackupAt: Date.now() })
}

// ---- GitHub Gist cloud backup ----
// User pastes a Personal Access Token (classic, "gist" scope only) and the app
// upserts a single private gist. Free, no server, works on iPhone.

const GIST_FILENAME = 'dialed-dawg-backup.json'

async function ghFetch(url: string, init: RequestInit, token: string): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  })
}

export async function syncToGist(): Promise<{ id: string; updated: boolean }> {
  const s = await getSettings()
  if (!s.gistToken) throw new Error('No GitHub token configured.')
  const payload = await buildPayload()
  const body = JSON.stringify({
    description: 'Dialed Dawg backup',
    files: { [GIST_FILENAME]: { content: payload } },
  })

  let id = s.gistId
  let updated = false
  if (id) {
    const r = await ghFetch(`https://api.github.com/gists/${id}`, { method: 'PATCH', body }, s.gistToken)
    if (r.status === 404) id = undefined
    else if (!r.ok) throw new Error(`Gist update failed: ${r.status} ${await r.text()}`)
    else updated = true
  }
  if (!id) {
    const r = await ghFetch('https://api.github.com/gists', {
      method: 'POST',
      body: JSON.stringify({
        description: 'Dialed Dawg backup',
        public: false,
        files: { [GIST_FILENAME]: { content: payload } },
      }),
    }, s.gistToken)
    if (!r.ok) throw new Error(`Gist create failed: ${r.status} ${await r.text()}`)
    const data = await r.json() as { id: string }
    id = data.id
  }
  await saveSettings({ gistId: id, lastGistSyncAt: Date.now() })
  return { id: id!, updated }
}

export async function restoreFromGist(): Promise<void> {
  const s = await getSettings()
  if (!s.gistToken || !s.gistId) throw new Error('No gist configured.')
  const r = await ghFetch(`https://api.github.com/gists/${s.gistId}`, { method: 'GET' }, s.gistToken)
  if (!r.ok) throw new Error(`Gist fetch failed: ${r.status}`)
  const data = await r.json() as { files: Record<string, { content: string }> }
  const content = data.files[GIST_FILENAME]?.content
  if (!content) throw new Error('Backup file missing in gist.')
  // Parse and restore — reuse importBackup logic
  const parsed = JSON.parse(content) as { version: number; data: Record<string, unknown[]> }
  if (parsed.version !== 2) throw new Error(`Unsupported backup version: ${parsed.version}`)
  await db.transaction(
    'rw',
    [
      db.foods, db.logEntries, db.exercises, db.workoutTemplates, db.templateExercises,
      db.workoutSessions, db.workoutSets, db.measurements, db.metrics,
      db.peptides, db.peptideDoses, db.settings,
    ],
    async () => {
      for (const t of TABLES) {
        const table = (db as unknown as Record<string, {
          clear: () => Promise<void>
          bulkAdd: (rows: unknown[]) => Promise<unknown>
        }>)[t]
        await table.clear()
        const rows = parsed.data[t] ?? []
        if (rows.length) await table.bulkAdd(rows)
      }
    },
  )
}

// Quietly sync to gist (if configured) on app open.
// Fails silently — networks fail, that's fine.
export async function autoSyncIfConfigured(): Promise<void> {
  const s = await getSettings()
  if (!s.gistToken) return
  const since = daysSince(s.lastGistSyncAt)
  if (since < 1) return // throttle to once per day max
  try {
    await syncToGist()
  } catch (e) {
    console.warn('Auto gist sync failed:', e)
  }
}
