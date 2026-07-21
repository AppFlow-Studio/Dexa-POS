import * as React from 'react'
import Svg, { Rect } from 'react-native-svg'

interface Booth2PersonProps {
  darkMode?: boolean
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const Booth2Person = React.memo(function Booth2Person ({
  darkMode = false,
  color = '#2DD4BF',
  width = 150,
  height = 100
}: Booth2PersonProps) {
  const fillOpacity = darkMode ? 0.12 : 0.18
  const strokeOpacity = darkMode ? 0.5 : 0.7

  return (
    <Svg width={width} height={height} viewBox='0 0 180 80' fill='none'>
      {/* Table surface */}
      <Rect
        x='6'
        y='16'
        width='168'
        height='48'
        rx='4'
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
        width='168'
        height='13'
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
        y='67'
        width='168'
        height='13'
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

export default Booth2Person
