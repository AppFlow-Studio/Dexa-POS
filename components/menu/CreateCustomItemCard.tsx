import { colors } from '@/lib/theme'
import { Plus } from 'lucide-react-native'
import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

const styles = StyleSheet.create({
  container: {
    width: '19%',
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: colors.teal,
    borderWidth: 1,
    borderColor: colors.teal,
    overflow: 'hidden',
    minHeight: 176,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
    paddingHorizontal: 6
  }
})

interface CreateCustomItemCardProps {
  onPress?: () => void
}

const CreateCustomItemCard: React.FC<CreateCustomItemCardProps> = ({
  onPress
}) => {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.iconContainer}>
        <Plus color='#000000' size={24} strokeWidth={2.5} />
      </View>
      <Text style={styles.label}>Create Custom</Text>
    </TouchableOpacity>
  )
}

export default React.memo(CreateCustomItemCard)
