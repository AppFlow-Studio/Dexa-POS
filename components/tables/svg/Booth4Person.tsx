import Svg, { Rect } from 'react-native-svg'

interface Booth4PersonProps {
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const Booth4Person = ({
  color = '#2DD4BF',
  width = 200,
  height = 100,
  ...props
}: Booth4PersonProps) => (
  <Svg
    width={width}
    height={height}
    viewBox='0 0 200 100'
    fill='none'
    {...props}
  >
    {/* Table surface */}
    <Rect
      x='6'
      y='24'
      width='188'
      height='52'
      rx='6'
      fill={color}
      fillOpacity='0.18'
      stroke={color}
      strokeWidth='1.5'
      strokeOpacity='0.8'
    />
    {/* Booth top and bottom */}
    <Rect
      x='6'
      y='0'
      width='188'
      height='16'
      rx='3'
      fill={color}
      fillOpacity='0.12'
      stroke={color}
      strokeWidth='1'
      strokeOpacity='0.5'
    />
    <Rect
      x='6'
      y='84'
      width='188'
      height='16'
      rx='3'
      fill={color}
      fillOpacity='0.12'
      stroke={color}
      strokeWidth='1'
      strokeOpacity='0.5'
    />
  </Svg>
)

export default Booth4Person
