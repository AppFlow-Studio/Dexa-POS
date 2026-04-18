import * as React from 'react'
import Svg, { Circle, G, Rect } from 'react-native-svg'

interface TableCircle6ChairProps {
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const ANGLES = [0, 60, 120, 180, 240, 300]
const CENTER = 60
const CHAIR_ORBIT = 38
const CHAIR_W = 16
const CHAIR_H = 12

const TableCircle6Chair = React.memo(function TableCircle6Chair({
  color = '#2DD4BF',
  width = 150,
  height = 150
}: TableCircle6ChairProps) {
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
              fillOpacity='0.12'
              stroke={color}
              strokeWidth='1'
              strokeOpacity='0.5'
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
        fillOpacity='0.18'
        stroke={color}
        strokeWidth='1.5'
        strokeOpacity='0.8'
      />
    </Svg>
  )
})

export default TableCircle6Chair
