import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type MuscleGroup } from '../db'
import { MUSCLE_LABELS } from '../db'
import { fatigueColor, type MuscleFatigue } from '../lib/recovery'

interface Props {
  fatigues: MuscleFatigue[]
  onSelect?: (m: MuscleGroup) => void
}

const FRONT = 'front' as const
const BACK = 'back' as const
type Side = typeof FRONT | typeof BACK
const SIDES: Side[] = [FRONT, BACK]

interface MusclePath {
  d: string
  muscle: MuscleGroup
}

// Anatomical front-view muscle paths. viewBox 0 0 300 600.
// Designed to fit inside a humanoid silhouette. Shapes are stylized but
// follow real muscle topology — pecs are domed, biceps bulge, quads taper.
const FRONT_MUSCLES: Record<string, MusclePath> = {
  // Neck
  neck: {
    d: 'M134 90 Q150 95 166 90 L164 110 Q150 115 136 110 Z',
    muscle: 'traps',
  },
  // Traps (visible bumps above clavicle)
  trapsL: {
    d: 'M105 102 Q130 95 138 110 Q135 118 110 116 Q102 112 105 102 Z',
    muscle: 'traps',
  },
  trapsR: {
    d: 'M195 102 Q170 95 162 110 Q165 118 190 116 Q198 112 195 102 Z',
    muscle: 'traps',
  },
  // Shoulders (deltoids — rounded caps)
  deltL: {
    d: 'M90 115 Q72 130 73 158 Q88 165 105 152 Q112 135 105 118 Q97 113 90 115 Z',
    muscle: 'shoulders',
  },
  deltR: {
    d: 'M210 115 Q228 130 227 158 Q212 165 195 152 Q188 135 195 118 Q203 113 210 115 Z',
    muscle: 'shoulders',
  },
  // Pecs (chest)
  pecL: {
    d: 'M108 122 Q146 118 148 130 L148 175 Q130 188 110 180 Q98 165 100 145 Q102 128 108 122 Z',
    muscle: 'chest',
  },
  pecR: {
    d: 'M192 122 Q154 118 152 130 L152 175 Q170 188 190 180 Q202 165 200 145 Q198 128 192 122 Z',
    muscle: 'chest',
  },
  // Biceps
  bicepL: {
    d: 'M72 165 Q62 195 70 230 Q88 232 95 215 Q98 195 92 168 Q82 162 72 165 Z',
    muscle: 'biceps',
  },
  bicepR: {
    d: 'M228 165 Q238 195 230 230 Q212 232 205 215 Q202 195 208 168 Q218 162 228 165 Z',
    muscle: 'biceps',
  },
  // Forearms
  forearmL: {
    d: 'M68 235 Q60 270 65 310 Q78 312 86 295 Q92 265 88 238 Q78 232 68 235 Z',
    muscle: 'forearms',
  },
  forearmR: {
    d: 'M232 235 Q240 270 235 310 Q222 312 214 295 Q208 265 212 238 Q222 232 232 235 Z',
    muscle: 'forearms',
  },
  // Abs (six-pack — three rows)
  absUpper: {
    d: 'M132 190 L168 190 L166 215 L134 215 Z',
    muscle: 'core',
  },
  absMid: {
    d: 'M133 218 L167 218 L165 245 L135 245 Z',
    muscle: 'core',
  },
  absLower: {
    d: 'M134 248 L166 248 L162 282 L138 282 Z',
    muscle: 'core',
  },
  // Obliques
  obliqueL: {
    d: 'M108 195 Q102 230 110 265 Q120 270 128 245 L128 210 Q120 195 108 195 Z',
    muscle: 'core',
  },
  obliqueR: {
    d: 'M192 195 Q198 230 190 265 Q180 270 172 245 L172 210 Q180 195 192 195 Z',
    muscle: 'core',
  },
  // Quads
  quadL: {
    d: 'M110 310 Q100 360 105 420 Q120 450 138 445 Q146 420 144 365 Q140 320 130 308 Q118 305 110 310 Z',
    muscle: 'quads',
  },
  quadR: {
    d: 'M190 310 Q200 360 195 420 Q180 450 162 445 Q154 420 156 365 Q160 320 170 308 Q182 305 190 310 Z',
    muscle: 'quads',
  },
  // Knee gap
  // Calves (front shins — tibialis. Use lighter)
  shinL: {
    d: 'M118 470 Q112 510 116 555 Q130 558 136 540 Q138 510 134 478 Q124 468 118 470 Z',
    muscle: 'calves',
  },
  shinR: {
    d: 'M182 470 Q188 510 184 555 Q170 558 164 540 Q162 510 166 478 Q176 468 182 470 Z',
    muscle: 'calves',
  },
}

