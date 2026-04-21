import * as React from 'react'
import Svg, { Circle } from 'react-native-svg'

interface TableHighTopProps {
  darkMode?: boolean
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const TableHighTop = React.memo(function TableHighTop ({
  darkMode = false,
  color = '#2DD4BF',
  width = 120,
  height = 120
}: TableHighTopProps) {
  const lightStroke = '#94A3B8'

  return (
    <Svg width={width} height={height} viewBox='0 0 80 80' fill='none'>
      {/* Table top surface */}
      <Circle
        cx='40'
        cy='40'
        r='36'
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.88}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1.5'
        strokeOpacity={darkMode ? 0.8 : 0.75}
      />

      {/* Overhang ring */}
      <Circle
        cx='40'
        cy='40'
        r='28'
        fill='none'
        stroke={darkMode ? color : lightStroke}
        strokeWidth='0.75'
        strokeOpacity={darkMode ? 0.25 : 0.35}
      />

      {/* Pedestal base */}
      <Circle
        cx='40'
        cy='40'
        r='9'
        fill={color}
        fillOpacity={darkMode ? 0.22 : 0.9}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1'
        strokeOpacity={darkMode ? 0.5 : 0.75}
      />
    </Svg>
  )
})

export default TableHighTop
