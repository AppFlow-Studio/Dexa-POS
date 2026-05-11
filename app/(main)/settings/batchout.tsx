import { BatchoutPanel } from '@/components/settings/batchout/BatchoutPanel'
import { colors } from '@/lib/theme'
import { ScrollView, Text, View } from 'react-native'

export default function BatchoutScreen () {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.screen,
        paddingHorizontal: 14,
        paddingVertical: 10
      }}
    >
      <View style={{ marginBottom: 12 }}>
        <Text
          style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}
        >
          Batchout
        </Text>
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
          Close the terminal batch and review today's settlements
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <BatchoutPanel showBatchLog />
      </ScrollView>
    </View>
  )
}
