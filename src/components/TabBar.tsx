import type { ReactNode } from 'react'

export type TabKey = 'home' | 'train' | 'eat' | 'body' | 'more'

interface Props {
  active: TabKey
  onChange: (k: TabKey) => void
}

// Inline SVG icons — sharp, line-style, scale crisp at any size.
const Icons: Record<TabKey, ReactNode> = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  ),
  train: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8v8" />
      <path d="M18 8v8" />
      <path d="M3 10v4" />
      <path d="M21 10v4" />
      <path d="M8 12h8" />
    </svg>
  ),
  eat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18" />
      <path d="M5 3v6a3 3 0 0 0 3 3" />
      <path d="M8 3v9" />
      <path d="M19 3v8.5a2 2 0 0 1-2 2v7.5" />
    </svg>
  ),
  body: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2.2" />
      <path d="M8 11l4-2 4 2" />
      <path d="M9 11v4l-1 6" />
      <path d="M15 11v4l1 6" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="5" cy="12" r="0.5" />
      <circle cx="12" cy="12" r="0.5" />
      <circle cx="19" cy="12" r="0.5" />
    </svg>
  ),
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'home',  label: 'Home' },
  { key: 'train', label: 'Train' },
  { key: 'eat',   label: 'Eat' },
  { key: 'body',  label: 'Body' },
  { key: 'more',  label: 'More' },
]

export function TabBar({ active, onChange }: Props) {
  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
    >
      <nav className="glass rounded-full px-1.5 py-1.5 flex items-center gap-0.5 pointer-events-auto shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)]">
        {TABS.map((t) => {
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              aria-label={t.label}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex items-center justify-center transition-all active:scale-90 ${
                isActive
                  ? 'bg-[var(--color-accent)] text-white w-12 h-12 rounded-full'
                  : 'text-[var(--color-text-dim)] w-12 h-12 rounded-full'
              }`}
            >
              <span className="w-5 h-5 inline-block">{Icons[t.key]}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
