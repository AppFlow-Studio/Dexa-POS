import * as React from 'react'
import Svg, { Rect } from 'react-native-svg'

interface Booth4PersonProps {
  darkMode?: boolean
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const Booth4Person = React.memo(function Booth4Person ({
  darkMode = false,
  color = '#2DD4BF',
  width = 200,
  height = 100
}: Booth4PersonProps) {
  const fillOpacity = darkMode ? 0.12 : 0.18
  const strokeOpacity = darkMode ? 0.5 : 0.7

  return (
    <Svg width={width} height={height} viewBox='0 0 200 100' fill='none'>
      {/* Table surface */}
      <Rect
        x='6'
        y='24'
        width='188'
        height='52'
        rx='6'
        fill={color}
        fillOpacity={darkMode ? 0.18 : 0.28}
        stroke={color}
        strokeWidth='1.5'
        strokeOpacity={strokeOpacity}
      />
      {/* Booth top */}
      <Rect
        x='6'
        y='0'
        width='188'
        height='16'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />
      {/* Booth bottom */}
      <Rect
        x='6'
        y='84'
        width='188'
        height='16'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1'
        strokeOpacity={strokeOpacity}
      />
    </Svg>
  )
})

export default Booth4Person
