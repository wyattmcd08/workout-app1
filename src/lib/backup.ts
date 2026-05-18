import { db } from '../db'

const TABLES = [
  'foods','logEntries','exercises','workoutTemplates','templateExercises',
  'workoutSessions','workoutSets','measurements','metrics',
  'peptides','peptideDoses','settings',
] as const

interface BackupPayload {
  version: 2
  exportedAt: string
  app: 'dialed-dawg'
  data: Record<string, unknown[]>
}

export async function exportBackup(): Promise<void> {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) {
    data[t] = await (db as unknown as Record<string, { toArray: () => Promise<unknown[]> }>)[t].toArray()
  }
  const payload: BackupPayload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    app: 'dialed-dawg',
    data,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dialed-dawg-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function importBackup(file: File): Promise<void> {
  const text = await file.text()
  const data = JSON.parse(text) as BackupPayload
  if (data.version !== 2) {
    throw new Error(`Unsupported backup version: ${data.version}`)
  }
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
        const rows = data.data[t] ?? []
        if (rows.length) await table.bulkAdd(rows)
      }
    },
  )
}
