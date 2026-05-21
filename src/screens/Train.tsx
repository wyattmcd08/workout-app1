import { useState } from 'react'
import type { WorkoutBlock } from '../db'
import { Header, Segmented } from '../components/Header'
import { TrainView } from './TrainView'
import { BuildView } from './BuildView'

type View = 'train' | 'build'

export function Train({ onEnterFocus }: { onEnterFocus?: (blocks: WorkoutBlock[]) => void }) {
  const [view, setView] = useState<View>('train')
  return (
    <div className="pb-32 page-workouts">
      <Header
        title="Workouts"
        subtitle={view === 'train' ? 'Lift today' : 'Your library'}
      />
      <div className="px-4 mb-3">
        <Segmented<View>
          options={[
            { value: 'train', label: 'Train' },
            { value: 'build', label: 'Build' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'train' && <TrainView onEnterFocus={onEnterFocus} />}
      {view === 'build' && <BuildView onEnterFocus={onEnterFocus} />}
    </div>
  )
}
