import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  right?: ReactNode
}

export function Header({ title, subtitle, right }: Props) {
  return (
    <header
      className="px-5 pt-2 pb-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {subtitle && <div className="eyebrow mb-1.5">{subtitle}</div>}
          <h1
            className="display text-white"
            style={{ fontSize: 'clamp(40px, 12.5vw, 56px)' }}
          >{title}</h1>
        </div>
        {right && <div className="flex-shrink-0 mt-1">{right}</div>}
      </div>
    </header>
  )
}

export function HeaderChip({ onClick, icon, label }: {
  onClick?: () => void
  icon?: ReactNode
  label?: string
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-11 h-11 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-dim)] active:scale-95 transition-transform"
    >
      {icon}
    </button>
  )
}

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="flex bg-[var(--color-surface-2)] rounded-full p-1 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 px-3 py-2 rounded-full font-semibold transition-colors ${
            value === o.value
              ? 'bg-[var(--color-surface-3)] text-[var(--color-text)]'
              : 'text-[var(--color-text-dim)]'
          }`}
        >{o.label}</button>
      ))}
    </div>
  )
}
