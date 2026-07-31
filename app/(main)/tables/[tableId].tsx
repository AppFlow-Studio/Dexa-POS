import TableOrderView, {
  type TableOrderViewHandle
} from '@/components/tables/TableOrderView'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useRef } from 'react'
import { StyleSheet, View } from 'react-native'

export default function TableScreen () {
  const { tableId } = useLocalSearchParams<{ tableId: string }>()
  const router = useRouter()
  const isClosingRef = useRef(false)
  const tableViewRef = useRef<TableOrderViewHandle>(null)
  const resolvedTableId = typeof tableId === 'string' ? tableId : ''

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return
    isClosingRef.current = true
    tableViewRef.current?.prepareClose()
    router.back()
  }, [router])

  return (
    <View style={styles.container}>
      <TableOrderView
        ref={tableViewRef}
        tableId={resolvedTableId}
        onClose={handleClose}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  }
})
