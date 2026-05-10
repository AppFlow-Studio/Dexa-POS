import {
  getOrderPaymentsQueryOptions,
  orderPaymentsQueryKey
} from '@/hooks/orders/useOrderPayments'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { OrderService } from '@/services/orderService'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useQueries } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

const closedOnlineOrdersThisSession = new Set<string>()

export default function OnlineOrderPaymentAutoCloseBridge () {
  const supabase = useSupabaseClient()
  const inflightClosuresRef = useRef(new Set<string>())

  const eligibleOrders = useOrderStore(state =>
    Object.values(state.ordersById)
      .filter(
        order =>
          !!order.db_order_id &&
          order.order_source?.toLowerCase() === 'online' &&
          order.check_status !== 'Closed'
      )
      .map(order => ({
        localOrderId: order.id,
        dbOrderId: order.db_order_id!,
        totalAmount: order.total_amount ?? 0,
        paidStatus: order.paid_status,
        checkStatus: order.check_status
      }))
  )

  const paymentQueries = useQueries({
    queries: eligibleOrders.map(order => ({
      ...getOrderPaymentsQueryOptions(supabase, order.dbOrderId),
      queryKey: orderPaymentsQueryKey(order.dbOrderId),
      enabled: !!supabase && !!order.dbOrderId
    }))
  })

  useEffect(() => {
    eligibleOrders.forEach((order, index) => {
      const query = paymentQueries[index]
      const rows = query?.data ?? []

      if (!query || !query.data) return

      const settledAmount = rows
        .filter(
          payment =>
            !payment.is_voided &&
            !payment.is_returned &&
            payment.status !== 'failed' &&
            payment.status !== 'pending' &&
            payment.status !== 'authorized' &&
            payment.status !== 'voided'
        )
        .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)

      const shouldClose =
        order.paidStatus === 'Paid' &&
        rows.length > 0 &&
        settledAmount + 0.0001 >= order.totalAmount

      if (
        !shouldClose ||
        order.checkStatus === 'Closed' ||
        closedOnlineOrdersThisSession.has(order.dbOrderId) ||
        inflightClosuresRef.current.has(order.dbOrderId)
      ) {
        return
      }

      inflightClosuresRef.current.add(order.dbOrderId)

      const staffId =
        useEmployeeStore.getState().loggedInEmployee?.profileId ?? null

      void OrderService.closeCheck(supabase, order.dbOrderId, staffId)
        .then(result => {
          const alreadyClosed =
            result.error?.toLowerCase().includes('already closed') ?? false

          if (result.success || alreadyClosed) {
            closedOnlineOrdersThisSession.add(order.dbOrderId)
            useOrderStore.getState().patchOrder(order.localOrderId, {
              check_status: 'Closed'
            })
          }
        })
        .finally(() => {
          inflightClosuresRef.current.delete(order.dbOrderId)
        })
    })
  }, [eligibleOrders, paymentQueries, supabase])

  return null
}
