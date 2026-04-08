import HostStationScreenEnhanced from '@/components/host-station/HostStationScreenEnhanced'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { setWaitlistSupabaseClient } from '@/stores/useWaitlistStore'
import { useEffect } from 'react'
import { SafeAreaView, Text, View } from 'react-native'

const HostStationTab = () => {
  const client = useSupabaseClient()
  const location_id = useStoreSettingsStore(s => s.selectedStore?.id || '')

  // Initialize Supabase client for waitlist store
  useEffect(() => {
    if (client) {
      setWaitlistSupabaseClient(client)
    }
  }, [client])

  return (
    <SafeAreaView className='flex-1 bg-screen'>
      <View className='flex-1'>
        {location_id ? (
          <HostStationScreenEnhanced location_id={location_id} />
        ) : (
          <View className='flex-1 items-center justify-center'>
            <Text className='text-label'>Please select a location</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}

export default HostStationTab

// Re-export for potential use elsewhere
export { HostStationTab }
