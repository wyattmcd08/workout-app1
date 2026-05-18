import { useEffect, useRef, useState, useCallback } from 'react'
import type { WorkoutBlock, BlockFormat, BlockProgress } from '../db'

// Single pure state machine for every block format. UI components subscribe;
// the engine owns time, phase, rounds, and persistence semantics.

export type EnginePhase = 'idle' | 'work' | 'rest' | 'done' | 'paused'

export interface EngineState {
  phase: EnginePhase
  round: number              // 1-based; total completed = round - 1 when in 'work'
  totalRounds?: number       // undefined if open-ended (AMRAP / ForTime / Cardio)
  remaining: number          // seconds remaining in current phase (countdowns)
  elapsed: number            // seconds elapsed (stopwatches)
  running: boolean
  finishedAt?: number
}

export interface EngineActions {
  start: () => void
  pause: () => void
  resume: () => void
  reset: () => void
  finishEarly: () => void    // ForTime: user taps "Done"
  bumpRound: () => void      // AMRAP/Circuit/Superset: user marks round complete
}

interface InternalState extends EngineState {
  baselineMs: number         // anchor for current phase
  pausedAt?: number          // when paused, remember offset
}

// ---- Format profile lookup ----
interface Profile {
  hasWork: boolean
  hasRest: boolean
  hasCountdown: boolean      // false → stopwatch
  autoAdvance: boolean       // engine auto-advances phase on expire (EMOM/Tabata)
  trackRounds: boolean
  maxRounds?: (block: WorkoutBlock) => number | undefined
  workSec: (block: WorkoutBlock) => number
  restSec: (block: WorkoutBlock) => number
  totalCapSec: (block: WorkoutBlock) => number | undefined
}

const PROFILES: Record<BlockFormat, Profile> = {
  standard: { hasWork: false, hasRest: false, hasCountdown: false, autoAdvance: false, trackRounds: false,
    workSec: () => 0, restSec: () => 0, totalCapSec: () => undefined },
  circuit: { hasWork: true, hasRest: false, hasCountdown: false, autoAdvance: false, trackRounds: true,
    maxRounds: (b) => b.rounds, workSec: () => 0, restSec: () => 0, totalCapSec: () => undefined },
  superset: { hasWork: true, hasRest: false, hasCountdown: false, autoAdvance: false, trackRounds: true,
    maxRounds: (b) => b.rounds, workSec: () => 0, restSec: () => 0, totalCapSec: () => undefined },
  amrap: { hasWork: true, hasRest: false, hasCountdown: true, autoAdvance: false, trackRounds: true,
    workSec: (b) => b.timeCapSec ?? 600, restSec: () => 0, totalCapSec: (b) => b.timeCapSec ?? 600 },
  emom: { hasWork: true, hasRest: false, hasCountdown: true, autoAdvance: true, trackRounds: true,
    maxRounds: (b) => b.rounds ?? 10, workSec: (b) => b.intervalSec ?? 60, restSec: () => 0,
    totalCapSec: (b) => (b.intervalSec ?? 60) * (b.rounds ?? 10) },
  tabata: { hasWork: true, hasRest: true, hasCountdown: true, autoAdvance: true, trackRounds: true,
    maxRounds: (b) => b.rounds ?? 8, workSec: (b) => b.workSec ?? 20, restSec: (b) => b.restSec ?? 10,
    totalCapSec: (b) => ((b.workSec ?? 20) + (b.restSec ?? 10)) * (b.rounds ?? 8) },
  interval: { hasWork: true, hasRest: true, hasCountdown: true, autoAdvance: true, trackRounds: true,
    maxRounds: (b) => b.rounds ?? 5, workSec: (b) => b.workSec ?? 60, restSec: (b) => b.restSec ?? 60,
    totalCapSec: (b) => ((b.workSec ?? 60) + (b.restSec ?? 60)) * (b.rounds ?? 5) },
  fortime: { hasWork: true, hasRest: false, hasCountdown: false, autoAdvance: false, trackRounds: false,
    workSec: () => 0, restSec: () => 0, totalCapSec: (b) => b.timeCapSec },
}

