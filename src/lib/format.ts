export function round(n: number, dec = 0): number {
  const f = 10 ** dec
  return Math.round(n * f) / f
}

export function pct(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(100, (value / target) * 100)
}

export function kgToLb(kg: number): number {
  return kg * 2.20462
}

export function lbToKg(lb: number): number {
  return lb / 2.20462
}

export function cmToIn(cm: number): number {
  return cm / 2.54
}

export function inToCm(inches: number): number {
  return inches * 2.54
}

// Epley estimated 1RM
export function estimated1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0
  if (reps === 1) return weight
  return round(weight * (1 + reps / 30), 1)
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
