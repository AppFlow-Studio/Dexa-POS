import * as React from 'react'
import Svg, { Circle, Rect } from 'react-native-svg'

interface TableCircle2ChairProps {
  darkMode?: boolean
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const TableCircle2Chair = React.memo(function TableCircle2Chair ({
  darkMode = false,
  color = '#2DD4BF',
  width = 130,
  height = 130
}: TableCircle2ChairProps) {
  const fillOpacity = darkMode ? 0.12 : 0.18
  const strokeOpacity = darkMode ? 0.5 : 0.7

  return (
    <Svg width={width} height={height} viewBox='0 0 100 100' fill='none'>
      {/* Chair - top */}
      <Rect
        x='36'
        y='4'
        width='28'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />

      {/* Chair - bottom */}
      <Rect
        x='36'
        y='84'
        width='28'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />

      {/* Table surface */}
      <Circle
        cx='50'
        cy='50'
        r='31'
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.28}
        stroke={color}
        strokeWidth='1.5'
        strokeOpacity={strokeOpacity}
      />
    </Svg>
  )
})

export default TableCircle2Chair
