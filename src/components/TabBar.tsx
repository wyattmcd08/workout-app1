import type { ReactNode } from 'react'

export type TabKey = 'home' | 'train' | 'eat' | 'body' | 'more'

interface Props {
  active: TabKey
  onChange: (k: TabKey) => void
}

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

// Each button is 48px wide with 2px gap. Pill matches a button (48px).
const BUTTON_W = 48
const GAP = 2

export function TabBar({ active, onChange }: Props) {
  const activeIndex = TABS.findIndex((t) => t.key === active)
  // Account for the 6px (px-1.5) inner padding on the nav.
  const pillX = 6 + activeIndex * (BUTTON_W + GAP)

  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
    >
      <nav
        className="glass rounded-full px-1.5 py-1.5 flex items-center gap-0.5 pointer-events-auto shadow-[0_12px_40px_-12px_rgba(0,0,0,0.85)] relative"
        style={{
          backdropFilter: 'blur(24px) saturate(200%)',
          WebkitBackdropFilter: 'blur(24px) saturate(200%)',
        }}
      >
        {/* Hairline top highlight */}
        <span
          className="absolute left-2 right-2 top-0 h-px pointer-events-none rounded-full"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)' }}
        />
        {/* Sliding active pill */}
        <span
          aria-hidden
          className="absolute top-1.5 w-12 h-12 rounded-full pointer-events-none"
          style={{
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
              className="relative z-10 flex items-center justify-center active:scale-90 transition-transform w-12 h-12 rounded-full"
            >
              <span
                className={`w-5 h-5 inline-block transition-colors duration-300 ${
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
