// Optional WebAudio cues. Only fires when settings.soundOn is set externally.

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (ctx) return ctx
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC()
    return ctx
  } catch { return null }
}

function beep(freq: number, ms: number, gain = 0.05): void {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume()
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  g.gain.value = gain
  // Quick attack + decay so it doesn't click
  const now = c.currentTime
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(gain, now + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000)
  osc.connect(g).connect(c.destination)
  osc.start(now)
  osc.stop(now + ms / 1000)
}

export const sound = {
  tick(): void { beep(440, 60) },
  ding(): void { beep(880, 180, 0.06) },
  fanfare(): void {
    beep(660, 100)
    setTimeout(() => beep(880, 100), 110)
    setTimeout(() => beep(1100, 180, 0.07), 230)
  },
}
