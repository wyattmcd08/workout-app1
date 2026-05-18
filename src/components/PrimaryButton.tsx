import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'md' | 'lg'
  block?: boolean
}

export function PrimaryButton({
  children, variant = 'primary', size = 'md', block = true, className = '', ...rest
}: Props) {
  const base = 'font-semibold rounded-xl active:scale-[0.97] transition-transform disabled:opacity-40 disabled:active:scale-100'
  const sizeCls = size === 'lg' ? 'py-4 text-base' : 'py-3 text-sm'
  const variantCls =
    variant === 'primary' ? 'bg-[var(--color-accent)] text-white shadow-[0_8px_24px_-12px_var(--color-accent)]' :
    variant === 'danger' ? 'border border-[var(--color-danger)] text-[var(--color-danger)]' :
    'border border-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-surface-2)]'
  const widthCls = block ? 'w-full' : 'px-5'
  return (
    <button {...rest} className={`${base} ${sizeCls} ${variantCls} ${widthCls} ${className}`}>
      {children}
    </button>
  )
}
