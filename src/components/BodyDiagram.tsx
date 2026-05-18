import { useState } from 'react'
import type { MuscleGroup } from '../db'
import { MUSCLE_LABELS } from '../db'
import { fatigueColor, type MuscleFatigue } from '../lib/recovery'

interface Props {
  fatigues: MuscleFatigue[]
  onSelect?: (m: MuscleGroup) => void
}

// Stylized body silhouettes via SVG paths. Each path is a single muscle group.
// viewBox is 300x500 per body so total is 600x500.
const FRONT = 'front' as const
const BACK = 'back' as const
type Side = typeof FRONT | typeof BACK
const SIDES: Side[] = [FRONT, BACK]

// Helper: simple rounded capsule path generator
function rrect(x: number, y: number, w: number, h: number, r = 8) {
  return `M${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x + r},${y + h} Q${x},${y + h} ${x},${y + h - r} L${x},${y + r} Q${x},${y} ${x + r},${y} Z`
}

// (x, y, w, h, r) coords for each muscle. Tuned by eye on viewBox 0 0 300 500.
const FRONT_MUSCLES: Record<string, { d: string; muscle: MuscleGroup; label?: { x: number; y: number } }> = {
  shouldersL: { d: rrect(60, 95, 38, 38, 14), muscle: 'shoulders' },
  shouldersR: { d: rrect(202, 95, 38, 38, 14), muscle: 'shoulders' },
  chestL:     { d: rrect(110, 110, 38, 50, 12), muscle: 'chest' },
  chestR:     { d: rrect(152, 110, 38, 50, 12), muscle: 'chest' },
  bicepsL:    { d: rrect(56, 140, 32, 60, 14), muscle: 'biceps' },
  bicepsR:    { d: rrect(212, 140, 32, 60, 14), muscle: 'biceps' },
  forearmsL:  { d: rrect(48, 205, 30, 65, 14), muscle: 'forearms' },
  forearmsR:  { d: rrect(222, 205, 30, 65, 14), muscle: 'forearms' },
  coreUpper:  { d: rrect(115, 165, 70, 32, 8), muscle: 'core' },
  coreLower:  { d: rrect(115, 200, 70, 40, 10), muscle: 'core' },
  quadsL:     { d: rrect(105, 270, 40, 95, 16), muscle: 'quads' },
  quadsR:     { d: rrect(155, 270, 40, 95, 16), muscle: 'quads' },
  calvesL:    { d: rrect(110, 380, 32, 75, 14), muscle: 'calves' },
  calvesR:    { d: rrect(158, 380, 32, 75, 14), muscle: 'calves' },
}

const BACK_MUSCLES: Record<string, { d: string; muscle: MuscleGroup }> = {
  trapsCenter: { d: rrect(125, 90, 50, 38, 10), muscle: 'traps' },
  rearDeltL:   { d: rrect(70, 95, 38, 36, 14), muscle: 'shoulders' },
  rearDeltR:   { d: rrect(192, 95, 38, 36, 14), muscle: 'shoulders' },
  trapsLowerL: { d: rrect(115, 128, 30, 26, 6), muscle: 'traps' },
  trapsLowerR: { d: rrect(155, 128, 30, 26, 6), muscle: 'traps' },
  lats:        { d: 'M105 145 L195 145 L185 230 L115 230 Z', muscle: 'lats' },
  tricepsL:    { d: rrect(56, 140, 32, 65, 14), muscle: 'triceps' },
  tricepsR:    { d: rrect(212, 140, 32, 65, 14), muscle: 'triceps' },
  forearmsL:   { d: rrect(48, 210, 30, 65, 14), muscle: 'forearms' },
  forearmsR:   { d: rrect(222, 210, 30, 65, 14), muscle: 'forearms' },
  lowerBack:   { d: rrect(122, 232, 56, 34, 8), muscle: 'lowerBack' },
  glutesL:     { d: rrect(110, 270, 40, 50, 18), muscle: 'glutes' },
  glutesR:     { d: rrect(150, 270, 40, 50, 18), muscle: 'glutes' },
  hamstringsL: { d: rrect(105, 325, 40, 75, 16), muscle: 'hamstrings' },
  hamstringsR: { d: rrect(155, 325, 40, 75, 16), muscle: 'hamstrings' },
  calvesL:     { d: rrect(110, 405, 32, 60, 14), muscle: 'calves' },
  calvesR:     { d: rrect(158, 405, 32, 60, 14), muscle: 'calves' },
}

