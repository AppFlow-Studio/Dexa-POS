import * as React from 'react'
import Svg, { Rect } from 'react-native-svg'

interface TableSquare8ChairProps {
  darkMode?: boolean
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const TableSquare8Chair = React.memo(function TableSquare8Chair ({
  darkMode = false,
  color = '#2DD4BF',
  width = 208,
  height = 97
}: TableSquare8ChairProps) {
  const lightStroke = '#94A3B8'
  const chairStrokeOpacity = darkMode ? 0.5 : 0.7

  return (
    <Svg width={width} height={height} viewBox='0 0 208 97' fill='none'>
      {/* Chairs - top */}
      <Rect
        x='28'
        y='1'
        width='40'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.85}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1'
        strokeOpacity={chairStrokeOpacity}
      />
      <Rect
        x='84'
        y='1'
        width='40'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.85}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1'
        strokeOpacity={chairStrokeOpacity}
      />
      <Rect
        x='140'
        y='1'
        width='40'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.85}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1'
        strokeOpacity={chairStrokeOpacity}
      />

      {/* Chairs - bottom */}
      <Rect
        x='28'
        y='84'
        width='40'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.85}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1'
        strokeOpacity={chairStrokeOpacity}
      />
      <Rect
        x='84'
        y='84'
        width='40'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.85}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1'
        strokeOpacity={chairStrokeOpacity}
      />
      <Rect
        x='140'
        y='84'
        width='40'
        height='12'
        rx='3'
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.85}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1'
        strokeOpacity={chairStrokeOpacity}
      />

      {/* Side chairs */}
      <Rect
        x='1'
        y='29'
        width='12'
        height='39'
        rx='3'
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.85}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1'
        strokeOpacity={chairStrokeOpacity}
      />

      <Rect
        x='195'
        y='29'
        width='12'
        height='39'
        rx='3'
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.85}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1'
        strokeOpacity={chairStrokeOpacity}
      />

      {/* Table surface */}
      <Rect
        x='13'
        y='13'
        width='182'
        height='71'
        rx='6'
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.88}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1.5'
        strokeOpacity={darkMode ? 0.8 : 0.75}
      />
    </Svg>
  )
})

export default TableSquare8Chair
