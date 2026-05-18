import { useState } from 'react'
import { monthGrid, monthName, today } from '../lib/date'

export interface DayValue {
  iso: string
  level: 0 | 1 | 2 | 3 | 4 // intensity bucket
  workoutLogged?: boolean
  kcalHit?: boolean
}

interface Props {
  values: DayValue[]
  onSelect?: (iso: string) => void
}

const LEVEL_COLORS = [
  'var(--color-surface-2)',
  'rgba(255, 45, 61, 0.25)',
  'rgba(255, 45, 61, 0.45)',
  'rgba(255, 45, 61, 0.7)',
  'rgba(255, 45, 61, 1)',
]

export function HeatmapCalendar({ values, onSelect }: Props) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const grid = monthGrid(year, month)
  const valueMap = new Map(values.map((v) => [v.iso, v]))
  const todayISO = today()

  function shift(delta: number) {
    let m = month + delta
    let y = year
    while (m < 0) { m += 12; y -= 1 }
    while (m > 11) { m -= 12; y += 1 }
    setMonth(m); setYear(y)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => shift(-1)} className="px-3 py-1 text-[var(--color-text-dim)]">‹</button>
        <h3 className="text-sm font-semibold tracking-wide">
          {monthName(month)} {year}
        </h3>
        <button onClick={() => shift(1)} className="px-3 py-1 text-[var(--color-text-dim)]">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[var(--color-text-faint)] mb-1">
        {['S','M','T','W','T','F','S'].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.map((d) => {
          const v = valueMap.get(d.iso)
          const isToday = d.iso === todayISO
          const isFuture = d.iso > todayISO
          return (
            <button
              key={d.iso}
              onClick={() => onSelect?.(d.iso)}
              disabled={isFuture}
              className={`aspect-square rounded-md flex items-center justify-center text-[11px] tabnum relative ${
                d.inMonth ? '' : 'opacity-30'
              } ${isFuture ? 'opacity-20' : ''}`}
              style={{
                background: v ? LEVEL_COLORS[v.level] : LEVEL_COLORS[0],
                border: isToday ? '1.5px solid var(--color-accent)' : 'none',
              }}
            >
              <span className={(v?.level ?? 0) >= 3 ? 'text-white' : 'text-[var(--color-text-dim)]'}>{d.day}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-[var(--color-text-faint)]">
        <span>Less</span>
        {LEVEL_COLORS.map((c, i) => (
          <span key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
