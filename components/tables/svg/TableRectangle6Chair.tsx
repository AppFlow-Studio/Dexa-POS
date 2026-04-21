import * as React from 'react'
import Svg, { Rect } from 'react-native-svg'

interface TableRectangle6ChairProps {
  darkMode?: boolean
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const TableRectangle6Chair = React.memo(function TableRectangle6Chair ({
  darkMode = false,
  color = '#2DD4BF',
  width = 180,
  height = 90
}: TableRectangle6ChairProps) {
  const lightStroke = '#94A3B8'
  const strokeOpacity = darkMode ? 0.5 : 0.7

  return (
    <Svg width={width} height={height} viewBox='0 0 180 90' fill='none'>
      {/* Chairs - top */}
      <Rect
        x='30'
        y='3'
        width='32'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.85}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />
      <Rect
        x='74'
        y='3'
        width='32'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.85}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />
      <Rect
        x='118'
        y='3'
        width='32'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.85}
        stroke={darkMode ? color : lightStroke}
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
        fillOpacity={darkMode ? 0.12 : 0.85}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />
      <Rect
        x='74'
        y='75'
        width='32'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.85}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />
      <Rect
        x='118'
        y='75'
        width='32'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.85}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />

      {/* Table surface */}
      <Rect
        x='20'
        y='15'
        width='140'
        height='60'
        rx='8'
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.88}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1.5'
        strokeOpacity={darkMode ? 0.8 : 0.75}
      />
    </Svg>
  )
})

export default TableRectangle6Chair
