import Svg, { Rect } from 'react-native-svg'

interface Booth2PersonProps {
  color?: string
  chairColor?: string
  width?: number
  height?: number
}

const Booth2Person = ({
  color = '#2DD4BF',
  width = 150,
  height = 100,
  ...props
}: Booth2PersonProps) => (
  <Svg
    width={width}
    height={height}
    viewBox='0 0 180 80'
    fill='none'
    {...props}
  >
    {/* Table surface */}
    <Rect
      x='6'
      y='16'
      width='168'
      height='48'
      rx='4'
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
      width='168'
      height='13'
      rx='3'
      fill={color}
      fillOpacity='0.12'
      stroke={color}
      strokeWidth='1'
      strokeOpacity='0.5'
    />
    <Rect
      x='6'
      y='67'
      width='168'
      height='13'
      rx='3'
      fill={color}
      fillOpacity='0.12'
      stroke={color}
      strokeWidth='1'
      strokeOpacity='0.5'
    />
  </Svg>
)

export default Booth2Person
