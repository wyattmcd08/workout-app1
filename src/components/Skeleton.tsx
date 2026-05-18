interface Props {
  height?: number | string
  width?: number | string
  radius?: number
  className?: string
}

export function Skeleton({ height = 16, width = '100%', radius = 8, className = '' }: Props) {
  return (
    <div
      className={`shimmer ${className}`}
      style={{
        height,
        width,
        borderRadius: radius,
      }}
    />
  )
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card p-4 space-y-2.5">
      <Skeleton height={14} width="40%" />
      <Skeleton height={28} width="65%" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={10} width={`${85 - i * 12}%`} />
      ))}
    </div>
  )
}
