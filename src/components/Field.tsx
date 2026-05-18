import type { InputHTMLAttributes, ReactNode } from 'react'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string
  hint?: ReactNode
  value: string | number
  onChange: (v: string) => void
}

export function Field({ label, hint, value, onChange, type = 'text', ...rest }: Props) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider font-medium">{label}</span>
      <input
        {...rest}
        type={type}
        inputMode={type === 'number' ? 'decimal' : rest.inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)] transition-colors"
      />
      {hint && <span className="text-xs text-[var(--color-text-faint)]">{hint}</span>}
    </label>
  )
}

export function Select({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-3 focus:border-[var(--color-accent)] appearance-none"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}
