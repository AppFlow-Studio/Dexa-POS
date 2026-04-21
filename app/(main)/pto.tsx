import PTOHistoryCard from '@/components/profile/PTOHistoryCard'
import PTORequestForm from '@/components/profile/PTORequestForm'
import PtoMetrics from '@/components/pto/PtoMetrics'
import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useScheduleStore } from '@/stores/useScheduleStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { differenceInHours, isFuture, isToday, parse, parseISO } from 'date-fns'
import { Calendar } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'

const PTOPage = () => {
  const ptoRequests = useScheduleStore(state => state.ptoRequests)
  const addPTORequest = useScheduleStore(state => state.addPTORequest)
  const cancelPTORequest = useScheduleStore(state => state.cancelPTORequest)
  const activeEmployeeId = useEmployeeStore(state => state.activeEmployeeId)
  const loggedInEmployee = useEmployeeStore(state => state.loggedInEmployee)
  const { schedulePeriods, weeklySchedules } = useScheduleStore()
  const ptoAccrualRate = useStoreSettingsStore(s => s.ptoAccrualRate)
  const [showRequestForm, setShowRequestForm] = useState(false)

  const nextAccrualInfo = useMemo(() => {
    if (!loggedInEmployee) return 'No upcoming shifts'

    const futureShifts = [...schedulePeriods, ...weeklySchedules]
      .filter(p => p.status === 'active')
      .flatMap(s => s.shifts)
      .filter(shift => {
        if (shift.employeeId !== loggedInEmployee.id) return false
        const shiftDate = parseISO(shift.date)
        return isToday(shiftDate) || isFuture(shiftDate)
      })
      .sort((a, b) => {
        const dateA = parseISO(a.date).getTime()
        const dateB = parseISO(b.date).getTime()
        if (dateA !== dateB) {
          return dateA - dateB
        }
        return (
          parse(a.startTime, 'HH:mm', new Date()).getTime() -
          parse(b.startTime, 'HH:mm', new Date()).getTime()
        )
      })

    if (futureShifts.length === 0) {
      return 'No upcoming shifts'
    }

    const nextShift = futureShifts[0]
    const startTime = parseISO(nextShift.startTime)
    const endTime = parseISO(nextShift.endTime)
    const duration = differenceInHours(endTime, startTime)
    const ptoFromNextShift = duration * ptoAccrualRate

    return `~${ptoFromNextShift.toFixed(2)}h after next shift`
  }, [loggedInEmployee, schedulePeriods, weeklySchedules, ptoAccrualRate])

  if (!activeEmployeeId) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.screen,
          padding: 16,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Text style={{ color: colors.heading, fontSize: 18 }}>
          Please clock in to view your PTO information.
        </Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, padding: 16 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24
        }}
      >
        <View></View>
        {!showRequestForm && (
          <TouchableOpacity
            onPress={() => setShowRequestForm(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: colors.teal + '20',
              borderWidth: 1,
              borderColor: colors.teal + '50'
            }}
          >
            <Calendar color={colors.teal} size={14} />
            <Text
              style={{ color: colors.teal, fontWeight: '600', fontSize: 13 }}
            >
              Request PTO
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {showRequestForm && (
          <Animated.View entering={iosOnly(FadeIn)} exiting={iosOnly(FadeOut)}>
            <PTORequestForm
              onClose={() => setShowRequestForm(false)}
              onAddRequest={addPTORequest}
            />
          </Animated.View>
        )}
        <PtoMetrics employeeId={activeEmployeeId} />

        <View
          style={{
            padding: 14,
            backgroundColor: colors.teal + '08',
            borderWidth: 1,
            borderColor: colors.teal + '25',
            borderRadius: 14,
            marginBottom: 16
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: colors.teal,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 10
            }}
          >
            Accrual Information
          </Text>
          <View className='flex-row justify-between'>
            <View>
              <Text
                style={{ fontSize: 11, color: colors.label, marginBottom: 2 }}
              >
                Accrual Rate
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                {ptoAccrualRate}h per hour worked
              </Text>
            </View>
            <View>
              <Text
                style={{ fontSize: 11, color: colors.label, marginBottom: 2 }}
              >
                Next Accrual
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                {nextAccrualInfo}
              </Text>
            </View>
          </View>
        </View>

        <View>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: colors.label,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 10
            }}
          >
            Request History
          </Text>
          <View className='gap-y-3'>
            {ptoRequests
              .filter(req => req.employeeId === activeEmployeeId)
              .map(request => (
                <PTOHistoryCard
                  key={request.id}
                  request={request}
                  onCancelRequest={cancelPTORequest}
                />
              ))}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

export default PTOPage
