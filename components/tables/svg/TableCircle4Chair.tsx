import * as React from 'react'
import Svg, { Circle, Rect } from 'react-native-svg'

interface TableCircle4ChairProps {
  darkMode?: boolean
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const TableCircle4Chair = React.memo(function TableCircle4Chair ({
  darkMode = false,
  color = '#2DD4BF',
  width = 130,
  height = 130
}: TableCircle4ChairProps) {
  const fillOpacity = darkMode ? 0.12 : 0.18
  const strokeOpacity = darkMode ? 0.5 : 0.7

  return (
    <Svg width={width} height={height} viewBox='0 0 90 90' fill='none'>
      {/* Chair - top */}
      <Rect
        x='31'
        y='3'
        width='28'
        height='14'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />

      {/* Chair - bottom */}
      <Rect
        x='31'
        y='73'
        width='28'
        height='14'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />

      {/* Chair - left */}
      <Rect
        x='3'
        y='31'
        width='14'
        height='28'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />

      {/* Chair - right */}
      <Rect
        x='73'
        y='31'
        width='14'
        height='28'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />

      {/* Table surface */}
      <Circle
        cx='45'
        cy='45'
        r='28'
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.28}
        stroke={color}
        strokeWidth='1.5'
        strokeOpacity={darkMode ? 0.5 : 0.6}
      />
    </Svg>
  )
})

export default TableCircle4Chair
