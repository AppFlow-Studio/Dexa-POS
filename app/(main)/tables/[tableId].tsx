import TableOrderView, {
  type TableOrderViewHandle
} from '@/components/tables/TableOrderView'
import { colors } from '@/lib/theme'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useRef } from 'react'
import { StyleSheet, TouchableWithoutFeedback, View } from 'react-native'

export default function TableScreen () {
  const { tableId } = useLocalSearchParams<{ tableId: string }>()
  const router = useRouter()
  const isClosingRef = useRef(false)
  const tableViewRef = useRef<TableOrderViewHandle>(null)
  const resolvedTableId = typeof tableId === 'string' ? tableId : ''

  const doGoBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
      return
    }
    router.replace('/tables')
  }, [router])

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return
    isClosingRef.current = true
    tableViewRef.current?.prepareClose()
    doGoBack()
  }, [doGoBack])

  return (
    <View style={styles.container}>
      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: colors.heading + '60'
        }}
      >
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      </View>
      <View
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 0,
          overflow: 'hidden',
          elevation: 8,
          shadowColor: colors.heading,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.18,
          shadowRadius: 8
        }}
      >
        <TableOrderView
          ref={tableViewRef}
          tableId={resolvedTableId}
          onClose={handleClose}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  }
})
