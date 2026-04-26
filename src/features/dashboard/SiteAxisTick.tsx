import { CHART } from './chartTheme'
import { splitSiteNameForAxis } from './siteNameForChart'

type TickProps = {
  x?: number
  y?: number
  payload?: { value?: string }
}

const LINE_HEIGHT = 14

export function SiteAxisTick({ x = 0, y = 0, payload }: TickProps) {
  const raw = payload?.value ?? ''
  const lines = splitSiteNameForAxis(raw)
  const offsetY = -((lines.length - 1) * LINE_HEIGHT) / 2

  return (
    <g transform={`translate(${x},${y})`}>
      {lines.map((line, i) => (
        <text
          key={i}
          x={-6}
          y={offsetY + i * LINE_HEIGHT}
          dy={LINE_HEIGHT * 0.35}
          textAnchor="end"
          fill={CHART.axis}
          fontSize={12}
          fontWeight={500}
        >
          {line}
        </text>
      ))}
    </g>
  )
}
