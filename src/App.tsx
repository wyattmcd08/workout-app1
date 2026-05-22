import { useEffect, useState, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { TabBar, type TabKey } from './components/TabBar'
import { Home } from './screens/Home'
import { Train } from './screens/Train'
import { Progress } from './screens/Progress'
import { Eat } from './screens/Eat'
import { More } from './screens/More'
import { Onboarding } from './screens/Onboarding'
import { FocusMode } from './screens/FocusMode'
import { Toaster } from './components/Toaster'
import { ErrorBoundary } from './components/ErrorBoundary'
import { db, type WorkoutBlock, type WorkoutTemplate } from './db'
import { today } from './lib/date'
import { getBlocksForTemplate } from './services/workouts'
import { seedIfEmpty } from './db/seed'
import { getSettings } from './db'
import { requestPersistentStorage, autoSyncIfConfigured } from './lib/autoBackup'
import { autoSnapshotIfFirstV3Launch } from './lib/preflight'
import { haptic } from './lib/haptic'

const TAB_ORDER: TabKey[] = ['home', 'workouts', 'progress', 'nutrition', 'settings']
const DEFAULT_ACCENT = '#ff2d3d'

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const n = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function App() {
  const [tab, setTab] = useState<TabKey>('home')
  const prevTab = useRef<TabKey>('home')
  const [direction, setDirection] = useState<'right' | 'left'>('right')
  const [ready, setReady] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [focusBlocks, setFocusBlocks] = useState<WorkoutBlock[]>([])
  const settings = useLiveQuery(() => getSettings(), [])
  const activeSession = useLiveQuery(
    () => db.workoutSessions.where('date').equals(today()).filter((s) => !s.endedAt).first(),
    [],
  )

  useEffect(() => {
    // Take a v2 safety snapshot before any v3 migration touches the DB.
    autoSnapshotIfFirstV3Launch().catch((e) => console.warn('preflight snapshot failed', e))
    seedIfEmpty().then(() => setReady(true)).catch((e) => {
      console.error('Seed failed', e)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (settings?.onboardedAt) {
      requestPersistentStorage().catch(() => {})
      autoSyncIfConfigured().catch(() => {})
    }
  }, [settings?.onboardedAt])

  useEffect(() => {
    const accent = settings?.accentColor || DEFAULT_ACCENT
    document.documentElement.style.setProperty('--color-accent', accent)
    document.documentElement.style.setProperty('--color-accent-soft', hexToRgba(accent, 0.14))
  }, [settings?.accentColor])

  // Live-observe the active template so mid-workout edits (e.g. adding an
  // exercise) reflect in FocusMode immediately. Previously this was a one-shot
  // fetch — additions in active sessions wouldn't show until refresh.
  const activeTemplate = useLiveQuery<WorkoutTemplate | undefined>(
    () => activeSession?.templateId
      ? db.workoutTemplates.get(activeSession.templateId)
      : Promise.resolve<WorkoutTemplate | undefined>(undefined),
    [activeSession?.templateId],
  )

  useEffect(() => {
    let cancel = false
    if (!activeSession) {
      setFocusBlocks([])
      return
    }
    if (activeTemplate?.blocks && activeTemplate.blocks.length > 0) {
      if (!cancel) setFocusBlocks(activeTemplate.blocks)
    } else if (activeSession.templateId) {
      // Fallback for legacy templates without blocks[]
      getBlocksForTemplate(activeSession.templateId).then((blocks) => {
        if (!cancel) setFocusBlocks(blocks)
      })
    } else {
      setFocusBlocks([])
    }
    return () => { cancel = true }
  }, [activeSession?.id, activeSession?.templateId, activeTemplate?.blocks])

  function handleTabChange(next: TabKey) {
    const fromIdx = TAB_ORDER.indexOf(prevTab.current)
    const toIdx = TAB_ORDER.indexOf(next)
    setDirection(toIdx >= fromIdx ? 'right' : 'left')
    prevTab.current = next
    setTab(next)
    haptic('tap')
  }

  if (!ready || settings === undefined) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-bg)]">
        <div className="display text-[var(--color-text-faint)]" style={{ fontSize: 18, letterSpacing: '0.3em' }}>
          DIALED DAWG
        </div>
      </div>
    )
  }

  if (!settings.onboardedAt) {
    return (
      <>
        <Onboarding onDone={() => { /* live query refreshes */ }} />
        <Toaster />
      </>
    )
  }

  // Focus Mode takes over the screen when active. No tab bar.
  if (focusMode && activeSession && focusBlocks.length > 0) {
    return (
      <>
        <FocusMode session={activeSession} blocks={focusBlocks} onExit={() => setFocusMode(false)} />
        <Toaster />
      </>
    )
  }

  return (
    <div className="min-h-full bg-[var(--color-bg)]">
      <div
        key={tab}
        className={direction === 'right' ? 'animate-slide-from-right' : 'animate-slide-from-left'}
      >
        <ErrorBoundary fallbackLabel={`${tab} hit a bug.`}>
          {tab === 'home'      && <Home goTrain={() => handleTabChange('workouts')} goEat={() => handleTabChange('nutrition')} />}
          {tab === 'workouts'  && <Train onEnterFocus={(blocks) => { setFocusBlocks(blocks); setFocusMode(true) }} />}
          {tab === 'progress'  && <Progress />}
          {tab === 'nutrition' && <Eat />}
          {tab === 'settings'  && <More />}
        </ErrorBoundary>
      </div>

      {/* Active workout floating CTA — quick re-entry into Focus Mode */}
      {activeSession && focusBlocks.length > 0 && (
        <button
          onClick={() => setFocusMode(true)}
          className="fixed left-4 right-4 z-30 card-accent p-3 flex items-center justify-between active:scale-[0.98] transition-transform shadow-[0_12px_40px_-12px_var(--color-accent)]"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 80px)' }}
        >
          <div className="text-left">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">Training in progress</div>
            <div className="display mt-0.5" style={{ fontSize: 16 }}>{activeSession.name}</div>
          </div>
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">Resume →</div>
        </button>
      )}

      <TabBar active={tab} onChange={handleTabChange} />
      <Toaster />
    </div>
  )
}
