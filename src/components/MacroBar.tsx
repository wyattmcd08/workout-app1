interface Props {
  label: string
  value: number
  target: number
  unit?: string
  color?: string
  inverted?: boolean
}

export function MacroBar({ label, value, target, unit = 'g', color = 'var(--color-accent)', inverted }: Props) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  const over = value > target
  const labelCls = inverted ? 'text-[var(--color-ink-dim)]' : 'text-[var(--color-text-dim)]'
  const numCls = inverted ? 'text-[var(--color-ink)]' : 'text-[var(--color-text)]'
  const dimNumCls = inverted ? 'text-[var(--color-ink-faint)]' : 'text-[var(--color-text-faint)]'
  const trackCls = inverted ? 'bg-[var(--color-paper-3)]' : 'bg-[var(--color-surface-3)]'

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className={`text-[11px] font-bold uppercase tracking-[0.14em] ${labelCls}`}>{label}</span>
        <span className={`text-[12px] tabnum font-semibold ${numCls}`}>
          <span className={over ? 'text-[var(--color-warn)]' : ''}>{Math.round(value)}</span>
          <span className={dimNumCls}> / {Math.round(target)}{unit}</span>
        </span>
      </div>
      <div className={`h-1.5 rounded-full overflow-hidden ${trackCls}`}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: over ? 'var(--color-warn)' : color }}
        />
      </div>
    </div>
  )
}
