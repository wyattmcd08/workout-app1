// Tiny pub/sub toast singleton. Toaster component subscribes; anything can publish.

export type ToastVariant = 'default' | 'success' | 'accent' | 'error'

export interface ToastInput {
  title: string
  detail?: string
  variant?: ToastVariant
  durationMs?: number
}

export interface ToastRecord extends ToastInput {
  id: number
  createdAt: number
}

type Listener = (t: ToastRecord) => void

let nextId = 1
const listeners = new Set<Listener>()

export const toast = {
  show(input: ToastInput | string): number {
    const data: ToastInput = typeof input === 'string' ? { title: input } : input
    const id = nextId++
    const record: ToastRecord = { id, createdAt: Date.now(), ...data }
    listeners.forEach((l) => l(record))
    return id
  },
  success(title: string, detail?: string): number {
    return this.show({ title, detail, variant: 'success' })
  },
  pr(title: string, detail?: string): number {
    return this.show({ title, detail, variant: 'accent', durationMs: 3600 })
  },
  error(title: string, detail?: string): number {
    return this.show({ title, detail, variant: 'error' })
  },
  subscribe(l: Listener): () => void {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}
