import * as React from 'react'
import Svg, { Circle, Rect } from 'react-native-svg'

interface BarSectionProps {
  darkMode?: boolean
  width?: number
  height?: number
}

const BarSection = React.memo(function BarSection ({
  darkMode = false,
  width = 170,
  height = 100
}: BarSectionProps) {
  const body = '#E5E7EB'
  const surface = '#D1D5DB'
  const inner = '#E5E7EB'
  const ledge = '#9CA3AF'
  const stroke = '#111827'
  const stoolCenter = '#374151'

  return (
    <Svg width={width} height={height} viewBox='0 0 170 100' fill='none'>
      {/* Main body */}
      <Rect
        x='5'
        y='8'
        width='160'
        height='52'
        rx='4'
        fill={darkMode ? '#1E2340' : body}
        stroke={darkMode ? '#94A3B8' : stroke}
        strokeWidth='2'
      />

      {/* Surface */}
      <Rect
        x='5'
        y='8'
        width='160'
        height='52'
        rx='4'
        fill={darkMode ? '#1E2340' : surface}
      />

      {/* Inner counter */}
      <Rect
        x='12'
        y='15'
        width='146'
        height='16'
        rx='2'
        fill={darkMode ? '#1E2340' : inner}
        stroke={darkMode ? '#94A3B8' : stroke}
        strokeWidth='1'
      />

      {/* Shelf */}
      <Rect
        x='12'
        y='36'
        width='146'
        height='16'
        rx='2'
        fill={darkMode ? '#1E2340' : inner}
        stroke={darkMode ? '#94A3B8' : stroke}
        strokeWidth='1'
      />

      {/* Front ledge */}
      <Rect
        x='5'
        y='60'
        width='160'
        height='10'
        rx='2'
        fill={darkMode ? '#1E2340' : ledge}
        stroke={darkMode ? '#94A3B8' : stroke}
        strokeWidth='1.5'
      />

      {/* Stools */}
      {[25, 63, 107, 145].map(cx => (
        <React.Fragment key={cx}>
          <Circle
            cx={cx}
            cy='83'
            r='9'
            fill={darkMode ? '#1E2340' : inner}
            stroke={darkMode ? '#94A3B8' : stroke}
            strokeWidth='1.5'
          />
          <Circle
            cx={cx}
            cy='83'
            r='3'
            fill={darkMode ? '#CBD5F5' : stoolCenter}
          />
        </React.Fragment>
      ))}
    </Svg>
  )
})

export default BarSection
