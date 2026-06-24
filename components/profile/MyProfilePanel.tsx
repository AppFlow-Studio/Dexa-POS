import NotificationBottomSheet from '@/components/notifications/NotificationBottomSheet'
import HistoryTab from '@/components/profile/HistoryTab'
import ProfileInfoTab from '@/components/profile/ProfileInfoTab'
import PTOPage from '@/app/(main)/pto'
import RequestsPage from '@/app/(main)/requests'
import SecurityTab from '@/components/profile/SecurityTab'
import UserProfileCard from '@/components/timeclock/UserProfileCard'
import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useNotificationSheetStore } from '@/stores/useNotificationSheetStore'
import { useTimeclockStore } from '@/stores/useTimeclockStore'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import { ArrowLeft, Calendar, Menu } from 'lucide-react-native'
import React, { useEffect, useRef, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import Animated, { SlideInRight, SlideOutRight } from 'react-native-reanimated'

type TabName = 'Profile Info' | 'Security' | 'History'
const TABS: TabName[] = ['Profile Info', 'Security', 'History']

interface MyProfilePanelProps {
  onClose: () => void
}

export default function MyProfilePanel ({ onClose }: MyProfilePanelProps) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const activeEmployeeId = useEmployeeStore(state => state.activeEmployeeId)
  const employees = useEmployeeStore(state => state.employees)
  const sessions = useTimeclockStore(state => state.sessions)
  const timeclockActiveId = useTimeclockStore(state => state.activeEmployeeId)

  const currentEmployee = React.useMemo(() => {
    if (activeEmployeeId) {
      return employees.find(e => e.id === activeEmployeeId)
    }
    if (timeclockActiveId) {
      return employees.find(e => e.id === timeclockActiveId)
    }
    const sessionEmployeeIds = Object.values(sessions).map(s => s.employeeId)
    for (const id of sessionEmployeeIds) {
      const emp = employees.find(e => e.id === id)
      if (emp) return emp
    }
    return employees.find(e => e.shiftStatus === 'clocked_in')
  }, [activeEmployeeId, timeclockActiveId, employees, sessions])

  const [activeTab, setActiveTab] = useState<TabName>('Profile Info')
  const notificationSheetRef = useRef<BottomSheetMethods | null>(null)
  const setSheetRef = useNotificationSheetStore(state => state.setSheetRef)

  // PTO / Requests render as an in-panel overlay rather than a separate route,
  // so the profile Modal stays open and there's no jarring close→navigate jump.
  const [overlay, setOverlay] = useState<'pto' | 'requests' | null>(null)

  useEffect(() => {
    setSheetRef(notificationSheetRef as React.RefObject<BottomSheetMethods>)
  }, [setSheetRef])

  const renderContent = () => {
    switch (activeTab) {
      case 'Profile Info':
        return <ProfileInfoTab />
      case 'Security':
        return <SecurityTab />
      case 'History':
        return <HistoryTab />
      default:
        return <ProfileInfoTab />
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: s(20),
          paddingTop: s(12),
          paddingBottom: s(16),
          backgroundColor: colors.screen
        }}
      >
        <View className='flex-row items-center justify-between mb-4'>
          <View className='flex-row items-center gap-3'>
            <TouchableOpacity
              onPress={onClose}
              className='p-1.5 rounded-lg'
              style={{ backgroundColor: `${colors.teal}18` }}
            >
              <ArrowLeft color={colors.teal} size={s(18)} />
            </TouchableOpacity>
            <Text
              style={{
                fontSize: s(18),
                fontWeight: 'bold',
                color: colors.heading
              }}
            >
              My Profile
            </Text>
          </View>

          <View className='flex-row items-center gap-2'>
            <TouchableOpacity
              onPress={() => setOverlay('pto')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(8),
                paddingHorizontal: s(12),
                paddingVertical: s(6),
                borderRadius: s(12),
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <Calendar size={s(14)} color={colors.teal} />
              <Text
                style={{
                  fontSize: s(14),
                  fontWeight: '600',
                  color: colors.heading
                }}
              >
                PTO
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setOverlay('requests')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(8),
                paddingHorizontal: s(12),
                paddingVertical: s(6),
                borderRadius: s(12),
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <Menu size={s(14)} color={colors.teal} />
              <Text
                style={{
                  fontSize: s(14),
                  fontWeight: '600',
                  color: colors.heading
                }}
              >
                Requests
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            gap: s(16),
            alignItems: 'stretch'
          }}
        >
          {currentEmployee?.id && (
            <View style={{ width: s(360), flexShrink: 0 }}>
              <UserProfileCard employeeId={currentEmployee.id} />
            </View>
          )}

          <View
            style={{
              flex: 1,
              minWidth: 0,
              backgroundColor: colors.panel,
              borderRadius: s(16),
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden'
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                paddingHorizontal: s(8),
                paddingTop: s(8)
              }}
            >
              {TABS.map(t => {
                const isActive = activeTab === t
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setActiveTab(t)}
                    style={{
                      paddingHorizontal: s(16),
                      paddingBottom: s(8),
                      marginRight: s(4),
                      borderBottomWidth: 2,
                      borderBottomColor: isActive ? colors.teal : 'transparent'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(13),
                        fontWeight: '600',
                        color: isActive ? colors.teal : colors.label
                      }}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <View style={{ flex: 1 }}>{renderContent()}</View>
          </View>
        </View>
      </View>
      <NotificationBottomSheet
        bottomSheetRef={
          notificationSheetRef as React.RefObject<BottomSheetMethods>
        }
        onClose={() => {
          /* sheet is already closed when onClose fires */
        }}
      />

      {overlay && (
        <Animated.View
          entering={iosOnly(SlideInRight.duration(220))}
          exiting={iosOnly(SlideOutRight.duration(180))}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.screen
          }}
        >
          <View
            className='flex-row items-center gap-3'
            style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}
          >
            <TouchableOpacity
              onPress={() => setOverlay(null)}
              className='p-1.5 rounded-lg'
              style={{ backgroundColor: `${colors.teal}18` }}
            >
              <ArrowLeft color={colors.teal} size={18} />
            </TouchableOpacity>
            <Text
              style={{ fontSize: 18, fontWeight: 'bold', color: colors.heading }}
            >
              {overlay === 'pto' ? 'PTO' : 'Requests'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            {overlay === 'pto' ? <PTOPage /> : <RequestsPage />}
          </View>
        </Animated.View>
      )}
    </View>
  )
}
