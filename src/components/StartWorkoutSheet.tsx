import { useLiveQuery } from 'dexie-react-hooks'
import { db, type WorkoutTemplate, type WorkoutBlock } from '../db'
import { today } from '../lib/date'
import { startSession, startFromTemplate } from '../services/sessions'
import { toast } from '../lib/toast'
import { haptic } from '../lib/haptic'
import { Sheet } from './Sheet'
import { EmptyState, EmptyIcons } from './EmptyState'

interface Props {
  open: boolean
  onClose: () => void
  onStarted: (blocks: WorkoutBlock[]) => void
}

export function StartWorkoutSheet({ open, onClose, onStarted }: Props) {
  const workouts = useLiveQuery(() => db.workoutTemplates.toArray(), [])

  async function quickStart() {
    await startSession({ date: today(), name: 'Quick workout' })
    haptic('success')
    toast.show({ title: 'Quick start', detail: 'Empty session — add exercises as you go', variant: 'success' })
    onStarted([])
    onClose()
  }

  async function startTemplate(t: WorkoutTemplate) {
    await startFromTemplate(today(), t)
    haptic('success')
    toast.show({ title: `Started: ${t.name}`, variant: 'success' })
    onStarted(t.blocks ?? [])
    onClose()
  }

  const sorted = (workouts ?? []).slice().sort((a, b) => {
    if ((a.favorite ?? 0) !== (b.favorite ?? 0)) return (b.favorite ?? 0) - (a.favorite ?? 0)
    return (a.order ?? 0) - (b.order ?? 0)
  })

  return (
    <Sheet open={open} title="Start training" onClose={onClose} fullHeight>
      <div className="p-4 space-y-3">
        {/* Quick start */}
        <button
          onClick={quickStart}
          className="w-full p-4 rounded-2xl border-2 border-dashed border-[var(--color-border)] active:scale-[0.99] transition-transform text-left"
        >
          <div className="eyebrow">Quick start</div>
          <div className="display text-white mt-1" style={{ fontSize: 18 }}>Empty workout</div>
          <div className="text-[11px] text-[var(--color-text-dim)] mt-0.5">Add exercises on the fly</div>
        </button>

        <div className="eyebrow pt-2">Your workouts</div>

        {sorted.length === 0 ? (
          <EmptyState
            icon={EmptyIcons.dumbbell}
            title="NO WORKOUTS YET"
            body="Build one in the Build tab — anything from a Push day to a 12-min AMRAP."
            compact
          />
        ) : (
          <div className="space-y-2">
            {sorted.map((t) => (
              <button
                key={t.id}
                onClick={() => startTemplate(t)}
                className="w-full card p-4 text-left active:scale-[0.99] transition-transform"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold tracking-tight truncate">
                    {t.favorite === 1 && <span className="text-[var(--color-accent)] mr-1.5">★</span>}
                    {t.name}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">
                    {(t.blocks ?? []).length} {(t.blocks ?? []).length === 1 ? 'block' : 'blocks'}
                  </span>
                </div>
                {t.dayLabel && (
                  <div className="text-xs text-[var(--color-text-dim)] mt-0.5">{t.dayLabel}</div>
                )}
                {(t.blocks ?? []).length > 0 && (
                  <div className="text-[11px] text-[var(--color-text-faint)] tabnum mt-1 truncate">
                    {(t.blocks ?? []).map((b) => b.name || b.format.toUpperCase()).join(' · ')}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
}