export function profileForFormat(format: BlockFormat): Profile {
  return PROFILES[format]
}

// ---- React hook: useBlockEngine ----
export interface EngineHookOptions {
  block: WorkoutBlock
  initial?: BlockProgress
  onPhaseChange?: (next: EnginePhase, prev: EnginePhase) => void
  onRoundComplete?: (round: number) => void
  onExpire?: () => void
  onTickPersist?: (snapshot: BlockProgress) => void // called periodically + on visibilitychange
}

export function useBlockEngine({ block, initial, onPhaseChange, onRoundComplete, onExpire, onTickPersist }: EngineHookOptions): EngineState & EngineActions {
  const profile = PROFILES[block.format]
  const initialPhase: EnginePhase = initial?.isCompleted ? 'done' : 'idle'

  const [state, setState] = useState<InternalState>(() => {
    const initialRemaining = profile.hasCountdown ? profile.workSec(block) : 0
    return {
      phase: initialPhase,
      round: (initial?.completedRounds ?? 0) + 1,
      totalRounds: profile.maxRounds?.(block),
      remaining: initial?.remainingSec ?? initialRemaining,
      elapsed: initial?.elapsedSec ?? 0,
      running: false,
      baselineMs: Date.now(),
    }
  })

  const stateRef = useRef(state)
  stateRef.current = state

  // Ticker
  useEffect(() => {
    if (!state.running) return
    const id = setInterval(() => {
      setState((s) => {
        const elapsedSincePhaseStart = (Date.now() - s.baselineMs) / 1000
        if (profile.hasCountdown) {
          const totalForPhase = s.phase === 'rest' ? profile.restSec(block) : profile.workSec(block)
          const remaining = Math.max(0, totalForPhase - elapsedSincePhaseStart)
          if (remaining <= 0) {
            // Phase expired
            return advancePhase(s, block, profile, { onPhaseChange, onRoundComplete, onExpire })
          }
          return { ...s, remaining }
        } else {
          return { ...s, elapsed: s.elapsed + (Date.now() - s.baselineMs) / 1000 - (s.elapsed - (s.elapsed)), baselineMs: Date.now(), }
            // Actually: we just advance elapsed by tick interval consistently
        }
      })
    }, 100)
    return () => clearInterval(id)
  }, [state.running, state.phase, block, profile, onPhaseChange, onRoundComplete, onExpire])

  // Stopwatch: separate effect to use elapsed properly without subtraction artifacts
  useEffect(() => {
    if (!state.running || profile.hasCountdown) return
    const startElapsed = state.elapsed
    const startedAt = Date.now()
    const id = setInterval(() => {
      setState((s) => ({ ...s, elapsed: startElapsed + (Date.now() - startedAt) / 1000 }))
    }, 100)
    return () => clearInterval(id)
  }, [state.running, profile.hasCountdown])

  // Persist on visibilitychange + every 5s while running
  useEffect(() => {
    if (!onTickPersist) return
    function snapshot(): BlockProgress {
      const s = stateRef.current
      return {
        completedRounds: Math.max(0, s.round - 1),
        lastTickAt: Date.now(),
        remainingSec: profile.hasCountdown ? s.remaining : undefined,
        elapsedSec: profile.hasCountdown ? undefined : s.elapsed,
        isCompleted: s.phase === 'done',
      }
    }
    function onVis() { if (document.visibilityState === 'hidden') onTickPersist!(snapshot()) }
    document.addEventListener('visibilitychange', onVis)
    const id = setInterval(() => { if (stateRef.current.running) onTickPersist(snapshot()) }, 5000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      clearInterval(id)
    }
  }, [profile.hasCountdown, onTickPersist])

  const start = useCallback(() => {
    setState((s) => ({ ...s, phase: s.phase === 'done' ? 'idle' : 'work', running: true, baselineMs: Date.now(), remaining: profile.hasCountdown ? profile.workSec(block) : s.remaining, elapsed: profile.hasCountdown ? 0 : s.elapsed }))
  }, [block, profile])

  const pause = useCallback(() => {
    setState((s) => ({ ...s, running: false, phase: 'paused' }))
  }, [])

  const resume = useCallback(() => {
    setState((s) => ({ ...s, running: true, phase: s.phase === 'paused' ? 'work' : s.phase, baselineMs: Date.now() - (profile.hasCountdown ? ((s.phase === 'rest' ? profile.restSec(block) : profile.workSec(block)) - s.remaining) * 1000 : 0) }))
  }, [block, profile])

  const reset = useCallback(() => {
    setState({
      phase: 'idle',
      round: 1,
      totalRounds: profile.maxRounds?.(block),
      remaining: profile.hasCountdown ? profile.workSec(block) : 0,
      elapsed: 0,
      running: false,
      baselineMs: Date.now(),
    })
  }, [block, profile])

  const finishEarly = useCallback(() => {
    setState((s) => ({ ...s, phase: 'done', running: false, finishedAt: Date.now() }))
    onExpire?.()
  }, [onExpire])

  const bumpRound = useCallback(() => {
    setState((s) => {
      const next = s.round + 1
      onRoundComplete?.(s.round)
      const max = profile.maxRounds?.(block)
      if (max && next > max) {
        return { ...s, phase: 'done', running: false, round: next, finishedAt: Date.now() }
      }
      return { ...s, round: next }
    })
  }, [block, profile, onRoundComplete])

  return {
    phase: state.phase, round: state.round, totalRounds: state.totalRounds,
    remaining: state.remaining, elapsed: state.elapsed, running: state.running,
    finishedAt: state.finishedAt,
    start, pause, resume, reset, finishEarly, bumpRound,
  }
}

