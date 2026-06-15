import AppUpdateModal from '@/components/AppUpdateModal'
import { colors } from '@/lib/theme'
import { checkForNativeUpdate, VersionManifest } from '@/services/appUpdater'
import {
  getDeadLetterCount,
  getPendingCount
} from '@/services/offlineSyncService'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import Constants from 'expo-constants'
import { usePathname, useRouter } from 'expo-router'
import * as Updates from 'expo-updates'
import {
  BadgeDollarSign,
  Banknote,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clover,
  CreditCard,
  DollarSign,
  FlaskConical,
  Globe,
  LayoutGrid,
  List,
  Monitor,
  Percent,
  Printer,
  Receipt,
  Settings,
  Shield,
  Smartphone,
  Truck,
  Users
} from 'lucide-react-native'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

interface SidebarItem {
  id: string
  label: string
  icon: React.ElementType
  route: string
  exact?: boolean
}

interface SidebarSection {
  id: string
  title: string
  items: SidebarItem[]
}

const SETTINGS_SECTIONS: SidebarSection[] = [
  {
    id: 'operations',
    title: 'Operations & Hardware',
    items: [
      {
        id: 'devices-connections',
        label: 'Devices & Connections',
        icon: Smartphone,
        route: '/settings/devices-connections'
      },
      {
        id: 'printers',
        label: 'Printers',
        icon: Printer,
        route: '/settings/printers'
      },
      {
        id: 'receipt-templates',
        label: 'Receipt Templates',
        icon: Receipt,
        route: '/settings/receipt-templates'
      },
      // {
      //   id: 'payment-systems',
      //   label: 'Payment & Pricing',
      //   icon: Banknote,
      //   route: '/settings/payment-systems'
      // },
      {
        id: 'cash-management',
        label: 'Cash Management',
        icon: DollarSign,
        route: '/settings/cash-management'
      },
      {
        id: 'fraud-detection',
        label: 'Fraud Detection',
        icon: Shield,
        route: '/settings/fraud-detection'
      },
      {
        id: 'dining-room',
        label: 'Dining Room',
        icon: LayoutGrid,
        route: '/settings/dining-room'
      },
      {
        id: 'stations',
        label: 'Stations',
        icon: Smartphone,
        route: '/settings/stations',
        exact: true
      },
      {
        id: 'stations-devices',
        label: 'Customer Display',
        icon: Monitor,
        route: '/settings/stations-devices'
      },
      {
        id: 'order-line',
        label: 'Order Line',
        icon: List,
        route: '/settings/order-line'
      },
      {
        id: 'notifications',
        label: 'Notifications',
        icon: Bell,
        route: '/settings/notifications'
      }
    ]
  },
  {
    id: 'business',
    title: 'Business Management',
    items: [
      {
        id: 'general',
        label: 'General Settings',
        icon: Settings,
        route: '/settings/general'
      },
      {
        id: 'payment-processing',
        label: 'Payment Processing',
        icon: CreditCard,
        route: '/settings/payment-processing'
      },
      {
        id: 'tip-settings',
        label: 'Tip Settings',
        icon: Percent,
        route: '/settings/tip-settings'
      },
      {
        id: 'end-of-day',
        label: 'End of Day',
        icon: Clover,
        route: '/settings/end-of-day'
      },
      {
        id: 'batchout',
        label: 'Batchout',
        icon: BadgeDollarSign,
        route: '/settings/batchout'
      }
    ]
  },
  {
    id: 'customer',
    title: 'Customer Experience',
    items: [
      {
        id: 'online-ordering',
        label: 'Online Ordering',
        icon: Globe,
        route: '/settings/online-ordering'
      },
      {
        id: 'delivery',
        label: 'Delivery Management',
        icon: Truck,
        route: '/settings/delivery'
      }
    ]
  },
  {
    id: 'staff',
    title: 'Staff Management',
    items: [
      {
        id: 'staff-pins',
        label: 'Staff PINs',
        icon: Users,
        route: '/settings/staff-pins'
      },
      {
        id: 'staff-timeclock',
        label: 'Staff Timeclock',
        icon: Clock,
        route: '/settings/staff-timeclock'
      }
    ]
  },
  // Developer section — only visible in __DEV__ builds. The screen itself
  // also redirects away in production as a defense-in-depth.
  ...(__DEV__
    ? [{
        id: 'developer',
        title: 'Developer',
        items: [
          {
            id: 'dev-flags',
            label: 'Bad-WiFi Phase 2 Flags',
            icon: FlaskConical,
            route: '/settings/dev-flags'
          }
        ]
      }]
    : [])
]

const itemMatches = (item: SidebarItem, pathname: string) =>
  item.exact ? pathname === item.route : pathname.startsWith(item.route)

