import { useLocationRealtime } from '@/contexts/LocationRealtimeProvider'
import { images } from '@/lib/image'
import { colors } from '@/lib/theme'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Lock,
  Users,
  Utensils
} from 'lucide-react-native'
import React, { useEffect, useState } from 'react'
import {
  Image,
  LayoutAnimation,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import PinDisplay from '../auth/PinDisplay'
import PinNumpad from '../auth/PinNumpad'
import HistoryPanel from '../panels/HistoryPanel'
import SeatedPanel from '../panels/SeatedPanel'
import TablesPanel from '../panels/TablesPanel'
import WaitlistPanel from '../panels/WaitlistPanel'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'

type TabMode = 'tables' | 'waitlist' | 'seated' | 'history'

interface SidebarProps {
  activeLayoutId: string | null
  setActiveLayout: (id: string) => void
  // layouts prop removed
}

const EXPANDED_WIDTH = 280
const COLLAPSED_WIDTH = 72

const Sidebar: React.FC<SidebarProps> = ({
  activeLayoutId,
  setActiveLayout
}) => {
  const [isExpanded, setIsExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState<TabMode>('tables')
  const [tabsCollapsed, setTabsCollapsed] = useState(true)

  const [pinDialogOpen, setPinDialogOpen] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [targetTab, setTargetTab] = useState<TabMode | null>(null)

  // Shared values for animations
  const widthSV = useSharedValue(EXPANDED_WIDTH)
  const opacitySV = useSharedValue(1)

  // Get actual Realtime Channel status (not store status)
  const { floor } = useLocationRealtime()

  // Determine connection status based on actual channel state
  // "Offline" = CHANNEL_ERROR (max retries reached) or CLOSED
  // "Syncing..." = actively reconnecting (TIMED_OUT or reconnectAttempts > 0 but not error)
  const isOffline =
    !floor.isConnected &&
    (floor.status.state === 'CHANNEL_ERROR' || floor.status.state === 'CLOSED')
  const isSyncing =
    !floor.isConnected && !isOffline && floor.status.reconnectAttempts > 0

  // Background periodic retry when channel is in error state
  // This handles both: internet restored AND server restored scenarios
  useEffect(() => {
    // Only set up retry interval when we're offline (channel error)
    if (!isOffline) return

    console.log(
      '[Sidebar] Channel offline, starting periodic retry (every 30s)...'
    )

    // Initial retry after 5 seconds
    const initialRetryId = setTimeout(() => {
      console.log('[Sidebar] Initial retry attempt...')
      floor.reconnect()
    }, 5000)

    // Then periodic retry every 30 seconds
    const intervalId = setInterval(() => {
      console.log('[Sidebar] Periodic retry attempt...')
      floor.reconnect()
    }, 30000) // 30 seconds

    return () => {
      clearTimeout(initialRetryId)
      clearInterval(intervalId)
    }
  }, [isOffline, floor])

  // Manual reconnect handler (for tappable status indicator)
  const handleManualReconnect = () => {
    console.log('[Sidebar] Manual reconnect triggered')
    floor.reconnect()
    // Refetch floor plan data to recover missed events during connection drop
    useFloorPlanStore.getState().loadFloorPlanStatus()
  }

  useEffect(() => {
    const config = {
      duration: 200,
      easing: Easing.out(Easing.quad)
    }

    widthSV.value = withTiming(
      isExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
      config
    )
    opacitySV.value = withTiming(isExpanded ? 1 : 0, { duration: 150 })
  }, [isExpanded])

  const containerStyle = useAnimatedStyle(() => ({
    width: widthSV.value
  }))

  const textStyle = useAnimatedStyle(() => ({
    opacity: opacitySV.value,
    display: opacitySV.value === 0 ? 'none' : 'flex'
  }))

  const toggleSidebar = () => {
    setIsExpanded(prev => !prev)
  }

  const renderPanel = () => {
    switch (activeTab) {
      case 'tables':
        return <TablesPanel />
      case 'waitlist':
        return <WaitlistPanel />
      case 'seated':
        return <SeatedPanel />
      case 'history':
        return <HistoryPanel />
      default:
        return <TablesPanel />
    }
  }

  const navItems = [
    { id: 'tables', icon: Utensils, label: 'Tables', isLocked: false },
    { id: 'waitlist', icon: Clock, label: 'Waitlist', isLocked: false },
    { id: 'seated', icon: Users, label: 'Seated', isLocked: false }
    // { id: "history", icon: BarChart3, label: "History", isLocked: true },
  ] as const

  const handleLockedAccess = (tab: TabMode) => {
    setTargetTab(tab)
    setPinDialogOpen(true)
    setCurrentPin('')
  }

  const handlePinSubmit = () => {
    // TODO: Implement actual PIN validation logic
    // For now, we'll accept any 4-digit PIN
    if (currentPin.length === 4) {
      setPinDialogOpen(false)
      if (targetTab) {
        setActiveTab(targetTab)
      }
      setCurrentPin('')
      setTargetTab(null)
    }
  }

  return (
    <>
      <Animated.View
        style={[
          containerStyle,
          {
            height: '100%',
            zIndex: 20,
            backgroundColor: colors.panel,
            borderRightWidth: 1,
            borderRightColor: colors.border
          }
        ]}
      >
        {/* Floating Toggle Button */}
        <TouchableOpacity
          onPress={toggleSidebar}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          activeOpacity={0.7}
          style={{
            position: 'absolute',
            right: -14,
            top: 28,
            zIndex: 50,
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {isExpanded ? (
            <ChevronLeft size={14} color={colors.label} />
          ) : (
            <ChevronRight size={14} color={colors.label} />
          )}
        </TouchableOpacity>

        {/* Header */}
        <TouchableOpacity
          onPress={toggleSidebar}
          activeOpacity={0.8}
          style={{
            height: 56,
            flexDirection: 'row',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingHorizontal: 16,
            flexShrink: 0
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Image
              source={images.dexalogo}
              style={{ width: 26, height: 26 }}
              resizeMode='contain'
            />
          </View>
          {isExpanded && (
            <Animated.Text
              style={[
                textStyle,
                {
                  marginLeft: 10,
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.heading
                }
              ]}
              numberOfLines={1}
            >
              Floor Plan
            </Animated.Text>
          )}
        </TouchableOpacity>

        {/* Navigation Tabs */}
        <View
          style={{
            gap: 4,
            padding: 10,
            flexShrink: 0,
            borderBottomWidth: 1,
            borderBottomColor: colors.border
          }}
        >
          {navItems.map(item => {
            const isActive = activeTab === item.id

            if (isExpanded && tabsCollapsed && !isActive) return null

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  if (!isExpanded) {
                    setIsExpanded(true)
                    if (!item.isLocked) setActiveTab(item.id)
                    else handleLockedAccess(item.id)
                    return
                  }
                  if (tabsCollapsed && isActive) {
                    LayoutAnimation.configureNext(
                      LayoutAnimation.Presets.easeInEaseOut
                    )
                    setTabsCollapsed(false)
                    return
                  }
                  if (isActive) {
                    LayoutAnimation.configureNext(
                      LayoutAnimation.Presets.easeInEaseOut
                    )
                    setTabsCollapsed(true)
                    return
                  }
                  if (item.isLocked) {
                    handleLockedAccess(item.id)
                    LayoutAnimation.configureNext(
                      LayoutAnimation.Presets.easeInEaseOut
                    )
                    setTabsCollapsed(true)
                  } else {
                    setActiveTab(item.id)
                    LayoutAnimation.configureNext(
                      LayoutAnimation.Presets.easeInEaseOut
                    )
                    setTabsCollapsed(true)
                  }
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  height: 40,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  backgroundColor: isActive
                    ? colors.teal + '20'
                    : 'transparent',
                  borderColor: isActive ? colors.teal + '40' : 'transparent'
                }}
              >
                <View
                  style={{
                    width: 22,
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <item.icon
                    size={16}
                    color={isActive ? colors.teal : colors.label}
                  />
                </View>

                <Animated.View style={[textStyle, { marginLeft: 10, flex: 1 }]}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: isActive ? colors.teal : colors.label
                    }}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                </Animated.View>

                {isActive && isExpanded && (
                  <View style={{ marginLeft: 4 }}>
                    {tabsCollapsed ? (
                      <ChevronDown size={14} color={colors.teal} />
                    ) : (
                      <ChevronUp size={14} color={colors.teal} />
                    )}
                  </View>
                )}

                {item.isLocked && isExpanded && !isActive && (
                  <View style={{ marginLeft: 4 }}>
                    <Lock size={14} color={colors.muted} />
                  </View>
                )}

                {!isExpanded && isActive && (
                  <View
                    style={{
                      position: 'absolute',
                      right: 6,
                      top: 6,
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: colors.teal
                    }}
                  />
                )}
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Panel Content */}
        <Animated.View
          style={{
            flex: 1,
            opacity: opacitySV,
            backgroundColor: colors.screen
          }}
        >
          {isExpanded && renderPanel()}
        </Animated.View>

        {/* Live Status Indicator */}
        <TouchableOpacity
          style={{
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onPress={!floor.isConnected ? handleManualReconnect : undefined}
          activeOpacity={!floor.isConnected ? 0.7 : 1}
        >
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: floor.isConnected
                ? colors.success
                : isSyncing
                ? colors.warning
                : colors.danger
            }}
          />
          {isExpanded && (
            <Animated.Text
              style={[
                textStyle,
                { marginLeft: 7, fontSize: 11, color: colors.muted }
              ]}
            >
              {floor.isConnected
                ? 'Live'
                : isSyncing
                ? 'Syncing...'
                : 'Offline · Tap to retry'}
            </Animated.Text>
          )}
        </TouchableOpacity>
      </Animated.View>

      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent
          style={{
            backgroundColor: colors.panel,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 16,
            padding: 24,
            width: 360
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: colors.heading,
                  textAlign: 'center'
                }}
              >
                Manager Access Required
              </Text>
            </DialogTitle>
          </DialogHeader>
          <View style={{ paddingTop: 16 }}>
            <Text
              style={{
                fontSize: 13,
                color: colors.label,
                textAlign: 'center',
                marginBottom: 20
              }}
            >
              Enter your manager PIN to access this feature
            </Text>
            <PinDisplay pinLength={currentPin.length} maxLength={4} />
            <PinNumpad
              onKeyPress={input => {
                if (typeof input === 'number') {
                  if (currentPin.length < 4) {
                    const newPin = currentPin + input.toString()
                    setCurrentPin(newPin)
                    if (newPin.length === 4) {
                      setTimeout(() => {
                        handlePinSubmit()
                      }, 100)
                    }
                  }
                } else if (input === 'clear') {
                  setCurrentPin('')
                } else if (input === 'backspace') {
                  setCurrentPin(currentPin.slice(0, -1))
                }
              }}
            />
            <TouchableOpacity
              onPress={handlePinSubmit}
              style={{
                marginTop: 16,
                paddingVertical: 12,
                borderRadius: 8,
                backgroundColor: colors.teal + '20',
                borderWidth: 1,
                borderColor: colors.teal + '50',
                alignItems: 'center'
              }}
            >
              <Text
                style={{ fontSize: 14, fontWeight: '700', color: colors.teal }}
              >
                Confirm
              </Text>
            </TouchableOpacity>
          </View>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default Sidebar
