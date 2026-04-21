import * as React from 'react'
import Svg, { Line, Rect } from 'react-native-svg'

interface WallSectionProps {
  darkMode?: boolean
  color?: string
  width?: number
  height?: number
}

const WallSection = React.memo(function WallSection ({
  darkMode = false,
  color = '#94A3B8',
  width = 200,
  height = 10
}: WallSectionProps) {
  const lightStroke = '#111827'
  const stroke = darkMode ? color : lightStroke
  const highlightY = Math.min(3, height * 0.3)
  const shadowY = Math.max(height - 2.5, height * 0.7)

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill='none'
      preserveAspectRatio='none'
    >
      {/* Wall body */}
      <Rect
        x='0'
        y='0'
        width={width}
        height={height}
        fill={darkMode ? '#1E2340' : '#F3F4F6'}
        stroke={stroke}
        strokeWidth='1.5'
      />

      {/* Inner highlight line */}
      <Line
        x1='0'
        y1={highlightY}
        x2={width}
        y2={highlightY}
        stroke={stroke}
        strokeWidth='0.5'
        strokeOpacity={darkMode ? 0.35 : 0.4}
      />

      {/* Bottom shadow line */}
      <Line
        x1='0'
        y1={shadowY}
        x2={width}
        y2={shadowY}
        stroke={stroke}
        strokeWidth='0.5'
        strokeOpacity={darkMode ? 0.15 : 0.25}
      />
    </Svg>
  )
})

export default WallSection
