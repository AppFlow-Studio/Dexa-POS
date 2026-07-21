import * as React from 'react'
import Svg, { Circle, G, Rect } from 'react-native-svg'

interface TableCircle6ChairProps {
  darkMode?: boolean
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const ANGLES = [0, 60, 120, 180, 240, 300]
const CHAIR_ORBIT = 38
const CHAIR_W = 16
const CHAIR_H = 12

const TableCircle6Chair = React.memo(function TableCircle6Chair ({
  darkMode = false,
  color = '#2DD4BF',
  width = 150,
  height = 150
}: TableCircle6ChairProps) {
  const fillOpacity = darkMode ? 0.12 : 0.18
  const strokeOpacity = darkMode ? 0.5 : 0.7
  return (
    <Svg width={width} height={height} viewBox='0 0 150 150' fill='none'>
      {ANGLES.map(angleDeg => {
        const rad = (angleDeg * Math.PI) / 180
        const cx = 75 + CHAIR_ORBIT * 1.25 * Math.sin(rad)
        const cy = 75 - CHAIR_ORBIT * 1.25 * Math.cos(rad)
        return (
          <G
            key={angleDeg}
            transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
          >
            <Rect
              x={-CHAIR_W / 2}
              y={-CHAIR_H / 2}
              width={CHAIR_W}
              height={CHAIR_H}
              rx='3'
              fill={color}
              fillOpacity={fillOpacity}
              stroke={color}
              strokeWidth='1.5'
              strokeOpacity={strokeOpacity}
            />
          </G>
        )
      })}

      {/* Table surface */}
      <Circle
        cx='75'
        cy='75'
        r='41'
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.15}
        stroke={color}
        strokeWidth='2'
        strokeOpacity={darkMode ? 0.5 : 0.8}
      />
    </Svg>
  )
})

export default TableCircle6Chair
