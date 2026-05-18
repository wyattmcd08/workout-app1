import type { ReactNode } from 'react'

export type TabKey = 'home' | 'workouts' | 'exercises' | 'progress' | 'nutrition' | 'settings'

interface Props {
  active: TabKey
  onChange: (k: TabKey) => void
}

const Icons: Record<TabKey, ReactNode> = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  ),
  workouts: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8v8" />
      <path d="M18 8v8" />
      <path d="M3 10v4" />
      <path d="M21 10v4" />
      <path d="M8 12h8" />
    </svg>
  ),
  exercises: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 12h18M9 6v12M15 6v12" />
    </svg>
  ),
  progress: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l5-5 4 4 4-6 5 7" />
      <path d="M3 21h18" />
    </svg>
  ),
  nutrition: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18" />
      <path d="M5 3v6a3 3 0 0 0 3 3" />
      <path d="M8 3v9" />
      <path d="M19 3v8.5a2 2 0 0 1-2 2v7.5" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'home',      label: 'Home' },
  { key: 'workouts',  label: 'Workouts' },
  { key: 'exercises', label: 'Exercises' },
  { key: 'progress',  label: 'Progress' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'settings',  label: 'Settings' },
]

// Shrink buttons to fit 6 across iPhone width.
const BUTTON_W = 42
const GAP = 2
const PAD = 5

export function TabBar({ active, onChange }: Props) {
  const activeIndex = TABS.findIndex((t) => t.key === active)
  const pillX = PAD + activeIndex * (BUTTON_W + GAP)

  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
    >
      <nav
        className="glass rounded-full flex items-center pointer-events-auto shadow-[0_12px_40px_-12px_rgba(0,0,0,0.85)] relative"
        style={{
          padding: `${PAD}px`,
          gap: `${GAP}px`,
          backdropFilter: 'blur(24px) saturate(200%)',
          WebkitBackdropFilter: 'blur(24px) saturate(200%)',
        }}
      >
        {/* Hairline top highlight */}
        <span
          className="absolute left-2 right-2 top-0 h-px pointer-events-none rounded-full"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)' }}
        />
        {/* Sliding active pill */}
        <span
          aria-hidden
          className="absolute pointer-events-none rounded-full"
          style={{
            top: PAD,
            width: BUTTON_W,
            height: BUTTON_W,
            transform: `translate3d(${pillX}px, 0, 0)`,
            transition: 'transform 360ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            background: 'var(--color-accent)',
            boxShadow: '0 6px 24px -6px var(--color-accent)',
          }}
        />
        {TABS.map((t) => {
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              aria-label={t.label}
              aria-current={isActive ? 'page' : undefined}
              className="relative z-10 flex items-center justify-center active:scale-90 transition-transform rounded-full"
              style={{ width: BUTTON_W, height: BUTTON_W }}
            >
              <span
                className={`w-[18px] h-[18px] inline-block transition-colors duration-300 ${
                  isActive ? 'text-white' : 'text-[var(--color-text-dim)]'
                }`}
              >{Icons[t.key]}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