// Body outline as a single decorative path behind muscles
const FRONT_OUTLINE =
  'M150 28 c20 0 32 18 32 36 c0 12 -4 22 -8 28 c30 8 56 18 60 36 c2 18 -10 30 -16 44 c-6 14 -8 32 -8 50 c0 24 4 50 8 70 c4 22 4 44 0 64 c-4 22 -10 50 -12 80 c-2 22 -2 44 -2 60 c0 8 -4 14 -10 14 c-8 0 -10 -8 -10 -16 c-2 -28 -6 -56 -8 -78 c-2 -22 -6 -44 -6 -60 c0 -10 -2 -16 -8 -16 s-8 6 -8 16 c0 16 -4 38 -6 60 c-2 22 -6 50 -8 78 c0 8 -2 16 -10 16 c-6 0 -10 -6 -10 -14 c0 -16 0 -38 -2 -60 c-2 -30 -8 -58 -12 -80 c-4 -20 -4 -42 0 -64 c4 -20 8 -46 8 -70 c0 -18 -2 -36 -8 -50 c-6 -14 -18 -26 -16 -44 c4 -18 30 -28 60 -36 c-4 -6 -8 -16 -8 -28 c0 -18 12 -36 32 -36 z'

const BACK_OUTLINE = FRONT_OUTLINE // Same silhouette

export function BodyDiagram({ fatigues, onSelect }: Props) {
  const [side, setSide] = useState<Side>(FRONT)
  const [selected, setSelected] = useState<MuscleGroup | null>(null)

  const fatigueMap = new Map(fatigues.map((f) => [f.muscle, f]))
  const muscles = side === FRONT ? FRONT_MUSCLES : BACK_MUSCLES
  const outline = side === FRONT ? FRONT_OUTLINE : BACK_OUTLINE

  function handlePick(m: MuscleGroup) {
    setSelected(m)
    onSelect?.(m)
  }

  return (
    <div className="flex flex-col items-center">
      <div className="inline-flex bg-[var(--color-surface-2)] rounded-full p-1 mb-3">
        {SIDES.map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`px-5 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
              side === s ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-dim)]'
            }`}
          >{s}</button>
        ))}
      </div>

      <svg viewBox="0 0 300 500" className="w-full max-w-[260px]" role="img" aria-label={`${side} body diagram`}>
        <path d={outline} fill="var(--color-surface-2)" stroke="var(--color-border-strong)" strokeWidth="1.5" />
        {Object.entries(muscles).map(([id, def]) => {
          const f = fatigueMap.get(def.muscle)
          const fill = f ? fatigueColor(f.fatigue) : '#4ade80'
          const isSelected = selected === def.muscle
          return (
            <path
              key={id}
              d={def.d}
              fill={fill}
              fillOpacity={f && f.fatigue > 5 ? 0.85 : 0.35}
              stroke={isSelected ? 'var(--color-accent)' : 'rgba(0,0,0,0.4)'}
              strokeWidth={isSelected ? 2.5 : 1}
              onClick={() => handlePick(def.muscle)}
              style={{ cursor: 'pointer', transition: 'all 200ms ease' }}
            />
          )
        })}
        {/* Head circle */}
        <circle cx="150" cy="48" r="26" fill="var(--color-surface-3)" stroke="var(--color-border-strong)" strokeWidth="1.5" />
      </svg>

      {selected && (
        <div className="mt-3 text-center animate-fade-in">
          <div className="text-sm text-[var(--color-text-dim)]">{MUSCLE_LABELS[selected]}</div>
          {(() => {
            const f = fatigueMap.get(selected)
            if (!f) return <div className="text-xs text-[var(--color-text-faint)]">No recent training</div>
            return (
              <div className="text-xs text-[var(--color-text-faint)] mt-1">
                Fatigue {f.fatigue}% · Recovery {f.recovery}%
                {f.lastTrainedISO && ` · Last ${f.lastTrainedISO}`}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
