import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { Plus } from 'lucide-react-native'
import React, { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type CreateCustomItemCardStyles = ReturnType<typeof createStyles>

const createCustomItemCardStylesByScale = new Map<
  number,
  CreateCustomItemCardStyles
>()

const createStyles = (scale: number) => {
  const s = (n: number) => Math.round(n * scale)
  return StyleSheet.create({
    container: {
      width: '19%',
      borderRadius: s(12),
      marginBottom: s(4),
      backgroundColor: colors.teal,
      borderWidth: 1,
      borderColor: colors.teal,
      overflow: 'hidden',
      minHeight: s(176),
      alignItems: 'center',
      justifyContent: 'center',
      gap: s(8)
    },
    iconContainer: {
      width: s(48),
      height: s(48),
      borderRadius: s(24),
      backgroundColor: colors.teal + '20',
      alignItems: 'center',
      justifyContent: 'center'
    },
    label: {
      fontSize: s(11),
      fontWeight: '600',
      color: colors.heading,
      textAlign: 'center',
      paddingHorizontal: s(6)
    }
  })
}

const getStylesForScale = (scale: number) => {
  const cached = createCustomItemCardStylesByScale.get(scale)
  if (cached) return cached
  const next = createStyles(scale)
  createCustomItemCardStylesByScale.set(scale, next)
  return next
}

interface CreateCustomItemCardProps {
  onPress?: () => void
}

const CreateCustomItemCard: React.FC<CreateCustomItemCardProps> = ({
  onPress
}) => {
  const uiScale = useUiScale()
  const styles = useMemo(() => getStylesForScale(uiScale), [uiScale])
  const s = (n: number) => Math.round(n * uiScale)

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.iconContainer}>
        <Plus color={colors.heading} size={s(24)} strokeWidth={2.5} />
      </View>
      <Text style={styles.label}>Create Custom</Text>
    </TouchableOpacity>
  )
}

export default React.memo(CreateCustomItemCard)
