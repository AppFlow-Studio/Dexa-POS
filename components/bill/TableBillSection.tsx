import { colors } from '@/lib/theme'
import { OrderProfile } from '@/lib/types'
import { useOrderStore } from '@/stores/useOrderStore'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import { Send, X } from 'lucide-react-native'
import React, { useRef } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import BottomActionBar from './BottomActionBar'
import CourseAccordion from './CourseAccordion'
import DiscountBottomSheet from './DiscountBottomSheet'
import PricingBreakdownSheet from './PricingBreakdownSheet'
import SeatAccordion from './SeatAccordion'
import SeatCourseAccordion from './SeatCourseAccordion'

const TableBillSection = ({
  showOrderDetails = true,
  itemCourseMap,
  sentCourses,
  currentCourse,
  onSelectCourse,
  onPressStartNewCourse,
  onDoubleTapCourse,
  activeOrder: passedActiveOrder,
  onOpenServerSheet,
  onPressMore,
  onPressTotal,
  onPressReopenCheck,
  onPressCloseCheck,
  onPressClearTable,
  totalDisplayAmount,
  pricingSheetRef,
  onClosePricingSheet,
  onPressProceedToPayment,
  setCurrentCourse,
  isFullyPaid,
  // Seating props
  itemSeatMap,
  activeSeat,
  seatCount,
  onSelectSeat,
  enablePerSeatOrdering = false,
  enableCoursing = true,
  // Course action props
  onRushCourse,
  onPrioritizeCourse,
  onResendCourse,
  onPressSendAllToKitchen
}: {
  showOrderDetails?: boolean
  itemCourseMap?: Record<string, number>
  sentCourses?: Record<number, boolean>
  currentCourse?: number
  onSelectCourse?: (course: number | null) => void
  onPressStartNewCourse: () => void
  onDoubleTapCourse: (courseId: number) => void
  activeOrder?: OrderProfile
  onOpenServerSheet?: () => void
  onPressMore: () => void
  onPressTotal: () => void
  onPressReopenCheck: () => void
  onPressCloseCheck: () => void
  onPressClearTable: () => void
  totalDisplayAmount: number
  pricingSheetRef: React.RefObject<BottomSheetMethods>
  onClosePricingSheet: () => void
  onPressProceedToPayment: () => void
  setCurrentCourse: (course: number) => void
  isFullyPaid?: boolean
  // Seating props
  itemSeatMap?: Record<string, number | null>
  activeSeat?: number | null
  seatCount?: number
  onSelectSeat?: (seat: number | null) => void
  enablePerSeatOrdering?: boolean
  enableCoursing?: boolean
  // Course action props
  onRushCourse?: (courseId: number) => void
  onPrioritizeCourse?: (courseId: number) => void
  onResendCourse?: (courseId: number) => void
  onPressSendAllToKitchen?: () => void
}) => {
  const removeCheckDiscount = useOrderStore(state => state.removeCheckDiscount)
  const discountSheetRef = useRef<BottomSheetMethods>(null)

  const activeOrder = passedActiveOrder

  // Derived check discount
  const appliedDiscount = activeOrder?.checkDiscount

  // Handler to remove discount
  const handleRemoveDiscount = () => {
    if (activeOrder?.id) {
      removeCheckDiscount(activeOrder.id)
    }
  }

  // Determine which accordion to render
  const renderAccordion = () => {
    if (enablePerSeatOrdering && enableCoursing) {
      // Both enabled: seat -> course nesting
      return (
        <SeatCourseAccordion
          activeOrder={activeOrder}
          itemSeatMap={itemSeatMap}
          itemCourseMap={itemCourseMap}
          sentCourses={sentCourses}
          currentCourse={currentCourse}
          activeSeat={activeSeat}
          seatCount={seatCount ?? 2}
          onSelectSeat={onSelectSeat}
          onSelectCourse={onSelectCourse}
          onPressStartNewCourse={onPressStartNewCourse}
          onDoubleTapCourse={onDoubleTapCourse}
          onRushCourse={onRushCourse}
          onPrioritizeCourse={onPrioritizeCourse}
          onResendCourse={onResendCourse}
          enableCoursing={enableCoursing}
        />
      )
    }

    if (enablePerSeatOrdering) {
      // Seat only
      return (
        <SeatAccordion
          activeOrder={activeOrder}
          itemSeatMap={itemSeatMap}
          activeSeat={activeSeat}
          seatCount={seatCount ?? 2}
          onSelectSeat={onSelectSeat}
        />
      )
    }

    // Course only or neither (existing behavior)
    return (
      <CourseAccordion
        activeOrder={activeOrder}
        itemCourseMap={itemCourseMap}
        sentCourses={sentCourses}
        currentCourse={currentCourse}
        onSelectCourse={onSelectCourse}
        onPressStartNewCourse={onPressStartNewCourse}
        onDoubleTapCourse={onDoubleTapCourse}
        onOpenServerSheet={onOpenServerSheet}
        onRushCourse={onRushCourse}
        onPrioritizeCourse={onPrioritizeCourse}
        onResendCourse={onResendCourse}
        enableCoursing={enableCoursing}
      />
    )
  }

  return (
    <>
      <View className='max-w-lg  flex-1 flex-col'>
        {renderAccordion()}

        {/* --- INLINED ACTIVE DISCOUNT INDICATOR --- */}
        {appliedDiscount && (
          <View className='px-4 pb-2'>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 10,
                paddingVertical: 6,
                height: 36,
                backgroundColor: colors.info + '15',
                borderWidth: 1,
                borderColor: colors.info + '40',
                borderRadius: 8,
                gap: 8
              }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: '600', color: colors.info }}
              >
                {appliedDiscount.label}
              </Text>
              <TouchableOpacity
                onPress={handleRemoveDiscount}
                style={{ padding: 4 }}
              >
                <X color={colors.info} size={14} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {onPressSendAllToKitchen && activeOrder?.items?.some(i => !i.kitchen_status || i.kitchen_status === 'new') && (
          <View style={{ paddingHorizontal: 10, paddingBottom: 6 }}>
            <TouchableOpacity
              onPress={onPressSendAllToKitchen}
              activeOpacity={0.8}
              style={{
                height: 34,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.teal + '55',
                backgroundColor: colors.teal + '14',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <Send size={13} color={colors.teal} />
              <Text
                style={{ fontSize: 12, fontWeight: '700', color: colors.teal }}
              >
                Send All to Kitchen
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <BottomActionBar
          activeOrder={activeOrder}
          onPressMore={onPressMore}
          onPressTotal={onPressTotal}
          onPressReopenCheck={onPressReopenCheck}
          onPressCloseCheck={onPressCloseCheck}
          onPressClearTable={onPressClearTable}
          totalDisplayAmount={totalDisplayAmount}
          onPressDiscount={() => discountSheetRef.current?.expand()}
          isFullyPaid={isFullyPaid}
          paymentCount={activeOrder?.payments?.length ?? 0}
        />

        <PricingBreakdownSheet
          ref={pricingSheetRef}
          onClose={onClosePricingSheet}
          onPressProceedToPayment={onPressProceedToPayment}
          totalDisplayAmount={totalDisplayAmount}
          hasPayments={(activeOrder?.payments?.length ?? 0) > 0}
        />
        <DiscountBottomSheet
          ref={discountSheetRef}
          onClose={() => discountSheetRef.current?.close()}
        />
      </View>
    </>
  )
}

export default React.memo(TableBillSection, (prev, next) => {
  // Only re-render when structurally meaningful props change
  // kitchen_status changes on items are handled by CourseAccordion/BillItem directly
  if (prev.totalDisplayAmount !== next.totalDisplayAmount) return false
  if (prev.isFullyPaid !== next.isFullyPaid) return false
  if (prev.currentCourse !== next.currentCourse) return false
  if (prev.enableCoursing !== next.enableCoursing) return false
  if (prev.enablePerSeatOrdering !== next.enablePerSeatOrdering) return false
  if (prev.activeSeat !== next.activeSeat) return false
  if (prev.seatCount !== next.seatCount) return false
  if (prev.activeOrder?.id !== next.activeOrder?.id) return false
  if (prev.activeOrder?.paid_status !== next.activeOrder?.paid_status) return false
  if (prev.activeOrder?.check_status !== next.activeOrder?.check_status) return false
  if (prev.activeOrder?.checkDiscount !== next.activeOrder?.checkDiscount) return false
  if ((prev.activeOrder?.items?.length ?? 0) !== (next.activeOrder?.items?.length ?? 0)) return false
  const prevHasUnsent = prev.activeOrder?.items?.some(i => !i.kitchen_status || i.kitchen_status === 'new') ?? false
  const nextHasUnsent = next.activeOrder?.items?.some(i => !i.kitchen_status || i.kitchen_status === 'new') ?? false
  if (prevHasUnsent !== nextHasUnsent) return false
  if ((prev.activeOrder?.payments?.length ?? 0) !== (next.activeOrder?.payments?.length ?? 0)) return false
  if (prev.sentCourses !== next.sentCourses) return false
  if (prev.itemCourseMap !== next.itemCourseMap) return false
  if (prev.itemSeatMap !== next.itemSeatMap) return false
  // Callbacks — these should be stable useCallbacks from parent
  if (prev.onPressMore !== next.onPressMore) return false
  if (prev.onPressTotal !== next.onPressTotal) return false
  if (prev.onPressClearTable !== next.onPressClearTable) return false
  if (prev.onPressCloseCheck !== next.onPressCloseCheck) return false
  if (prev.onPressReopenCheck !== next.onPressReopenCheck) return false
  if (prev.onDoubleTapCourse !== next.onDoubleTapCourse) return false
  if (prev.onOpenServerSheet !== next.onOpenServerSheet) return false
  if (prev.onPressSendAllToKitchen !== next.onPressSendAllToKitchen) return false
  return true
})
