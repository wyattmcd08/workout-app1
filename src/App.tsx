import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { TabBar, type TabKey } from './components/TabBar'
import { Home } from './screens/Home'
import { Train } from './screens/Train'
import { Eat } from './screens/Eat'
import { Body } from './screens/Body'
import { More } from './screens/More'
import { Onboarding } from './screens/Onboarding'
import { seedIfEmpty } from './db/seed'
import { getSettings } from './db'
import { requestPersistentStorage, autoSyncIfConfigured } from './lib/autoBackup'

export default function App() {
  const [tab, setTab] = useState<TabKey>('home')
  const [ready, setReady] = useState(false)
  const settings = useLiveQuery(() => getSettings(), [])

  useEffect(() => {
    seedIfEmpty().then(() => setReady(true)).catch((e) => {
      console.error('Seed failed', e)
      setReady(true)
    })
  }, [])

  // Once onboarded, request persistent storage and try cloud sync.
  useEffect(() => {
    if (settings?.onboardedAt) {
      requestPersistentStorage().catch(() => {})
      autoSyncIfConfigured().catch(() => {})
    }
  }, [settings?.onboardedAt])

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
    return <Onboarding onDone={() => { /* live query refreshes */ }} />
  }

  return (
    <div className="min-h-full bg-[var(--color-bg)]">
      <div key={tab} className="animate-fade-in">
        {tab === 'home'  && <Home goTrain={() => setTab('train')} goEat={() => setTab('eat')} />}
        {tab === 'train' && <Train />}
        {tab === 'eat'   && <Eat />}
        {tab === 'body'  && <Body />}
        {tab === 'more'  && <More />}
      </div>
      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
