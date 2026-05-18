import type { ReactNode } from 'react'

type Variant = 'dark' | 'soft' | 'paper' | 'accent'

interface Props {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  padded?: boolean
  className?: string
  onClick?: () => void
  variant?: Variant
}

const VARIANT_CLS: Record<Variant, string> = {
  dark: 'card',
  soft: 'card-soft',
  paper: 'card-paper',
  accent: 'card-accent',
}

export function Card({
  title, action, children, padded = true, className = '', onClick, variant = 'dark',
}: Props) {
  const interactive = !!onClick
  const isPaper = variant === 'paper'
  return (
    <section
      onClick={onClick}
      className={`${VARIANT_CLS[variant]} ${
        interactive ? 'active:scale-[0.985] transition-transform' : ''
      } ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className={`text-[11px] font-bold uppercase tracking-[0.18em] ${
            isPaper ? 'text-[var(--color-ink-dim)]' : 'text-[var(--color-text-dim)]'
          }`}>{title}</h3>
          {action}
        </header>
      )}
      <div className={padded ? 'px-4 pb-4' : ''}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, unit, hint, accent, inverted, big }: {
  label: string
  value: string | number
  unit?: string
  hint?: string
  accent?: boolean
  inverted?: boolean
  big?: boolean
}) {
  const labelCls = inverted ? 'text-[var(--color-ink-dim)]' : 'text-[var(--color-text-dim)]'
  const hintCls = inverted ? 'text-[var(--color-ink-faint)]' : 'text-[var(--color-text-faint)]'
  const unitCls = inverted ? 'text-[var(--color-ink-dim)]' : 'text-[var(--color-text-dim)]'

  return (
    <div>
      <div className={`text-[10px] font-bold uppercase tracking-[0.18em] ${labelCls}`}>{label}</div>
      <div
        className={`display-num mt-1.5 ${accent ? 'text-[var(--color-accent)]' : ''}`}
        style={{ fontSize: big ? 'clamp(36px, 11vw, 48px)' : 'clamp(24px, 7vw, 32px)' }}
      >
        {value}
        {unit && (
          <span className={`text-[11px] font-semibold ml-1.5 ${unitCls}`}>{unit}</span>
        )}
      </div>
      {hint && <div className={`text-[11px] mt-1.5 ${hintCls}`}>{hint}</div>}
    </div>
  )
}
