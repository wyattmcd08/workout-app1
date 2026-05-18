export interface ReconInputs {
  vialMg: number          // mg of peptide in vial
  bacWaterMl: number      // ml of bacteriostatic water added
  doseMcg: number         // desired dose in mcg
  syringeUnits?: number   // total units on the syringe at 1 mL (default 100)
}

export interface ReconResult {
  mgPerMl: number              // concentration
  mcgPerUnit: number           // mcg per syringe unit
  drawUnits: number            // units to draw for the dose
  drawMl: number               // ml to draw
  totalDosesInVial: number     // approx number of doses available
}

// Standard insulin syringe = 100 units per 1 mL.
export function calculateReconstitution(input: ReconInputs): ReconResult {
  const { vialMg, bacWaterMl, doseMcg } = input
  const syringeUnits = input.syringeUnits ?? 100
  if (vialMg <= 0 || bacWaterMl <= 0 || doseMcg <= 0) {
    return { mgPerMl: 0, mcgPerUnit: 0, drawUnits: 0, drawMl: 0, totalDosesInVial: 0 }
  }
  const mgPerMl = vialMg / bacWaterMl
  const mcgPerMl = mgPerMl * 1000
  const mcgPerUnit = mcgPerMl / syringeUnits
  const drawUnits = doseMcg / mcgPerUnit
  const drawMl = doseMcg / mcgPerMl
  const totalDosesInVial = Math.floor((vialMg * 1000) / doseMcg)
  return {
    mgPerMl: round(mgPerMl, 2),
    mcgPerUnit: round(mcgPerUnit, 1),
    drawUnits: round(drawUnits, 1),
    drawMl: round(drawMl, 3),
    totalDosesInVial,
  }
}

function round(n: number, dec: number): number {
  const f = 10 ** dec
  return Math.round(n * f) / f
}

// Schedule helpers
export const SCHEDULE_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'eod', label: 'Every other day' },
  { value: 'mwf', label: 'Mon / Wed / Fri' },
  { value: 'tts', label: 'Tue / Thu / Sat' },
  { value: '5x2', label: '5 on / 2 off' },
  { value: 'weekly', label: 'Weekly' },
]

export function isDueOn(schedule: string, dateISO: string, startISO?: string): boolean {
  const dt = new Date(dateISO)
  const dow = dt.getDay() // 0 sun .. 6 sat
  switch (schedule) {
    case 'daily': return true
    case 'eod': {
      if (!startISO) return true
      const start = new Date(startISO)
      const diff = Math.floor((dt.getTime() - start.getTime()) / 86_400_000)
      return diff % 2 === 0
    }
    case 'mwf': return dow === 1 || dow === 3 || dow === 5
    case 'tts': return dow === 2 || dow === 4 || dow === 6
    case '5x2': return dow >= 1 && dow <= 5
    case 'weekly': {
      if (!startISO) return dow === 0
      return dow === new Date(startISO).getDay()
    }
    default: return false
  }
}
