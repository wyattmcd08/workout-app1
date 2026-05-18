// Tiny haptic wrapper. iOS Safari ignores navigator.vibrate;
// Android Chrome honors it. We just no-op gracefully.

type HapticKind = 'tap' | 'chime' | 'success' | 'error'

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  chime: [12, 40, 12],
  success: [10, 30, 10, 30, 10],
  error: [40, 20, 40],
}

export function haptic(kind: HapticKind = 'tap'): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(PATTERNS[kind])
    }
  } catch { /* no-op */ }
}
