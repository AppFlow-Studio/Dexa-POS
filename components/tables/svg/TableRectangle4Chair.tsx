import * as React from 'react'
import Svg, { Rect } from 'react-native-svg'

interface TableRectangle4ChairProps {
  darkMode?: boolean
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const TableRectangle4Chair = React.memo(function TableRectangle4Chair ({
  darkMode = false,
  color = '#2DD4BF',
  width = 140,
  height = 90
}: TableRectangle4ChairProps) {
  const fillOpacity = darkMode ? 0.12 : 0.18
  const strokeOpacity = darkMode ? 0.5 : 0.7

  return (
    <Svg width={width} height={height} viewBox='0 0 140 90' fill='none'>
      {/* Chairs - top */}
      <Rect
        x='30'
        y='3'
        width='32'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />
      <Rect
        x='78'
        y='3'
        width='32'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />

      {/* Chairs - bottom */}
      <Rect
        x='30'
        y='75'
        width='32'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />
      <Rect
        x='78'
        y='75'
        width='32'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />

      {/* Table */}
      <Rect
        x='20'
        y='15'
        width='100'
        height='60'
        rx='8'
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.28}
        stroke={color}
        strokeWidth='1.5'
        strokeOpacity={darkMode ? 0.5 : 0.6}
      />
    </Svg>
  )
})

export default TableRectangle4Chair