// Anatomical back-view muscle paths.
const BACK_MUSCLES: Record<string, MusclePath> = {
  // Traps (upper back — big diamond)
  trapsUpper: {
    d: 'M150 95 Q120 100 105 125 Q108 145 130 150 L150 145 L170 150 Q192 145 195 125 Q180 100 150 95 Z',
    muscle: 'traps',
  },
  trapsLower: {
    d: 'M135 150 L165 150 L160 195 Q150 200 140 195 Z',
    muscle: 'traps',
  },
  // Rear delts
  rearDeltL: {
    d: 'M90 118 Q72 132 73 158 Q88 165 105 152 Q112 135 105 121 Q97 116 90 118 Z',
    muscle: 'shoulders',
  },
  rearDeltR: {
    d: 'M210 118 Q228 132 227 158 Q212 165 195 152 Q188 135 195 121 Q203 116 210 118 Z',
    muscle: 'shoulders',
  },
  // Lats (V-taper wings)
  latL: {
    d: 'M108 150 Q98 175 100 220 Q115 240 135 235 L135 165 Q120 152 108 150 Z',
    muscle: 'lats',
  },
  latR: {
    d: 'M192 150 Q202 175 200 220 Q185 240 165 235 L165 165 Q180 152 192 150 Z',
    muscle: 'lats',
  },
  // Mid back
  midBack: {
    d: 'M135 165 L165 165 L165 215 L135 215 Z',
    muscle: 'back',
  },
  // Lower back / erectors
  erectorL: {
    d: 'M133 220 L150 220 L148 275 Q140 280 132 275 Z',
    muscle: 'lowerBack',
  },
  erectorR: {
    d: 'M150 220 L167 220 L168 275 Q160 280 152 275 Z',
    muscle: 'lowerBack',
  },
  // Triceps (back of upper arm)
  tricepL: {
    d: 'M72 165 Q62 200 70 232 Q88 234 95 215 Q98 195 92 168 Q82 162 72 165 Z',
    muscle: 'triceps',
  },
  tricepR: {
    d: 'M228 165 Q238 200 230 232 Q212 234 205 215 Q202 195 208 168 Q218 162 228 165 Z',
    muscle: 'triceps',
  },
  // Forearms back
  forearmBL: {
    d: 'M68 237 Q60 272 65 310 Q78 312 86 295 Q92 265 88 240 Q78 234 68 237 Z',
    muscle: 'forearms',
  },
  forearmBR: {
    d: 'M232 237 Q240 272 235 310 Q222 312 214 295 Q208 265 212 240 Q222 234 232 237 Z',
    muscle: 'forearms',
  },
  // Glutes
  gluteL: {
    d: 'M108 280 Q100 320 115 345 Q140 348 148 320 Q148 290 135 280 Q120 277 108 280 Z',
    muscle: 'glutes',
  },
  gluteR: {
    d: 'M192 280 Q200 320 185 345 Q160 348 152 320 Q152 290 165 280 Q180 277 192 280 Z',
    muscle: 'glutes',
  },
  // Hamstrings
  hamstringL: {
    d: 'M112 350 Q102 395 108 445 Q122 455 138 445 Q145 415 142 370 Q132 348 112 350 Z',
    muscle: 'hamstrings',
  },
  hamstringR: {
    d: 'M188 350 Q198 395 192 445 Q178 455 162 445 Q155 415 158 370 Q168 348 188 350 Z',
    muscle: 'hamstrings',
  },
  // Calves (back — gastrocnemius — bulged)
  calfL: {
    d: 'M115 470 Q105 510 114 555 Q132 560 140 540 Q142 510 136 478 Q124 466 115 470 Z',
    muscle: 'calves',
  },
  calfR: {
    d: 'M185 470 Q195 510 186 555 Q168 560 160 540 Q158 510 164 478 Q176 466 185 470 Z',
    muscle: 'calves',
  },
}

// Single-path human silhouette behind the muscles (front)
const SILHOUETTE_FRONT =
  'M150 30 Q170 30 174 50 Q176 70 168 88 L170 102 Q200 105 215 118 Q235 130 235 160 L232 215 Q230 270 218 305 L210 305 Q204 290 200 270 L195 280 Q205 360 195 430 Q200 480 195 555 Q195 575 178 575 Q170 575 168 560 L165 510 Q160 460 158 420 L150 420 L142 420 Q140 460 135 510 L132 560 Q130 575 122 575 Q105 575 105 555 Q100 480 105 430 Q95 360 105 280 L100 270 Q96 290 90 305 L82 305 Q70 270 68 215 L65 160 Q65 130 85 118 Q100 105 130 102 L132 88 Q124 70 126 50 Q130 30 150 30 Z'

const SILHOUETTE_BACK = SILHOUETTE_FRONT // mirrored isn't needed — symmetric

