import * as React from 'react'
import Svg, { Circle } from 'react-native-svg'

interface TableHighTopProps {
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const TableHighTop = React.memo(function TableHighTop({
  color = '#2DD4BF',
  width = 120,
  height = 120
}: TableHighTopProps) {
  return (
    <Svg width={width} height={height} viewBox='0 0 80 80' fill='none'>
      {/* Table top surface */}
      <Circle
        cx='40'
        cy='40'
        r='36'
        fill={color}
        fillOpacity='0.18'
        stroke={color}
        strokeWidth='1.5'
        strokeOpacity='0.8'
      />
      {/* Overhang ring */}
      <Circle
        cx='40'
        cy='40'
        r='28'
        fill='none'
        stroke={color}
        strokeWidth='0.75'
        strokeOpacity='0.25'
      />
      {/* Pedestal base */}
      <Circle
        cx='40'
        cy='40'
        r='9'
        fill={color}
        fillOpacity='0.22'
        stroke={color}
        strokeWidth='1'
        strokeOpacity='0.5'
      />
    </Svg>
  )
})

export default TableHighTop
