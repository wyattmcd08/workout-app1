import { useState } from 'react'
import { Header } from '../components/Header'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Recovery, Measurements, Photos } from './Body'
import { CalendarTab, PeptidesTab } from './More'

type View = 'recovery' | 'stats' | 'photos' | 'calendar' | 'peptides'

const TABS: { value: View; label: string }[] = [
  { value: 'recovery',  label: 'Recovery' },
  { value: 'stats',     label: 'Stats' },
  { value: 'photos',    label: 'Photos' },
  { value: 'calendar',  label: 'Calendar' },
  { value: 'peptides',  label: 'Peptides' },
]

export function Progress() {
  const [view, setView] = useState<View>('recovery')

  return (
    <div className="pb-32">
      <Header title="Progress" subtitle="The receipts" />

      {/* Horizontally scrollable pill row (5 doesn't fit Segmented well) */}
      <div className="px-4 mb-3">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {TABS.map((t) => {
            const active = t.value === view
            return (
              <button
                key={t.value}
                onClick={() => setView(t.value)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border transition-colors ${
                  active
                    ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                    : 'border-[var(--color-border)] text-[var(--color-text-dim)]'
                }`}
              >{t.label}</button>
            )
          })}
        </div>
      </div>

      <ErrorBoundary fallbackLabel={`${view} hit a bug.`}>
        {view === 'recovery' && <Recovery />}
        {view === 'stats'    && <Measurements />}
        {view === 'photos'   && <Photos />}
        {view === 'calendar' && <CalendarTab />}
        {view === 'peptides' && <PeptidesTab />}
      </ErrorBoundary>
    </div>
  )
}
