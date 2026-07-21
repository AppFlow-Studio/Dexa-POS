import * as React from 'react'
import Svg, { Line, Rect } from 'react-native-svg'

interface ServerStationProps {
  darkMode?: boolean
  color?: string
  width?: number
  height?: number
}

const ServerStation = React.memo(function ServerStation ({
  darkMode = false,
  color = '#94A3B8',
  width = 60,
  height = 40
}: ServerStationProps) {
  const lightStroke = '#111827'

  return (
    <Svg width={width} height={height} viewBox='0 0 60 40' fill='none'>
      {/* Station body */}
      <Rect
        x='0.75'
        y='0.75'
        width='58.5'
        height='38.5'
        rx='4'
        fill={darkMode ? '#1E2340' : '#E5E7EB'}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='1.5'
      />

      {/* Top shelf */}
      <Rect
        x='6'
        y='5'
        width='36'
        height='13'
        rx='2'
        fill={color}
        fillOpacity={darkMode ? 0.08 : 0.75}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='0.75'
        strokeOpacity={darkMode ? 0.5 : 0.9}
      />

      {/* Bottom shelf */}
      <Rect
        x='6'
        y='22'
        width='36'
        height='13'
        rx='2'
        fill={color}
        fillOpacity={darkMode ? 0.08 : 0.75}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='0.75'
        strokeOpacity={darkMode ? 0.5 : 0.9}
      />

      {/* Divider */}
      <Line
        x1='6'
        y1='20'
        x2='42'
        y2='20'
        stroke={darkMode ? color : lightStroke}
        strokeWidth='0.5'
        strokeOpacity={darkMode ? 0.3 : 0.6}
      />

      {/* POS / printer */}
      <Rect
        x='46'
        y='6'
        width='9'
        height='28'
        rx='2'
        fill={color}
        fillOpacity={darkMode ? 0.12 : 0.75}
        stroke={darkMode ? color : lightStroke}
        strokeWidth='0.75'
      />

      {/* Paper slot */}
      <Rect
        x='48'
        y='18'
        width='5'
        height='2'
        rx='1'
        fill={color}
        fillOpacity={darkMode ? 0.3 : 0.75}
      />
    </Svg>
  )
})

export default ServerStation