const SidebarNavigation = () => {
  const router = useRouter()
  const pathname = usePathname()

  // KDS stations open Settings via a PIN-gated push from the headerless KDS
  // screen. For them the back control must be a single "exit to KDS", not a
  // step back through the settings sub-pages they navigated. router.navigate
  // reuses the existing KDS screen in the nav state (pops settings off).
  const isKDSStation = useStoreSettingsStore(
    s => s.selectedStation?.station_type === 'kds'
  )
  const handleExitSettings = () => {
    if (isKDSStation) router.navigate('/kds')
    else if (router.canGoBack()) router.back()
    else router.replace('/')
  }

  // Track dead-letter + pending queue counts for badge on General Settings
  const [deadLetterCount, setDeadLetterCount] = useState(0)
  const [pendingQueueCount, setPendingQueueCount] = useState(0)
  useEffect(() => {
    const check = () => {
      setDeadLetterCount(getDeadLetterCount())
      setPendingQueueCount(getPendingCount())
    }
    check()
    const interval = setInterval(check, 10_000)
    return () => clearInterval(interval)
  }, [])

  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >(() => {
    const activeSection = SETTINGS_SECTIONS.find(section =>
      section.items.some(item => itemMatches(item, pathname))
    )
    return activeSection ? { [activeSection.id]: true } : {}
  })

  useEffect(() => {
    const activeSection = SETTINGS_SECTIONS.find(section =>
      section.items.some(item => itemMatches(item, pathname))
    )
    if (activeSection && !expandedSections[activeSection.id]) {
      setExpandedSections(prev => ({ ...prev, [activeSection.id]: true }))
    }
  }, [pathname])

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }))
  }

  // Update check (OTA + native APK)
  type UpdateStatus =
    | 'idle'
    | 'checking'
    | 'downloading'
    | 'ready'
    | 'up-to-date'
    | 'error'
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle')
  const [nativeManifest, setNativeManifest] = useState<VersionManifest | null>(
    null
  )

  const applyOtaUpdate = async () => {
    setUpdateStatus('downloading')
    try {
      await Updates.fetchUpdateAsync()
      setUpdateStatus('ready')
      setTimeout(() => {
        Updates.reloadAsync()
      }, 1500)
    } catch {
      setUpdateStatus('error')
      setTimeout(() => setUpdateStatus('idle'), 3000)
    }
  }

  const handleCheckForUpdate = async () => {
    if (updateStatus === 'checking' || updateStatus === 'downloading') return

    setUpdateStatus('checking')
    try {
      // 1. Check native APK update first (Android only)
      if (Platform.OS === 'android') {
        const manifest = await checkForNativeUpdate()
        if (manifest) {
          setUpdateStatus('idle')
          setNativeManifest(manifest) // opens AppUpdateModal with skip/install + progress
          return
        }
      }

      // 2. Check Expo OTA update
      if (!__DEV__) {
        const result = await Updates.checkForUpdateAsync()
        if (result.isAvailable) {
          setUpdateStatus('idle')
          Alert.alert(
            'Update Available',
            'A new update is ready to download. The app will restart after installing.',
            [
              { text: 'Later', style: 'cancel' },
              { text: 'Update Now', onPress: () => applyOtaUpdate() }
            ]
          )
          return
        }
      }

      // 3. No updates found
      setUpdateStatus('up-to-date')
      setTimeout(() => setUpdateStatus('idle'), 3000)
    } catch {
      setUpdateStatus('error')
      setTimeout(() => setUpdateStatus('idle'), 3000)
    }
  }

  return (
    <View
      style={{
        width: 220,
        height: '100%',
        backgroundColor: colors.panel,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        flexDirection: 'column',
        paddingTop: 12
      }}
    >
      {/* Header — back/exit. The KDS runs without a route header, so this is the
          only way back to the kitchen display (and a convenience for POS too). */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          paddingBottom: 12,
          marginBottom: 4,
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        <TouchableOpacity
          onPress={handleExitSettings}
          accessibilityLabel={isKDSStation ? 'Back to KDS' : 'Back'}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card
          }}
        >
          <ChevronLeft size={18} color={colors.label} />
        </TouchableOpacity>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.label }}>
          {isKDSStation ? 'Back to KDS' : 'Settings'}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 10, paddingBottom: 16 }}>
          {SETTINGS_SECTIONS.map(section => {
            const isExpanded = expandedSections[section.id]
            const hasActiveChild = section.items.some(item =>
              pathname.startsWith(item.route)
            )

            return (
              <View key={section.id} style={{ marginBottom: 4 }}>
                {/* Section header */}
                <TouchableOpacity
                  onPress={() => toggleSection(section.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 8,
                    backgroundColor: hasActiveChild
                      ? colors.teal + '08'
                      : 'transparent'
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '600',
                      color: hasActiveChild ? colors.teal : colors.muted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.8
                    }}
                  >
                    {section.title}
                  </Text>
                  {isExpanded ? (
                    <ChevronDown
                      size={13}
                      color={hasActiveChild ? colors.teal : colors.muted}
                    />
                  ) : (
                    <ChevronRight
                      size={13}
                      color={hasActiveChild ? colors.teal : colors.muted}
                    />
                  )}
                </TouchableOpacity>

                {/* Items */}
                {isExpanded && (
                  <View style={{ marginTop: 2 }}>
                    {section.items.map(item => {
                      const isActive = itemMatches(item, pathname)
                      const Icon = item.icon

                      return (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => router.push(item.route as any)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            borderRadius: 8,
                            marginBottom: 1,
                            backgroundColor: isActive
                              ? colors.teal + '15'
                              : 'transparent'
                          }}
                        >
                          {/* Active left bar */}
                          {isActive && (
                            <View
                              style={{
                                position: 'absolute',
                                left: 0,
                                top: 6,
                                bottom: 6,
                                width: 2,
                                backgroundColor: colors.teal,
                                borderRadius: 2
                              }}
                            />
                          )}

                          <View
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 7,
                              backgroundColor: isActive
                                ? colors.teal + '20'
                                : colors.card,
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginRight: 9
                            }}
                          >
                            <Icon
                              size={14}
                              color={isActive ? colors.teal : colors.label}
                              strokeWidth={isActive ? 2.5 : 2}
                            />
                          </View>

                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: isActive ? '600' : '400',
                              color: isActive ? colors.teal : colors.label,
                              flex: 1
                            }}
                          >
                            {item.label}
                          </Text>

                          {/* Sync badge on General Settings: red for dead-letter, amber for pending queue */}
                          {item.id === 'general' &&
                            deadLetterCount + pendingQueueCount > 0 && (
                              <View
                                style={{
                                  backgroundColor:
                                    deadLetterCount > 0
                                      ? colors.danger
                                      : colors.warning,
                                  borderRadius: 8,
                                  minWidth: 16,
                                  height: 16,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  paddingHorizontal: 4
                                }}
                              >
                                <Text
                                  style={{
                                    color: colors.onSolid,
                                    fontSize: 9,
                                    fontWeight: '700'
                                  }}
                                >
                                  {deadLetterCount + pendingQueueCount}
                                </Text>
                              </View>
                            )}
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                )}
              </View>
            )
          })}
        </View>
      </ScrollView>

      {/* Footer — tap to check for updates */}
      <View
        style={{
          padding: 12,
          borderTopWidth: 1,
          borderTopColor: colors.border
        }}
      >
        <TouchableOpacity
          onPress={handleCheckForUpdate}
          disabled={
            updateStatus === 'checking' ||
            updateStatus === 'downloading' ||
            updateStatus === 'ready'
          }
          activeOpacity={0.7}
          style={{
            backgroundColor: colors.card,
            borderRadius: 8,
            padding: 10,
            borderWidth: 1,
            borderColor:
              updateStatus === 'ready' || updateStatus === 'up-to-date'
                ? colors.success + '60'
                : updateStatus === 'error'
                ? colors.danger + '60'
                : colors.border
          }}
        >
          <Text
            style={{ fontSize: 11, color: colors.muted, textAlign: 'center' }}
          >
            Version {Constants.expoConfig?.version ?? '—'}
          </Text>

          {updateStatus === 'idle' ? (
            <Text
              style={{
                fontSize: 10,
                color: colors.muted,
                textAlign: 'center',
                marginTop: 2,
                opacity: 0.7
              }}
            >
              Tap to check for updates
            </Text>
          ) : updateStatus === 'checking' ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 3,
                gap: 4
              }}
            >
              <ActivityIndicator size='small' color={colors.teal} />
              <Text style={{ fontSize: 10, color: colors.teal }}>
                Checking…
              </Text>
            </View>
          ) : updateStatus === 'downloading' ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 3,
                gap: 4
              }}
            >
              <ActivityIndicator size='small' color={colors.teal} />
              <Text style={{ fontSize: 10, color: colors.teal }}>
                Downloading update…
              </Text>
            </View>
          ) : updateStatus === 'ready' ? (
            <Text
              style={{
                fontSize: 10,
                color: colors.success,
                textAlign: 'center',
                marginTop: 2,
                fontWeight: '600'
              }}
            >
              Restarting…
            </Text>
          ) : updateStatus === 'up-to-date' ? (
            <Text
              style={{
                fontSize: 10,
                color: colors.success,
                textAlign: 'center',
                marginTop: 2
              }}
            >
              Up to date
            </Text>
          ) : updateStatus === 'error' ? (
            <Text
              style={{
                fontSize: 10,
                color: colors.danger,
                textAlign: 'center',
                marginTop: 2
              }}
            >
              Check failed — tap to retry
            </Text>
          ) : null}

          {!__DEV__ && Updates.updateId ? (
            <Text
              style={{
                fontSize: 8,
                color: colors.muted,
                textAlign: 'center',
                marginTop: 3,
                opacity: 0.5,
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
              }}
            >
              {Updates.updateId.slice(0, 8)}
            </Text>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* Native APK Update Modal */}
      {nativeManifest && (
        <AppUpdateModal
          visible
          manifest={nativeManifest}
          onSkip={() => setNativeManifest(null)}
          onInstallComplete={() => setNativeManifest(null)}
        />
      )}
    </View>
  )
}

export default SidebarNavigation
