import PreviousOrdersSection from '@/components/menu/PreviousOrdersSection'
import { colors } from '@/lib/theme'
import { View } from 'react-native'

export default function PreviousOrdersScreen () {
  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      <PreviousOrdersSection />
    </View>
  )
}
