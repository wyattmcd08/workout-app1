import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'

interface Props {
  data: { date: string; value: number }[]
  color?: string
  height?: number
  showAxes?: boolean
  yLabel?: string
}

export function Spark({ data, color = 'var(--color-accent)', height = 60, showAxes = false, yLabel }: Props) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-[var(--color-text-faint)]"
        style={{ height }}
      >No data yet</div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 8, left: showAxes ? 0 : 8, bottom: 0 }}>
        {showAxes && (
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5)}
            tick={{ fontSize: 10, fill: '#9a9aa3' }}
            stroke="#26262a"
          />
        )}
        {showAxes && <YAxis tick={{ fontSize: 10, fill: '#9a9aa3' }} stroke="#26262a" label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fontSize: 10, fill: '#9a9aa3' } : undefined} />}
        {showAxes && (
          <Tooltip
            contentStyle={{ background: '#141416', border: '1px solid #2a2a2f', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#9a9aa3' }}
          />
        )}
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
