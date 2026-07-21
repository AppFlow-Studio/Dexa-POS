import * as React from 'react'
import { Rect, Svg } from 'react-native-svg'

const ZoneRectangle = React.memo(function ZoneRectangle({ color = '#2DD4BF', width = 200, height = 200 }: { color?: string; width?: number; height?: number }) {
  const defaultSize = 200
  const scaleX = (width || defaultSize) / defaultSize

  return (
    <Svg
      width={width}
      height={height}
      viewBox='0 0 200 200'
      preserveAspectRatio='none'
    >
      <Rect
        width='200'
        height='200'
        fill={color}
        fillOpacity='0.07'
        stroke={color}
        strokeWidth={1.5 * scaleX}
        strokeDasharray='6,4'
        strokeOpacity='0.6'
      />
    </Svg>
  )
})

export default ZoneRectangle
