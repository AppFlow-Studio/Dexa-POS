import * as React from 'react'
import Svg, { Path, Rect } from 'react-native-svg'

interface HostStandProps {
  darkMode?: boolean
  color?: string
  width?: number
  height?: number
}

const HostStand = React.memo(function HostStand ({
  darkMode = false,
  color = '#94A3B8',
  width = 40,
  height = 35
}: HostStandProps) {
  const lightStroke = '#111827'

  return (
    <Svg width={width} height={height} viewBox='0 0 40 35' fill='none'>
      {/* Podium outer body */}
      <Rect
        x='0.75'
        y='0.75'
        width='38.5'
        height='33.5'
        rx='3'
        fill={darkMode ? '#1E2340' : '#E5E7EB'}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1.5'
      />

      {/* Slanted reading surface */}
      <Path
        d='M5 4 L35 4 L31 28 L9 28 Z'
        fill={color}
        fillOpacity={darkMode ? 0.1 : 0.75}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='0.75'
        strokeOpacity={darkMode ? 0.5 : 0.9}
        strokeLinejoin='round'
      />

      {/* Book / tablet */}
      <Rect
        x='12'
        y='9'
        width='16'
        height='13'
        rx='2'
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.75}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='0.75'
      />

      {/* Book spine */}
      <Rect
        x='19'
        y='9'
        width='1'
        height='13'
        rx='0.5'
        fill={color}
        fillOpacity={darkMode ? 0.3 : 0.75}
      />
    </Svg>
  )
})

export default HostStand
