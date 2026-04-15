import TableOrderView, { type TableOrderViewHandle } from '@/components/tables/TableOrderView'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useRef } from 'react'
import { StyleSheet, TouchableWithoutFeedback, View } from 'react-native'

export default function TableScreen () {
  const { tableId } = useLocalSearchParams<{ tableId: string }>()
  const router = useRouter()
  const isClosingRef = useRef(false)
  const tableViewRef = useRef<TableOrderViewHandle>(null)

  const doGoBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/tables')
    }
  }, [router])

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return
    isClosingRef.current = true
    tableViewRef.current?.prepareClose()
    doGoBack()
  }, [doGoBack])

  return (
    <View style={styles.container}>
      <View style={styles.backdrop}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      </View>
      <View style={styles.card}>
        <TableOrderView
          ref={tableViewRef}
          tableId={typeof tableId === 'string' ? tableId : ''}
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
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.38)'
  },
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 8
  }
})
