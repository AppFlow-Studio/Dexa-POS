import * as React from 'react'
import Svg, { Rect } from 'react-native-svg'

interface TableSquare2ChairProps {
  darkMode?: boolean
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const TableSquare2Chair = React.memo(function TableSquare2Chair ({
  darkMode = false,
  color = '#2DD4BF',
  width = 79,
  height = 97
}: TableSquare2ChairProps) {
  const fillOpacity = darkMode ? 0.12 : 0.18
  const strokeOpacity = darkMode ? 0.5 : 0.7

  return (
    <Svg width={width} height={height} viewBox='0 0 79 97' fill='none'>
      {/* Chair - top */}
      <Rect
        x='19'
        y='3'
        width='41'
        height='11'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1.5'
        strokeOpacity={strokeOpacity}
      />

      {/* Table surface */}
      <Rect
        x='4'
        y='14'
        width='71'
        height='69'
        rx='5'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='2'
        strokeOpacity={strokeOpacity}
      />

      {/* Chair - bottom */}
      <Rect
        x='19'
        y='83'
        width='41'
        height='11'
        rx='3'
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth='1.5'
        strokeOpacity={strokeOpacity}
      />
    </Svg>
  )
})

export default TableSquare2Chair
