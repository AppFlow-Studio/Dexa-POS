import * as React from 'react'
import Svg, { Circle, Rect } from 'react-native-svg'

interface TableCircle2ChairProps {
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const TableCircle2Chair = React.memo(function TableCircle2Chair({
  color = '#2DD4BF',
  width = 130,
  height = 130,
}: TableCircle2ChairProps) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox='0 0 100 100'
      fill='none'
    >
      {/* Chair — top */}
      <Rect
        x='36'
        y='4'
        width='28'
        height='12'
        rx='3'
        fill={color}
        fillOpacity='0.12'
        stroke={color}
        strokeWidth='1'
        strokeOpacity='0.5'
      />
      {/* Chair — bottom */}
      <Rect
        x='36'
        y='84'
        width='28'
        height='12'
        rx='3'
        fill={color}
        fillOpacity='0.12'
        stroke={color}
        strokeWidth='1'
        strokeOpacity='0.5'
      />
      {/* Table surface */}
      <Circle
        cx='50'
        cy='50'
        r='31'
        fill={color}
        fillOpacity='0.18'
        stroke={color}
        strokeWidth='1.5'
        strokeOpacity='0.8'
      />
    </Svg>
  )
})

export default TableCircle2Chair
