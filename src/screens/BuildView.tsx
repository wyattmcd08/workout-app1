import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, BLOCK_FORMAT_LABELS, type WorkoutBlock, type WorkoutTemplate } from '../db'
import { Card } from '../components/Card'
import { PrimaryButton } from '../components/PrimaryButton'
import { EmptyState, EmptyIcons } from '../components/EmptyState'
import { WorkoutBuilder } from './WorkoutBuilder'
import { WorkoutDetailSheet } from '../components/WorkoutDetailSheet'

interface Props {
  onEnterFocus?: (blocks: WorkoutBlock[]) => void
}

export function BuildView({ onEnterFocus }: Props) {
  const workouts = useLiveQuery(() => db.workoutTemplates.toArray(), [])
  const [building, setBuilding] = useState(false)
  const [opened, setOpened] = useState<WorkoutTemplate | null>(null)

  const sorted = (workouts ?? []).slice().sort((a, b) => {
    if ((a.favorite ?? 0) !== (b.favorite ?? 0)) return (b.favorite ?? 0) - (a.favorite ?? 0)
    return (a.order ?? 0) - (b.order ?? 0)
  })

  return (
    <div className="px-4 space-y-4">
      {/* Header CTA */}
      <div className="flex items-baseline justify-between px-1">
        <div className="eyebrow">Your workouts</div>
        <button
          onClick={() => setBuilding(true)}
          className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent)] active:scale-95 transition-transform"
        >+ New workout</button>
      </div>

      {sorted.length === 0 ? (
        <Card padded>
          <EmptyState
            icon={EmptyIcons.dumbbell}
            title="BUILD YOUR FIRST WORKOUT"
            body="Stack blocks — warm-up, strength, conditioning, cardio, cooldown. Any format: standard sets, AMRAP, EMOM, Tabata, For Time."
            action={<PrimaryButton onClick={() => setBuilding(true)} size="lg">+ Create workout</PrimaryButton>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {sorted.map((t) => (
            <WorkoutCard key={t.id} workout={t} onOpen={() => setOpened(t)} />
          ))}
        </div>
      )}

      {building && (
        <WorkoutBuilder template="new" onClose={() => setBuilding(false)} />
      )}
      {opened && (
        <WorkoutDetailSheet
          workout={opened}
          onClose={() => setOpened(null)}
          onEnterFocus={(blocks) => onEnterFocus?.(blocks ?? [])}
        />
      )}
    </div>
  )
}

function WorkoutCard({ workout, onOpen }: { workout: WorkoutTemplate; onOpen: () => void }) {
  const blocks = workout.blocks ?? []
  const summary = summarize(blocks)

  return (
    <button
      onClick={onOpen}
      className="card p-4 text-left active:scale-[0.98] transition-transform flex flex-col h-32"
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-bold tracking-tight truncate flex-1">
          {workout.favorite === 1 && <span className="text-[var(--color-accent)] mr-1">★</span>}
          {workout.name}
        </span>
      </div>
      {workout.dayLabel && (
        <div className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wider mt-0.5">{workout.dayLabel}</div>
      )}
      <div className="text-[10px] text-[var(--color-text-dim)] mt-1.5 leading-tight line-clamp-2">{summary}</div>
      <div className="mt-auto flex items-baseline justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">
        <span>{blocks.length} {blocks.length === 1 ? 'block' : 'blocks'}</span>
        <span>›</span>
      </div>
    </button>
  )
}

function summarize(blocks: WorkoutBlock[]): string {
  if (blocks.length === 0) return 'Empty workout'
  return blocks.slice(0, 3).map((b) => b.name || BLOCK_FORMAT_LABELS[b.format]).join(' · ')
}
