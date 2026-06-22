import * as SwitchPrimitives from '@rn-primitives/switch'
import * as React from 'react'
import { Platform } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { colors } from '~/lib/theme'
import { useUiScale } from '~/lib/uiScale'
import { cn } from '~/lib/utils'

// Dexa design system — matches the availability toggle in ItemForm
// On:  teal tinted track (colors.teal + ~15% opacity), teal thumb
// Off: dark track (colors.card), muted thumb

function SwitchWeb ({
  className,
  ...props
}: SwitchPrimitives.RootProps & {
  ref?: React.RefObject<SwitchPrimitives.RootRef>
}) {
  // Calculate colors dynamically so they update with theme changes
  const TEAL_TRACK = `${colors.teal}26` // teal + ~15% opacity (38/255)
  const TEAL_THUMB = colors.teal // solid teal
  const TEAL_BORDER = `${colors.teal}66` // teal + ~40% opacity (102/255)
  const OFF_TRACK = colors.card // colors.card
  const OFF_THUMB = colors.muted // colors.muted
  const OFF_BORDER = colors.border // use theme border color

  return (
    <SwitchPrimitives.Root
      className={cn(
        'peer flex-row h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed',
        props.disabled && 'opacity-50',
        className
      )}
      style={{
        backgroundColor: props.checked ? TEAL_TRACK : OFF_TRACK,
        borderColor: props.checked ? TEAL_BORDER : OFF_BORDER
      }}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full shadow-md ring-0 transition-transform',
          props.checked ? 'translate-x-5' : 'translate-x-0'
        )}
        style={{ backgroundColor: props.checked ? TEAL_THUMB : OFF_THUMB }}
      />
    </SwitchPrimitives.Root>
  )
}

// Root is a plain Pressable; wrap it so it can consume Reanimated animated
// styles (animated background/border on the track).
const AnimatedRoot = Animated.createAnimatedComponent(SwitchPrimitives.Root)

function SwitchNative ({
  className,
  ...props
}: SwitchPrimitives.RootProps & {
  ref?: React.RefObject<SwitchPrimitives.RootRef>
}) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  // Calculate colors dynamically so they update with theme changes
  const TEAL_TRACK = `${colors.teal}26` // teal + ~15% opacity (38/255)
  const TEAL_THUMB = colors.teal // solid teal
  const TEAL_BORDER = `${colors.teal}66` // teal + ~40% opacity (102/255)
  const OFF_TRACK = colors.card // colors.card
  const OFF_THUMB = colors.muted // colors.muted
  const OFF_BORDER = colors.border // use theme border color

  // Drive a shared `progress` (0 → off, 1 → on) from the `checked` prop.
  // useDerivedValue worklets only recompute when a *shared value* they read
  // changes — `props.checked` is a plain prop, so it never updated. An effect
  // animating the shared value is the correct bridge from React state.
  const progress = useSharedValue(props.checked ? 1 : 0)

  React.useEffect(() => {
    progress.value = withTiming(props.checked ? 1 : 0, { duration: 180 })
  }, [props.checked, progress])

  const thumbShift = s(16)

  const animatedTrackStyle = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(
        progress.value,
        [0, 1],
        [OFF_TRACK, TEAL_TRACK]
      ),
      borderColor: interpolateColor(
        progress.value,
        [0, 1],
        [OFF_BORDER, TEAL_BORDER]
      )
    }),
    [OFF_TRACK, TEAL_TRACK, OFF_BORDER, TEAL_BORDER]
  )

  const animatedThumbStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateX: progress.value * thumbShift }],
      backgroundColor: interpolateColor(
        progress.value,
        [0, 1],
        [OFF_THUMB, TEAL_THUMB]
      )
    }),
    [OFF_THUMB, TEAL_THUMB, thumbShift]
  )

  return (
    <AnimatedRoot
      style={[
        animatedTrackStyle,
        {
          width: s(42),
          height: s(24),
          borderRadius: s(12),
          borderWidth: 1,
          flexDirection: 'row',
          alignItems: 'center'
        },
        props.disabled ? { opacity: 0.5 } : undefined
      ]}
      className={cn(className)}
      {...props}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          animatedThumbStyle,
          {
            marginLeft: s(3),
            width: s(18),
            height: s(18),
            borderRadius: s(9),
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: s(2),
            shadowOffset: { width: 0, height: s(1) },
            elevation: 2
          }
        ]}
      >
        <SwitchPrimitives.Thumb
          style={{ width: s(18), height: s(18), borderRadius: s(9) }}
        />
      </Animated.View>
    </AnimatedRoot>
  )
}

const Switch = Platform.select({
  web: SwitchWeb,
  default: SwitchNative
})

export { Switch }
