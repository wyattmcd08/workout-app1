interface Props {
  value: number
  target: number
  size?: number
  stroke?: number
  color?: string
  trackColor?: string
  label?: string
  unit?: string
  centerValue?: string | number
  inverted?: boolean
}

export function ProgressRing({
  value, target,
  size = 132,
  stroke = 12,
  color = 'var(--color-accent)',
  trackColor,
  label, unit = '', centerValue,
  inverted,
}: Props) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = target > 0 ? Math.min(1, value / target) : 0
  const dash = c * pct
  const display = centerValue ?? Math.round(value)
  const track = trackColor ?? (inverted ? 'rgba(10,10,12,0.08)' : 'var(--color-surface-3)')
  const labelColor = inverted ? 'var(--color-ink-faint)' : 'var(--color-text-faint)'
  const unitColor = inverted ? 'var(--color-ink-dim)' : 'var(--color-text-dim)'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: 'stroke-dasharray 480ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
        <div
          className="display-num leading-none"
          style={{ fontSize: size / 4.2 }}
        >{display}</div>
        {unit && <div className="text-[10px] font-semibold mt-1" style={{ color: unitColor }}>{unit}</div>}
        {label && (
          <div className="text-[9px] font-bold uppercase tracking-[0.18em] mt-0.5" style={{ color: labelColor }}>{label}</div>
        )}
      </div>
    </div>
  )
}
