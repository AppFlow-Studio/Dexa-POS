import * as React from 'react'
import Svg, { Rect } from 'react-native-svg'

interface TableSquare4ChairProps {
  darkMode?: boolean
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const TableSquare4Chair = React.memo(function TableSquare4Chair ({
  darkMode = false,
  color = '#2DD4BF',
  width = 97,
  height = 97
}: TableSquare4ChairProps) {
  const fillOpacity = darkMode ? 0.12 : 0.18
  const strokeOpacity = darkMode ? 0.5 : 0.7

  return (
    <Svg width={width} height={height} viewBox='0 0 97 97' fill='none'>
      {/* Chair - top */}
      <Rect
        x='29'
        y='1'
        width='39'
        height='11'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1.5'
        strokeOpacity={strokeOpacity}
      />

      {/* Chair - bottom */}
      <Rect
        x='29'
        y='85'
        width='39'
        height='11'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1.5'
        strokeOpacity={strokeOpacity}
      />

      {/* Chair - left */}
      <Rect
        x='1'
        y='29'
        width='11'
        height='39'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1.5'
        strokeOpacity={strokeOpacity}
      />

      {/* Chair - right */}
      <Rect
        x='85'
        y='29'
        width='11'
        height='39'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1.5'
        strokeOpacity={strokeOpacity}
      />

      {/* Table surface */}
      <Rect
        x='12'
        y='12'
        width='73'
        height='73'
        rx='6'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='2'
        strokeOpacity={strokeOpacity}
      />
    </Svg>
  )
})

export default TableSquare4Chair
