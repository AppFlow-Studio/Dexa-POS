import { BatchoutPanel } from '@/components/settings/batchout/BatchoutPanel'
import { colors } from '@/lib/theme'
import { Stack, useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useCallback } from 'react'
import { Pressable, ScrollView, Text, TouchableOpacity } from 'react-native'

export default function EndOfDaySettlementScreen () {
  const router = useRouter()

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
      return
    }
    router.replace('/(main)/settings/end-of-day')
  }, [router])

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Terminal Batchout',
          headerShown: true,
          headerBackVisible: true,
          headerTintColor: colors.label,
          headerStyle: { backgroundColor: colors.panel },
          headerLeft: () => (
            <Pressable
              onPress={handleBack}
              hitSlop={10}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                alignItems: 'center',
                justifyContent: 'center'
              }}
              accessibilityRole='button'
              accessibilityLabel='Go back'
            >
              <ChevronLeft size={20} color={colors.label} />
            </Pressable>
          )
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.screen }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      >
        <TouchableOpacity
          onPress={handleBack}
          style={{
            marginBottom: 16,
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            paddingHorizontal: 12,
            paddingVertical: 8
          }}
          accessibilityRole='button'
          accessibilityLabel='Back to End of Day'
        >
          <ChevronLeft size={16} color={colors.label} />
          <Text
            style={{
              marginLeft: 6,
              fontSize: 13,
              fontWeight: '600',
              color: colors.label
            }}
          >
            Back to End of Day
          </Text>
        </TouchableOpacity>

        <BatchoutPanel onDone={handleBack} />
      </ScrollView>
    </>
  )
}
