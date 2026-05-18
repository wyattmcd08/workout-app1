import { useEffect, useRef } from 'react'

interface Props {
  checked: boolean
  size?: number
  color?: string
  strokeWidth?: number
}

// SVG checkmark that draws in via stroke-dashoffset when `checked` flips true,
// and fades when flipped false. The line length is approximated from the path.
const LENGTH = 28 // approximate length of the M5 12 L 10 17 L 19 8 path

export function AnimatedCheck({ checked, size = 24, color = 'currentColor', strokeWidth = 3 }: Props) {
  const pathRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    const p = pathRef.current
    if (!p) return
    p.style.strokeDasharray = `${LENGTH}`
    p.style.strokeDashoffset = checked ? '0' : `${LENGTH}`
  }, [checked])

  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <path
        ref={pathRef}
        d="M5 12 L 10 17 L 19 8"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: LENGTH,
          strokeDashoffset: LENGTH,
          transition: 'stroke-dashoffset 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </svg>
  )
}
