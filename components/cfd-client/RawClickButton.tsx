// components/cfd-client/RawClickButton.tsx
//
// A button optimized for the CFD WebView (react-native-web inside an
// Android WebView). Renders a real HTML `<button>` element via
// `React.createElement` — bypasses Pressable / TouchableOpacity / RN's
// PressResponder entirely. The handler runs on the browser's native
// `click` event, dispatched the same frame the touch lifts (because
// `web/index.html` sets `touch-action: manipulation`, no 300ms delay).
//
// History: an earlier version of this file tried to wrap a `<View>`
// and attach `addEventListener('click')` via ref. That crashed on
// Join press. This rewrite uses React's own DOM event system —
// `onClick` on a real `<button>` — so there's no ref-cast, no
// `preventDefault`, no manual listener lifecycle. React owns the
// whole thing and it can't break.
//
// Why we still need this: tap-driven transitions (Approved → Loyalty,
// keypad keys) were perceptibly slower than host-driven transitions
// (Tips screen). Pressable / TouchableOpacity layer their own
// responder + Animated opacity over a click event; on Android WebView
// V8 each layer costs a few ms. For a 12-key keypad that adds up.

import React, { memo } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle
} from 'react-native'

interface Props {
  onPress: () => void
  style?: StyleProp<ViewStyle>
  children?: React.ReactNode
  accessibilityLabel?: string
  disabled?: boolean
}

// Reset native button styles so the React Native styles passed in via
// `style` apply cleanly — same visual result as wrapping a `<View>`
// but rendered as a `<button>` for native click semantics.
const RESET = {
  background: 'none',
  border: 'none',
  padding: 0,
  margin: 0,
  cursor: 'pointer',
  touchAction: 'manipulation',
  font: 'inherit',
  color: 'inherit',
  display: 'flex',
  appearance: 'none',
  WebkitTapHighlightColor: 'transparent',
  // Reset alignment so caller's flex styles take effect predictably.
  textAlign: 'inherit'
} as const

export const RawClickButton = memo(function RawClickButton ({
  onPress,
  style,
  children,
  accessibilityLabel,
  disabled
}: Props) {
  // Native RN context (external CFD tablet connecting via IP): Pressable works
  // correctly. The <button> DOM element only exists in web/WebView context.
  if (Platform.OS !== 'web') {
    return (
      <Pressable
        onPress={disabled ? undefined : onPress}
        style={style}
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
      >
        {children}
      </Pressable>
    )
  }

  // Web/WebView bundle path (react-native-web inside Android WebView):
  // Use a real HTML <button> for native click semantics and no 300ms delay.
  // Flatten RN-style array/object into a single object. RN-web maps
  // standard properties (flex, backgroundColor, borderRadius, etc.)
  // 1:1 to web CSS, so we can spread the result directly into the
  // button's inline style.
  const flat = StyleSheet.flatten(style) as Record<string, unknown> | undefined

  return React.createElement(
    'button' as unknown as React.ComponentType<any>,
    {
      type: 'button',
      'aria-label': accessibilityLabel,
      disabled,
      onClick: disabled ? undefined : onPress,
      style: { ...RESET, ...(flat ?? {}) }
    },
    children
  )
})
