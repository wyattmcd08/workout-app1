export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function today(): string {
  return toISODate(new Date())
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function shiftDate(iso: string, days: number): string {
  const dt = parseISODate(iso)
  dt.setDate(dt.getDate() + days)
  return toISODate(dt)
}

export function daysBetween(a: string, b: string): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime()
  return Math.round(ms / 86_400_000)
}

export function prettyDate(iso: string): string {
  const dt = parseISODate(iso)
  const t = today()
  if (iso === t) return 'Today'
  if (iso === shiftDate(t, -1)) return 'Yesterday'
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function monthGrid(year: number, month: number): { iso: string; day: number; inMonth: boolean }[] {
  // returns 6 weeks of days starting from Sunday, covering the visible month
  const first = new Date(year, month, 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  const days: { iso: string; day: number; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push({ iso: toISODate(d), day: d.getDate(), inMonth: d.getMonth() === month })
  }
  return days
}

export function monthName(month: number): string {
  return new Date(2000, month, 1).toLocaleDateString(undefined, { month: 'long' })
}
