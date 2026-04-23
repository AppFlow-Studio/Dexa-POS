import { useTimeClock } from '@/hooks/useTimeclock'
import { replaceRoute } from '@/lib/rootNavigation'
import { colors } from '@/lib/theme'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTimeclockStore } from '@/stores/useTimeclockStore'
import * as Application from 'expo-application'
import { Clock, Timer } from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Image, Platform, Text, TouchableOpacity, View } from 'react-native'
import CashTipDeclarationModal from './CashTipDeclarationModal'
import PinInputModal from './PinInputModal'

// Helper function to format duration from milliseconds
const formatDuration = (milliseconds: number): string => {
  if (isNaN(milliseconds) || milliseconds < 0) return '0 h 00 m'
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(
    2,
    '0'
  )
  return `${hours} h ${minutes} m`
}

// Get device ID
const getDeviceId = async (): Promise<string> => {
  if (Platform.OS === 'android') {
    return Application.getAndroidId() || 'unknown-android'
  } else if (Platform.OS === 'ios') {
    return (await Application.getIosIdForVendorAsync()) || 'unknown-ios'
  }
  return 'unknown-device'
}

// This component is now self-sufficient and doesn't require any props.
const UserProfileCard: React.FC<{ employeeId: string | null }> = ({
  employeeId
}) => {
  // --- HOOKS ---
  // Use NEW backend hook for actions
  const timeClock = useTimeClock()
  // Use OLD store for session/status display (to match Header/SessionDock)
  const {
    getSession,
    startBreak: oldStartBreak,
    endBreak: oldEndBreak,
    clockOut: oldClockOut
  } = useTimeclockStore()
  const { employees } = useEmployeeStore()
  const selectedStore = useStoreSettingsStore(state => state.selectedStore)

  // --- LOCAL UI STATE ---
  const [currentTime, setCurrentTime] = useState(new Date())
  const [shiftDuration, setShiftDuration] = useState('0 h 00 m')
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [pinAction, setPinAction] = useState<
    'break_start' | 'break_end' | 'clock_out' | null
  >(null)
  const [deviceId, setDeviceId] = useState<string>('unknown')
  const [showCashDeclaration, setShowCashDeclaration] = useState(false)
  const pendingClockOutPinRef = useRef<string | null>(null)

  // Get device ID on mount
  useEffect(() => {
    getDeviceId().then(setDeviceId)
  }, [])

  const user = useMemo(() => {
    return employees.find(e => e.id === employeeId) || null
  }, [employeeId, employees])

  // Get session from OLD store (matches Header/SessionDock)
  const session = useMemo(() => {
    if (!employeeId) return null
    return getSession(employeeId)
  }, [employeeId, getSession])

  // Effect to manage all live timers
  useEffect(() => {
    const timerId = setInterval(() => {
      setCurrentTime(new Date())
      if (session?.clockInTime) {
        const durationMs =
          new Date().getTime() - new Date(session.clockInTime).getTime()
        setShiftDuration(formatDuration(durationMs))
      } else {
        setShiftDuration('0 h 00 m')
      }
    }, 1000)
    return () => clearInterval(timerId)
  }, [session])

  const handlePinConfirm = async (pin: string) => {
    const locationId = selectedStore?.id
    console.log('[UserProfileCard] handlePinConfirm called', {
      pinAction,
      locationId,
      deviceId,
      pin: pin.substring(0, 2) + '**'
    })

    if (!locationId) {
      console.error('[UserProfileCard] No location selected')
      setPinModalOpen(false)
      return
    }

    setPinModalOpen(false)

    if (pinAction === 'break_start') {
      console.log('[UserProfileCard] Calling timeClock.startBreak...')
      // Call backend
      await timeClock.startBreak(pin, locationId, deviceId)
      console.log('[UserProfileCard] timeClock.startBreak completed')
      // Also update old store for local UI sync
      oldStartBreak()
      replaceRoute('(auth)', 'pin-login') // Redirect for break & switch
    } else if (pinAction === 'break_end') {
      console.log('[UserProfileCard] Calling timeClock.endBreak...')
      // Call backend
      await timeClock.endBreak(pin, locationId, deviceId)
      console.log('[UserProfileCard] timeClock.endBreak completed')
      // Also update old store for local UI sync
      if (employeeId) oldEndBreak(employeeId)
      replaceRoute('(main)', 'home')
    } else if (pinAction === 'clock_out') {
      console.log(
        '[UserProfileCard] PIN confirmed for clock-out, showing cash tip declaration...'
      )
      pendingClockOutPinRef.current = pin
      setShowCashDeclaration(true)
      setPinAction(null)
      return // Don't clear pinAction below — we handle it here
    }

    setPinAction(null)
  }

  const handleStartBreak = () => {
    setPinAction('break_start')
    setPinModalOpen(true)
  }

  const handleEndBreak = () => {
    setPinAction('break_end')
    setPinModalOpen(true)
  }

  const handleClockOut = () => {
    setPinAction('clock_out')
    setPinModalOpen(true)
  }

  const handleDeclarationComplete = useCallback(
    async (declaredAmount: number) => {
      setShowCashDeclaration(false)
      const locationId = selectedStore?.id
      const pin = pendingClockOutPinRef.current
      pendingClockOutPinRef.current = null

      if (!locationId || !pin) {
        console.error(
          '[UserProfileCard] Missing locationId or pin for clock-out'
        )
        return
      }

      // Declare cash tips (non-blocking — queued if offline/fails)
      const shiftId = timeClock.shiftId
      if (shiftId || user?.profileId) {
        try {
          await timeClock.declareCashTips(
            shiftId || '',
            declaredAmount,
            locationId,
            deviceId,
            user?.profileId,
          )
        } catch (e) {
          console.warn(
            '[UserProfileCard] Cash tip declaration failed, proceeding to clock-out:',
            e
          )
        }
      }

      // Clock out — wrap in try/catch so local state always updates
      try {
        await timeClock.clockOut(pin, locationId, deviceId)
      } catch (e) {
        console.warn('[UserProfileCard] clockOut RPC failed:', e)
      }

      // Always update local store regardless of RPC result
      if (employeeId) oldClockOut(employeeId)
      replaceRoute('(auth)', 'pin-login')
    },
    [selectedStore?.id, timeClock, deviceId, employeeId, oldClockOut]
  )

  const handleDeclarationCancel = useCallback(() => {
    setShowCashDeclaration(false)
    pendingClockOutPinRef.current = null
  }, [])

  const isBreak = session?.status === 'onBreak'

  if (!user) {
    return (
      <View
        style={{
          width: '100%',
          padding: 24,
          backgroundColor: colors.panel,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Text style={{ color: colors.label }}>No active employee.</Text>
      </View>
    )
  }

  const initials = user.fullName
    .split(' ')
    .map((n: string) => n.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <>
      <View
        style={{
          width: '100%',
          backgroundColor: colors.panel,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden'
        }}
      >
        {/* Hero section */}
        <View
          style={{
            backgroundColor: colors.card,
            alignItems: 'center',
            paddingHorizontal: 32,
            paddingTop: 40,
            paddingBottom: 32
          }}
        >
          {/* Clock */}
          <Text
            style={{
              color: colors.label,
              fontSize: 11,
              fontWeight: '500',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.8
            }}
          >
            Current Time
          </Text>
          <Text
            style={{
              fontSize: 48,
              fontWeight: 'bold',
              color: colors.heading,
              marginBottom: 32
            }}
          >
            {currentTime.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </Text>

          {/* Avatar */}
          {user.profilePictureUrl ? (
            <Image
              source={{ uri: user.profilePictureUrl }}
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                marginBottom: 16
              }}
            />
          ) : (
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: colors.teal,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16
              }}
            >
              <Text
                style={{ color: '#0C0F1A', fontSize: 30, fontWeight: 'bold' }}
              >
                {initials}
              </Text>
            </View>
          )}

          <Text
            style={{
              color: colors.heading,
              fontSize: 20,
              fontWeight: 'bold',
              textAlign: 'center',
              marginBottom: 12
            }}
          >
            {user.fullName}
          </Text>

          {/* Status badge */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 6,
              borderRadius: 20,
              backgroundColor:
                session && isBreak
                  ? colors.warning + '20'
                  : session
                  ? colors.teal + '20'
                  : colors.muted + '10'
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color:
                  session && isBreak
                    ? colors.warning
                    : session
                    ? colors.teal
                    : colors.label
              }}
            >
              {session
                ? isBreak
                  ? '⏸  On Break'
                  : '●  Clocked In'
                : '○  Not Clocked In'}
            </Text>
          </View>
        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: colors.border }} />

        {/* Shift stats */}
        {session && (
          <View className='px-6 py-5 gap-y-4'>
            <View className='flex-row items-center justify-between'>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <Timer color={colors.muted} size={15} />
                <Text style={{ color: colors.label, fontSize: 14 }}>
                  Duration
                </Text>
              </View>
              <Text
                style={{ color: colors.teal, fontSize: 14, fontWeight: '600' }}
              >
                {shiftDuration}
              </Text>
            </View>
            <View className='flex-row items-center justify-between'>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <Clock color={colors.muted} size={15} />
                <Text style={{ color: colors.label, fontSize: 14 }}>
                  Clocked in at
                </Text>
              </View>
              <Text
                style={{ color: colors.teal, fontSize: 14, fontWeight: '600' }}
              >
                {new Date(session.clockInTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
            </View>
          </View>
        )}

        {/* Divider */}
        {session && (
          <View
            style={{
              height: 1,
              backgroundColor: colors.border,
              marginHorizontal: 24
            }}
          />
        )}

        {/* Actions */}
        <View className='px-6 py-5 gap-y-3'>
          {session ? (
            <>
              {isBreak ? (
                <TouchableOpacity
                  onPress={handleEndBreak}
                  className='py-3.5 rounded-xl items-center'
                  style={{
                    backgroundColor: colors.warning + '20',
                    borderWidth: 1,
                    borderColor: colors.warning + '50'
                  }}
                >
                  <Text
                    style={{ color: colors.warning }}
                    className='font-semibold text-sm'
                  >
                    End Break
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleStartBreak}
                  className='py-3.5 rounded-xl items-center'
                  style={{
                    backgroundColor: colors.teal + '20',
                    borderWidth: 1,
                    borderColor: colors.teal + '50'
                  }}
                >
                  <Text
                    style={{ color: colors.teal }}
                    className='font-semibold text-sm'
                  >
                    Start Break
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleClockOut}
                className='py-3.5 rounded-xl items-center'
                style={{
                  backgroundColor: colors.danger + '15',
                  borderWidth: 1,
                  borderColor: colors.danger + '40'
                }}
              >
                <Text
                  style={{ color: colors.danger }}
                  className='font-semibold text-sm'
                >
                  Clock Out
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <View
              style={{
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: colors.muted + '10'
              }}
            >
              <Text style={{ color: colors.label, fontSize: 14 }}>
                Clock in from Employee List
              </Text>
            </View>
          )}
        </View>
      </View>

      <PinInputModal
        isOpen={pinModalOpen}
        title={
          pinAction === 'break_start'
            ? 'Start Break'
            : pinAction === 'break_end'
            ? 'End Break'
            : 'Clock Out'
        }
        subtitle='Enter your PIN to confirm'
        onConfirm={handlePinConfirm}
        onCancel={() => {
          setPinModalOpen(false)
          setPinAction(null)
        }}
      />

      <CashTipDeclarationModal
        isOpen={showCashDeclaration}
        shiftId={timeClock.shiftId || ''}
        staffProfileId={user?.profileId || ''}
        locationId={selectedStore?.id || ''}
        employeeName={user?.fullName || ''}
        clockInTime={
          session?.clockInTime ? new Date(session.clockInTime) : new Date()
        }
        onComplete={handleDeclarationComplete}
        onCancel={handleDeclarationCancel}
      />
    </>
  )
}
export default UserProfileCard
