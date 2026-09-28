import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { Delete, X } from '@/lib/icons'
import React, { useMemo } from 'react'
import { AccessibilityActionEvent, Pressable, Text, View } from 'react-native'

export type NumpadAction = 'clear' | 'backspace'
export type NumpadInput = number | NumpadAction

interface PinNumpadProps {
  onKeyPress: (input: NumpadInput) => void
  showDecimalKey?: boolean
  onDecimalPress?: () => void
}

const ACTIVATE = [{ name: 'activate' as const }]

/**
 * A key registers on touch-down (onPressIn), not on release: the digit lands
 * while the finger is still on the glass, so entry keeps up with fast typing.
 * The Android ripple is drawn natively, so the key reacts instantly even when
 * the JS thread is busy. Screen readers activate through the accessibility
 * action instead of a press, so both paths fire the key exactly once.
 */
const PinButton = React.memo(function PinButton ({
  value,
  label,
  onPress,
  isAction
}: {
  value: React.ReactNode
  label: string
  onPress: () => void
  isAction?: boolean
}) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
    <Pressable
      onPressIn={onPress}
      accessibilityRole='button'
      accessibilityLabel={label}
      accessibilityActions={ACTIVATE}
      onAccessibilityAction={(e: AccessibilityActionEvent) => {
        if (e.nativeEvent.actionName === 'activate') onPress()
      }}
      android_ripple={{ color: colors.border, borderless: false }}
      // A plain style object: a `({ pressed }) => style` function was dropped
      // here (keys rendered unstyled), and the native ripple is the press
      // feedback anyway.
      style={{
        width: s(80),
        height: s(64),
        backgroundColor: isAction ? colors.screen : colors.card,
        borderWidth: isAction ? 0 : 1,
        borderColor: colors.border,
        borderRadius: s(14),
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {typeof value === 'string' ? (
        <Text style={{ fontSize: s(20), fontWeight: '700', color: colors.heading }}>
          {value}
        </Text>
      ) : (
        value
      )}
    </Pressable>
  )
})

type Key =
  | { kind: 'digit'; digit: number }
  | { kind: 'decimal' }
  | { kind: 'action'; action: NumpadAction }

const PinNumpad: React.FC<PinNumpadProps> = ({
  onKeyPress,
  showDecimalKey = false,
  onDecimalPress
}) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  // One stable handler per key, so a digit press re-renders only the PIN
  // display — not these twelve keys and their icons.
  const rows = useMemo(() => {
    const keys: Key[] = [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => ({ kind: 'digit' as const, digit })),
      showDecimalKey ? { kind: 'decimal' } : { kind: 'action', action: 'clear' },
      { kind: 'digit', digit: 0 },
      { kind: 'action', action: 'backspace' }
    ]
    const buttons = keys.map((key, index) => {
      if (key.kind === 'digit') {
        return (
          <PinButton
            key={index}
            value={String(key.digit)}
            label={String(key.digit)}
            onPress={() => onKeyPress(key.digit)}
          />
        )
      }
      if (key.kind === 'decimal') {
        return (
          <PinButton
            key={index}
            value='.'
            label='Decimal point'
            onPress={() => onDecimalPress?.()}
          />
        )
      }
      return (
        <PinButton
          key={index}
          value={
            key.action === 'clear' ? (
              <X color={colors.muted} size={s(18)} />
            ) : (
              <Delete color={colors.label} size={s(18)} />
            )
          }
          label={key.action === 'clear' ? 'Clear' : 'Delete'}
          isAction
          onPress={() => onKeyPress(key.action)}
        />
      )
    })
    return [0, 3, 6, 9].map(start => buttons.slice(start, start + 3))
    // `s` is derived from uiScale; listing uiScale keeps the memo honest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onKeyPress, showDecimalKey, onDecimalPress, uiScale])

  return (
    <View style={{ gap: s(10), alignSelf: 'center' }}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: 'row', gap: s(10) }}>
          {row}
        </View>
      ))}
    </View>
  )
}

export default React.memo(PinNumpad)
