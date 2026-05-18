import { useEffect, useState, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { TabBar, type TabKey } from './components/TabBar'
import { Home } from './screens/Home'
import { Train } from './screens/Train'
import { Eat } from './screens/Eat'
import { Body } from './screens/Body'
import { More } from './screens/More'
import { Onboarding } from './screens/Onboarding'
import { Toaster } from './components/Toaster'
import { seedIfEmpty } from './db/seed'
import { getSettings } from './db'
import { requestPersistentStorage, autoSyncIfConfigured } from './lib/autoBackup'
import { haptic } from './lib/haptic'

const TAB_ORDER: TabKey[] = ['home', 'train', 'eat', 'body', 'more']
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
  const settings = useLiveQuery(() => getSettings(), [])

  useEffect(() => {
    seedIfEmpty().then(() => setReady(true)).catch((e) => {
      console.error('Seed failed', e)
      setReady(true)
    })
  }, [])

  // Persistent storage + cloud sync after onboarding completes.
  useEffect(() => {
    if (settings?.onboardedAt) {
      requestPersistentStorage().catch(() => {})
      autoSyncIfConfigured().catch(() => {})
    }
  }, [settings?.onboardedAt])

  // Apply user's accent color whenever settings change.
  useEffect(() => {
    const accent = settings?.accentColor || DEFAULT_ACCENT
    document.documentElement.style.setProperty('--color-accent', accent)
    document.documentElement.style.setProperty('--color-accent-soft', hexToRgba(accent, 0.14))
  }, [settings?.accentColor])

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

  return (
    <div className="min-h-full bg-[var(--color-bg)]">
      <div
        key={tab}
        className={direction === 'right' ? 'animate-slide-from-right' : 'animate-slide-from-left'}
      >
        {tab === 'home'  && <Home goTrain={() => handleTabChange('train')} goEat={() => handleTabChange('eat')} />}
        {tab === 'train' && <Train />}
        {tab === 'eat'   && <Eat />}
        {tab === 'body'  && <Body />}
        {tab === 'more'  && <More />}
      </div>
      <TabBar active={tab} onChange={handleTabChange} />
      <Toaster />
    </div>
  )
}
