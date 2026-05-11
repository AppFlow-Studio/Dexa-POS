import * as React from 'react'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'

interface DoorDoubleProps {
  darkMode?: boolean
  color?: string
  width?: number
  height?: number
}

const DoorDouble = React.memo(function DoorDouble({
  darkMode = false,
  color = '#94A3B8',
  width = 160,
  height = 20
}: DoorDoubleProps) {
  const strokeColor = darkMode ? '#94A3B8' : '#475569'
  const wedgeFill = darkMode
    ? 'rgba(148, 163, 184, 0.2)'
    : 'rgba(71, 85, 105, 0.12)'
  const doorFill = darkMode ? '#64748B' : '#94A3B8'

  return (
    <Svg
      width={width}
      height={height}
      viewBox='0 0 160 80'
      fill='none'
      preserveAspectRatio='none'
    >
      <Rect
        x='0'
        y='70'
        width='160'
        height='6'
        fill={darkMode ? '#334155' : '#E2E8F0'}
        stroke={strokeColor}
        strokeWidth='1.5'
      />
      <Rect
        x='6'
        y='70'
        width='148'
        height='6'
        fill={darkMode ? '#1E293B' : '#F8FAFC'}
      />
      <Path
        d='M 80 70 L 80 6 A 64 64 0 0 0 16 70 Z'
        fill={wedgeFill}
        stroke={strokeColor}
        strokeWidth='1.25'
      />
      <Path
        d='M 80 70 L 80 6 A 64 64 0 0 1 144 70 Z'
        fill={wedgeFill}
        stroke={strokeColor}
        strokeWidth='1.25'
      />
      <Line
        x1='80'
        y1='70'
        x2='80'
        y2='6'
        stroke={doorFill}
        strokeWidth='4'
        strokeLinecap='round'
      />
      <Circle
        cx='80'
        cy='70'
        r='4'
        fill={doorFill}
        stroke={strokeColor}
        strokeWidth='1.5'
      />
      <Circle
        cx='80'
        cy='70'
        r='1.5'
        fill={darkMode ? '#1E293B' : '#F8FAFC'}
      />
    </Svg>
  )
})

export default DoorDouble