function advancePhase(
  s: InternalState,
  block: WorkoutBlock,
  profile: Profile,
  cb: Pick<EngineHookOptions, 'onPhaseChange' | 'onRoundComplete' | 'onExpire'>,
): InternalState {
  // AMRAP: single phase; expire ends the block
  if (block.format === 'amrap' || block.format === 'fortime') {
    cb.onExpire?.()
    return { ...s, phase: 'done', running: false, remaining: 0, finishedAt: Date.now() }
  }
  // EMOM: every interval = one round; advance round; continue if more remain
  if (block.format === 'emom') {
    const max = profile.maxRounds!(block)!
    cb.onRoundComplete?.(s.round)
    if (s.round + 1 > max) {
      cb.onExpire?.()
      return { ...s, phase: 'done', running: false, remaining: 0, finishedAt: Date.now() }
    }
    return { ...s, round: s.round + 1, remaining: profile.workSec(block), baselineMs: Date.now() }
  }
  // Tabata/Interval: work → rest → next round
  const inWork = s.phase === 'work'
  if (inWork && profile.hasRest) {
    cb.onPhaseChange?.('rest', 'work')
    return { ...s, phase: 'rest', remaining: profile.restSec(block), baselineMs: Date.now() }
  }
  // Rest finished → next round
  const max = profile.maxRounds!(block)!
  cb.onRoundComplete?.(s.round)
  if (s.round + 1 > max) {
    cb.onExpire?.()
    return { ...s, phase: 'done', running: false, remaining: 0, finishedAt: Date.now() }
  }
  cb.onPhaseChange?.('work', 'rest')
  return { ...s, phase: 'work', round: s.round + 1, remaining: profile.workSec(block), baselineMs: Date.now() }
}

// Format helpers
export function formatMMSS(sec: number): string {
  const total = Math.max(0, Math.floor(sec))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
