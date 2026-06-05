import NotificationBottomSheet from '@/components/notifications/NotificationBottomSheet'
import HistoryTab from '@/components/profile/HistoryTab'
import ProfileInfoTab from '@/components/profile/ProfileInfoTab'
import SecurityTab from '@/components/profile/SecurityTab'
import UserProfileCard from '@/components/timeclock/UserProfileCard'
import { colors } from '@/lib/theme'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useNotificationSheetStore } from '@/stores/useNotificationSheetStore'
import { useTimeclockStore } from '@/stores/useTimeclockStore'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import { Link } from 'expo-router'
import { ArrowLeft, Calendar, Menu } from 'lucide-react-native'
import React, { useEffect, useRef, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

type TabName = 'Profile Info' | 'Security' | 'History'
const TABS: TabName[] = ['Profile Info', 'Security', 'History']

interface MyProfilePanelProps {
  onClose: () => void
}

export default function MyProfilePanel ({ onClose }: MyProfilePanelProps) {
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
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 16,
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
              <ArrowLeft color={colors.teal} size={18} />
            </TouchableOpacity>
            <Text
              style={{
                fontSize: 18,
                fontWeight: 'bold',
                color: colors.heading
              }}
            >
              My Profile
            </Text>
          </View>

          <View className='flex-row items-center gap-2'>
            <Link href='/pto' asChild>
              <TouchableOpacity
                className='flex-row items-center gap-2 px-3 py-1.5 rounded-xl'
                style={{
                  backgroundColor: colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <Calendar size={14} color={colors.teal} />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: colors.heading
                  }}
                >
                  PTO
                </Text>
              </TouchableOpacity>
            </Link>
            <Link href='/requests' asChild>
              <TouchableOpacity
                className='flex-row items-center gap-2 px-3 py-1.5 rounded-xl'
                style={{
                  backgroundColor: colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <Menu size={14} color={colors.teal} />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: colors.heading
                  }}
                >
                  Requests
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>

        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            gap: 16,
            alignItems: 'stretch'
          }}
        >
          {currentEmployee?.id && (
            <View style={{ width: 360, flexShrink: 0 }}>
              <UserProfileCard employeeId={currentEmployee.id} />
            </View>
          )}

          <View
            style={{
              flex: 1,
              minWidth: 0,
              backgroundColor: colors.panel,
              borderRadius: 16,
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
                paddingHorizontal: 8,
                paddingTop: 8
              }}
            >
              {TABS.map(t => {
                const isActive = activeTab === t
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setActiveTab(t)}
                    className='px-4 pb-2 mr-1'
                    style={{
                      borderBottomWidth: 2,
                      borderBottomColor: isActive ? colors.teal : 'transparent'
                    }}
                  >
                    <Text
                      className='text-sm font-semibold'
                      style={{ color: isActive ? colors.teal : colors.label }}
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
    </View>
  )
}
