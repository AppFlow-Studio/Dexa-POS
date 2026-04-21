import { useToast } from '@/contexts/ToastContext'
import { colors } from '@/lib/theme'
import { PTORequest } from '@/lib/types'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { usePtoStore } from '@/stores/usePtoStore'
import { useScheduleStore } from '@/stores/useScheduleStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import {
  addDays,
  differenceInDays,
  format,
  isBefore,
  startOfDay
} from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react-native'
import React, { useMemo, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  View as RNView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import { Calendar, DateData } from 'react-native-calendars'
import Popover from 'react-native-popover-view'

interface PTORequestFormProps {
  onClose: () => void
  onAddRequest: (
    request: Omit<PTORequest, 'id' | 'submittedAt' | 'status'>
  ) => void
}

const PTORequestForm: React.FC<PTORequestFormProps> = ({
  onClose,
  onAddRequest
}) => {
  const loggedInEmployee = useEmployeeStore(state => state.loggedInEmployee)
  const { checkPtoConflict } = useScheduleStore()
  const { balances } = usePtoStore()
  const { show } = useToast()
  const minimumPtoNoticeDays = useStoreSettingsStore(
    s => s.minimumPtoNoticeDays
  )

  const [startDate, setStartDate] = useState<Date | null>(null)
  const [endDate, setEndDate] = useState<Date | null>(null)
  const [hoursPerDay, setHoursPerDay] = useState('8') // Default to 8
  const [note, setNote] = useState('')
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false)
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false)
  const startDateRef = useRef<RNView>(null)
  const endDateRef = useRef<RNView>(null)

  const today = useMemo(() => startOfDay(new Date()), [])
  const todayFormatted = useMemo(() => format(today, 'yyyy-MM-dd'), [today])
  const maxRequestDate = useMemo(
    () => addDays(today, minimumPtoNoticeDays),
    [today, minimumPtoNoticeDays]
  )
  const maxRequestDateFormatted = useMemo(
    () => format(maxRequestDate, 'yyyy-MM-dd'),
    [maxRequestDate]
  )

  const totalAccruedBalance = useMemo(() => {
    if (!loggedInEmployee) return 0
    return balances[loggedInEmployee.id]?.totalAccrued || 0
  }, [balances, loggedInEmployee])

  const handleSubmit = () => {
    if (!loggedInEmployee) {
      show({
        title: 'Authentication Error',
        message: 'Could not identify the logged-in employee.',
        type: 'error'
      })
      return
    }

    const parsedHoursPerDay = parseFloat(hoursPerDay)
    if (isNaN(parsedHoursPerDay) || parsedHoursPerDay <= 0) {
      show({
        title: 'Invalid Hours',
        message: 'Please enter a valid, positive number of hours per day.',
        type: 'error'
      })
      return
    }

    if (!startDate || !endDate) {
      show({
        title: 'Missing Dates',
        message: 'Please select both a start and an end date.',
        type: 'error'
      })
      return
    }

    if (isBefore(endDate, startDate)) {
      show({
        title: 'Invalid End Date',
        message: 'The end date cannot be earlier than the start date.',
        type: 'error'
      })
      return
    }

    const numberOfDays = differenceInDays(endDate, startDate) + 1
    const totalRequestedHours = parsedHoursPerDay * numberOfDays

    if (totalRequestedHours > totalAccruedBalance) {
      show({
        title: 'Insufficient Balance',
        message: `Your request for ${totalRequestedHours.toFixed(
          2
        )}h exceeds your available balance of ${totalAccruedBalance.toFixed(
          2
        )}h.`,
        type: 'error'
      })
      return
    }

    const isConflict = checkPtoConflict(
      loggedInEmployee.id,
      startDate.toISOString(),
      endDate.toISOString()
    )

    if (isConflict) {
      show({
        title: 'Scheduling Conflict',
        message: 'This request overlaps with another PTO request.',
        type: 'error'
      })
      return
    }

    onAddRequest({
      employeeId: loggedInEmployee.id,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      hours: totalRequestedHours,
      note
    })
    show({
      title: 'Request Submitted',
      message: 'Your PTO request has been submitted for approval.',
      type: 'success'
    })
    onClose()
  }

  const onDayPress = (day: DateData, type: 'start' | 'end') => {
    const selectedDate = new Date(day.timestamp)
    if (type === 'start') {
      setStartDate(selectedDate)
      setIsStartDatePickerOpen(false)
    } else {
      setEndDate(selectedDate)
      setIsEndDatePickerOpen(false)
    }
  }

  const calendarTheme = {
    calendarBackground: colors.panel,
    monthTextColor: '#FFFFFF',
    dayTextColor: '#FFFFFF',
    textDisabledColor: colors.muted,
    selectedDayBackgroundColor: colors.teal,
    selectedDayTextColor: '#0C0F1A',
    todayTextColor: colors.teal,
    arrowColor: colors.teal,
    textSectionTitleColor: colors.label
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <View
        style={{
          padding: 16,
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 16,
          marginBottom: 16
        }}
      >
        <View className='flex-row items-center justify-between mb-4'>
          <Text
            style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}
          >
            New PTO Request
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <Text style={{ fontSize: 12, color: colors.label }}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <View className='gap-y-4'>
          <View className='flex-row gap-4'>
            <View className='flex-1'>
              <Text
                style={{
                  fontSize: 11,
                  color: colors.label,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 4
                }}
              >
                Start Date
              </Text>
              <TouchableOpacity
                ref={startDateRef}
                onPress={() => setIsStartDatePickerOpen(true)}
                style={{
                  padding: 10,
                  height: 42,
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: startDate ? colors.heading : colors.muted
                  }}
                >
                  {startDate ? format(startDate, 'MMM d, yyyy') : 'Select Date'}
                </Text>
                <CalendarIcon size={16} color={colors.label} />
              </TouchableOpacity>
              <Popover
                from={startDateRef as unknown as React.RefObject<RNView>}
                isVisible={isStartDatePickerOpen}
                onRequestClose={() => setIsStartDatePickerOpen(false)}
              >
                <View
                  style={{
                    width: 384,
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: colors.border,
                    zIndex: 50,
                    borderRadius: 8
                  }}
                >
                  <Calendar
                    onDayPress={day => onDayPress(day, 'start')}
                    theme={calendarTheme}
                    minDate={todayFormatted}
                    maxDate={maxRequestDateFormatted}
                    markedDates={{
                      [startDate ? format(startDate, 'yyyy-MM-dd') : '']: {
                        selected: true,
                        selectedColor: colors.teal
                      }
                    }}
                  />
                </View>
              </Popover>
            </View>

            <View className='flex-1'>
              <Text
                style={{
                  fontSize: 11,
                  color: colors.label,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 4
                }}
              >
                End Date
              </Text>
              <TouchableOpacity
                ref={endDateRef}
                onPress={() => setIsEndDatePickerOpen(true)}
                style={{
                  padding: 10,
                  height: 42,
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: endDate ? colors.heading : colors.muted
                  }}
                >
                  {endDate ? format(endDate, 'MMM d, yyyy') : 'Select Date'}
                </Text>
                <CalendarIcon size={16} color={colors.label} />
              </TouchableOpacity>
              <Popover
                from={endDateRef as unknown as React.RefObject<RNView>}
                isVisible={isEndDatePickerOpen}
                onRequestClose={() => setIsEndDatePickerOpen(false)}
              >
                <View
                  style={{
                    width: 384,
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: colors.border,
                    zIndex: 50,
                    borderRadius: 8
                  }}
                >
                  <Calendar
                    onDayPress={day => onDayPress(day, 'end')}
                    theme={calendarTheme}
                    minDate={todayFormatted}
                    maxDate={maxRequestDateFormatted}
                    markedDates={{
                      [endDate ? format(endDate, 'yyyy-MM-dd') : '']: {
                        selected: true,
                        selectedColor: colors.teal
                      }
                    }}
                  />
                </View>
              </Popover>
            </View>
          </View>
          <View>
            <Text
              style={{
                fontSize: 11,
                color: colors.label,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 4
              }}
            >
              Hours per Day
            </Text>
            <TextInput
              value={hoursPerDay}
              onChangeText={text => {
                if (/^\d*\.?\d*$/.test(text)) {
                  setHoursPerDay(text)
                }
              }}
              placeholder='e.g., 8'
              keyboardType='numeric'
              placeholderTextColor={colors.muted}
              style={{
                padding: 10,
                backgroundColor: colors.screen,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                color: colors.heading,
                fontSize: 13
              }}
            />
          </View>
          <View>
            <Text
              style={{
                fontSize: 11,
                color: colors.label,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 4
              }}
            >
              Note (Optional)
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder='Add any additional details...'
              multiline
              placeholderTextColor={colors.muted}
              style={{
                padding: 10,
                backgroundColor: colors.screen,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                color: colors.heading,
                fontSize: 13,
                minHeight: 72
              }}
            />
          </View>
          <TouchableOpacity
            onPress={handleSubmit}
            style={{
              paddingVertical: 10,
              borderRadius: 8,
              alignItems: 'center',
              backgroundColor: colors.teal + '20',
              borderWidth: 1,
              borderColor: colors.teal + '50'
            }}
          >
            <Text
              style={{ fontWeight: '600', fontSize: 13, color: colors.teal }}
            >
              Submit Request
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

export default PTORequestForm
