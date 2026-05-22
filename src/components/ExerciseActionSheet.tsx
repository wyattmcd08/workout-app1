import { Sheet } from './Sheet'

export interface ExerciseAction {
  label: string
  onClick: () => void
  danger?: boolean
  icon?: string
  disabled?: boolean
}

interface Props {
  open: boolean
  title: string
  subtitle?: string
  actions: ExerciseAction[]
  onClose: () => void
}

export function ExerciseActionSheet({ open, title, subtitle, actions, onClose }: Props) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      {subtitle && (
        <div className="px-4 -mt-2 mb-1 text-xs text-[var(--color-text-dim)]">{subtitle}</div>
      )}
      <div className="p-3 space-y-1.5">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => { if (!a.disabled) { a.onClick(); onClose() } }}
            disabled={a.disabled}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98] ${
              a.disabled
                ? 'opacity-40'
                : a.danger
                  ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30 active:bg-[var(--color-danger)]/15'
                  : 'bg-[var(--color-surface-2)] border border-[var(--color-border)] active:bg-[var(--color-surface-3)]'
            }`}
          >
            {a.icon && <span className="text-base">{a.icon}</span>}
            <span className="font-bold text-sm tracking-tight">{a.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
