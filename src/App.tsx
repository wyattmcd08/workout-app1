import { useEffect, useState } from 'react'
import { TabBar, type TabKey } from './components/TabBar'
import { Home } from './screens/Home'
import { Train } from './screens/Train'
import { Eat } from './screens/Eat'
import { Body } from './screens/Body'
import { More } from './screens/More'
import { seedIfEmpty } from './db/seed'

export default function App() {
  const [tab, setTab] = useState<TabKey>('home')
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    seedIfEmpty().then(() => setSeeded(true)).catch((e) => {
      console.error('Seed failed', e)
      setSeeded(true)
    })
  }, [])

  if (!seeded) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-[var(--color-text-faint)] text-sm tracking-widest uppercase">Dialed Dawg</div>
      </div>
    )
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