// Exercises that hit a muscle, used by the "tap to train" detail.
function MuscleDetail({ muscle, fatigue }: { muscle: MuscleGroup; fatigue: MuscleFatigue | undefined }) {
  const exercises = useLiveQuery(
    () => db.exercises
      .filter((e) => e.primary === muscle || e.secondary.includes(muscle))
      .limit(6)
      .toArray(),
    [muscle],
  )
  const status =
    !fatigue || fatigue.fatigue < 33 ? { label: 'Fresh', color: 'var(--color-good)' } :
    fatigue.fatigue < 66 ? { label: 'Moderate', color: 'var(--color-warn)' } :
    { label: 'Hammered — rest', color: 'var(--color-danger)' }

  return (
    <div className="mt-4 animate-slide-up">
      <div className="flex items-baseline justify-between mb-1">
        <div className="display text-white" style={{ fontSize: 22 }}>{MUSCLE_LABELS[muscle]}</div>
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: status.color }}>
          {status.label}
        </div>
      </div>
      {fatigue && (
        <div className="grid grid-cols-3 gap-2 text-xs text-[var(--color-text-dim)] mb-3">
          <div><span className="tabnum font-bold text-[var(--color-text)]">{fatigue.fatigue}%</span> fatigue</div>
          <div><span className="tabnum font-bold text-[var(--color-text)]">{fatigue.recovery}%</span> recovery</div>
          <div className="truncate">{fatigue.lastTrainedISO ? `Last: ${fatigue.lastTrainedISO.slice(5)}` : 'Untrained'}</div>
        </div>
      )}
      <div className="eyebrow mb-2">Exercises that hit it</div>
      {!exercises || exercises.length === 0 ? (
        <div className="text-sm text-[var(--color-text-faint)]">None in your library yet.</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {exercises.map((e) => (
            <span key={e.id} className="px-3 py-1.5 rounded-full bg-[var(--color-surface-2)] text-[12px] font-semibold border border-[var(--color-border)]">
              {e.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function BodyDiagram({ fatigues, onSelect }: Props) {
  const [side, setSide] = useState<Side>(FRONT)
  const [selected, setSelected] = useState<MuscleGroup | null>(null)

  const fatigueMap = new Map(fatigues.map((f) => [f.muscle, f]))
  const muscles = side === FRONT ? FRONT_MUSCLES : BACK_MUSCLES
  const silhouette = side === FRONT ? SILHOUETTE_FRONT : SILHOUETTE_BACK

  function handlePick(m: MuscleGroup) {
    setSelected(m === selected ? null : m)
    onSelect?.(m)
  }

  return (
    <div className="flex flex-col items-center">
      <div className="inline-flex bg-[var(--color-surface-2)] rounded-full p-1 mb-4 border border-[var(--color-border)]">
        {SIDES.map((s) => (
          <button
            key={s}
            onClick={() => { setSide(s); setSelected(null) }}
            className={`px-6 py-2 rounded-full text-sm font-bold uppercase tracking-wider transition-all ${
              side === s ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-dim)]'
            }`}
          >{s}</button>
        ))}
      </div>

      <svg viewBox="0 0 300 600" className="w-full max-w-[280px]" role="img" aria-label={`${side} body diagram`}>
        <defs>
          <radialGradient id="bodyGrad" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="var(--color-surface-3)" />
            <stop offset="100%" stopColor="var(--color-surface)" />
          </radialGradient>
        </defs>

        {/* Body silhouette */}
        <path
          d={silhouette}
          fill="url(#bodyGrad)"
          stroke="var(--color-border-strong)"
          strokeWidth="1.2"
        />

        {/* Head */}
        <ellipse cx="150" cy="55" rx="26" ry="30" fill="var(--color-surface-3)" stroke="var(--color-border-strong)" strokeWidth="1.2" />

        {/* Muscles */}
        {Object.entries(muscles).map(([id, def]) => {
          const f = fatigueMap.get(def.muscle)
          const fatigue = f?.fatigue ?? 0
          const fill = fatigueColor(fatigue)
          const isSelected = selected === def.muscle
          // Stronger fill when more fatigued
          const opacity = fatigue > 60 ? 0.85 : fatigue > 30 ? 0.65 : 0.4
          return (
            <path
              key={id}
              d={def.d}
              fill={fill}
              fillOpacity={opacity}
              stroke={isSelected ? 'var(--color-accent)' : 'rgba(0,0,0,0.45)'}
              strokeWidth={isSelected ? 2.5 : 0.8}
              onClick={() => handlePick(def.muscle)}
              style={{ cursor: 'pointer', transition: 'all 220ms ease' }}
            />
          )
        })}
      </svg>

      {selected && (
        <div className="w-full px-1 mt-2">
          <MuscleDetail muscle={selected} fatigue={fatigueMap.get(selected)} />
        </div>
      )}
      {!selected && (
        <div className="text-[11px] text-[var(--color-text-faint)] mt-2 uppercase tracking-wider font-semibold">
          Tap a muscle for details
        </div>
      )}
    </div>
  )
}
