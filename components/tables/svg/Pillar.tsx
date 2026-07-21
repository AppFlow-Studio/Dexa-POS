import * as React from 'react'
import Svg, { Rect } from 'react-native-svg'

interface PillarProps {
  darkMode?: boolean
  color?: string
  width?: number
  height?: number
}

const Pillar = React.memo(function Pillar ({
  darkMode = false,
  color = '#94A3B8',
  width = 40,
  height = 40
}: PillarProps) {
  const lightStroke = '#111827'

  return (
    <Svg
      width={width}
      height={height}
      viewBox='0 0 40 40'
      fill='none'
      preserveAspectRatio='none'
    >
      {/* Outer pillar body */}
      <Rect
        x='0.75'
        y='0.75'
        width='38.5'
        height='38.5'
        rx='2'
        fill={darkMode ? '#1E2340' : '#E5E7EB'}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1.5'
      />

      {/* Inner recess */}
      <Rect
        x='6'
        y='6'
        width='28'
        height='28'
        rx='1'
        fill={color}
        fillOpacity={darkMode ? 0.06 : 0.75}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='0.75'
        strokeOpacity={darkMode ? 0.5 : 0.9}
      />

      {/* Inner core */}
      <Rect
        x='11'
        y='11'
        width='18'
        height='18'
        rx='1'
        fill={color}
        fillOpacity={darkMode ? 0.1 : 0.75}
      />
    </Svg>
  )
})

export default Pillar
