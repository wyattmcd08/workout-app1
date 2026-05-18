import type { ReactNode } from 'react'

interface Props {
  icon?: ReactNode
  title: string
  body?: string
  action?: ReactNode
  compact?: boolean
}

export function EmptyState({ icon, title, body, action, compact }: Props) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'py-6' : 'py-10'}`}>
      {icon && (
        <div className="w-14 h-14 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-accent)] mb-3">
          {icon}
        </div>
      )}
      <div className="display text-[var(--color-text)]" style={{ fontSize: 18, letterSpacing: '0.04em' }}>
        {title}
      </div>
      {body && (
        <div className="text-sm text-[var(--color-text-dim)] mt-2 max-w-xs leading-relaxed">{body}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// A small library of inline icons for empty states.
export const EmptyIcons = {
  dumbbell: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9v6M21 9v6M6 7v10M18 7v10M9 11h6M9 13h6" />
    </svg>
  ),
  ruler: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="8" rx="1.5" />
      <path d="M7 8v4M11 8v3M15 8v4M19 8v3" />
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M16 6h3v2a3 3 0 0 1-3 3M8 6H5v2a3 3 0 0 0 3 3" />
      <path d="M10 13v3h4v-3" />
      <path d="M8 20h8" />
    </svg>
  ),
  capsule: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="9" width="18" height="6" rx="3" />
      <path d="M12 9v6" />
    </svg>
  ),
  meal: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  photo: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <circle cx="12" cy="13" r="3" />
      <path d="M8 6l2-2h4l2 2" />
    </svg>
  ),
  spark: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l4-4 3 3 5-6 6 6" />
    </svg>
  ),
}
