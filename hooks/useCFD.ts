// src/hooks/useCFD.ts - Enhanced version

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { CFDController } from '@/services/cfd/CFDController'
import { useOrderStore } from '@/stores/useOrderStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import type { CFDCartItem, CFDPairingData, CFDTipResponse } from '@/types/cfd.types'

export type CFDServerStatus = 
  | 'initializing'    // Setting up, not ready yet
  | 'ready'           // Server running, waiting for connections
  | 'connected'       // At least one CFD connected
  | 'error'           // Failed to start
  | 'disabled'        // No station/location selected

export function useCFD() {
  const controllerRef = useRef<CFDController | null>(null)
  
  // Status states
  const [serverStatus, setServerStatus] = useState<CFDServerStatus>('disabled')
  const [isConnected, setIsConnected] = useState(false)
  const [clientCount, setClientCount] = useState(0)
  const [pairingData, setPairingData] = useState<CFDPairingData | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  // Store settings
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation)
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore)

  // Order store selectors
  const ordersById = useOrderStore((s) => s.ordersById)
  const activeOrderId = useOrderStore((s) => s.activeOrderId)
  const activeOrderSubtotal = useOrderStore((s) => s.activeOrderSubtotal)
  const activeOrderTax = useOrderStore((s) => s.activeOrderTax)
  const activeOrderTotal = useOrderStore((s) => s.activeOrderTotal)
  const activeOrderDiscount = useOrderStore((s) => s.activeOrderDiscount)
  const activeOrderOutstandingTotal = useOrderStore((s) => s.activeOrderOutstandingTotal)

  // Get active order
  const activeOrder = useMemo(() => {
    if (!activeOrderId) return null
    return ordersById[activeOrderId] ?? null
  }, [activeOrderId, ordersById])

  // Transform cart items to CFD format
  const cfdItems: CFDCartItem[] = useMemo(() => {
    if (!activeOrder?.items) return []

    return activeOrder.items
      .filter((item) => !item.is_voided && item.quantity > 0)
      .map((item) => ({
        id: item.id,
        name: item.is_open_item ? (item.open_item_name ?? 'Open Item') : item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.subtotal,
        modifiers: [
          ...(item.customizations?.size
            ? [{ name: item.customizations.size.name, price: item.customizations.size.priceModifier ?? 0 }]
            : []),
          ...(item.customizations?.addOns?.map((a) => ({ name: a.name, price: a.price })) ?? []),
          ...(item.customizations?.modifiers?.flatMap((m) =>
            m.options.map((o) => ({ name: o.name, price: o.price }))
          ) ?? []),
        ],
        notes: item.customizations?.notes,
      }))
  }, [activeOrder?.items])

  // Initialize CFD controller
  useEffect(() => {
    // Check prerequisites
    if (!selectedStation?.id || !selectedStore?.id) {
      setServerStatus('disabled')
      setPairingData(null)
      return
    }

    setServerStatus('initializing')
    setServerError(null)

    const controller = new CFDController({
      stationId: selectedStation.id,
      stationName: selectedStation.station_name,
      locationId: selectedStore.id,
      branding: {
        restaurantName: selectedStore.name,
        locationCode: selectedStore.code,
        logoUrl: null,
        primaryColor: '#10b981',
      },
      port: 8080,
    })

    controllerRef.current = controller

    controller
      .start({
        onCFDConnected: (clientId) => {
          console.log('[useCFD] CFD connected:', clientId)
          setIsConnected(true)
          setClientCount(controller.clientCount)
          setServerStatus('connected')
        },
        onCFDDisconnected: (clientId) => {
          console.log('[useCFD] CFD disconnected:', clientId)
          const count = controller.clientCount
          setClientCount(count)
          setIsConnected(count > 0)
          setServerStatus(count > 0 ? 'connected' : 'ready')
        },
        onTipSelected: (response: CFDTipResponse) => {
          console.log('[useCFD] Tip selected:', response)
          // TODO: Update order with tip
        },
      })
      .then((info) => {
        console.log('[useCFD] Server started:', info)
        setPairingData(controller.getPairingData())
        setServerStatus('ready')
      })
      .catch((error) => {
        console.error('[useCFD] Server failed to start:', error)
        setServerStatus('error')
        setServerError(error.message)
      })

    return () => {
      controller.stop()
      controllerRef.current = null
      setServerStatus('disabled')
      setPairingData(null)
      setIsConnected(false)
      setClientCount(0)
    }
  }, [selectedStation?.id, selectedStore?.id, selectedStore?.name, selectedStation?.station_name])

  // Auto-sync order to CFD
  useEffect(() => {
    if (!controllerRef.current || !isConnected) return

    controllerRef.current.updateOrder({
      orderNumber: activeOrder?.display_number ?? activeOrder?.order_number ?? null,
      orderType: activeOrder?.order_type ?? null,
      guestCount: activeOrder?.guest_count ?? null,
      items: cfdItems,
      subtotal: activeOrderSubtotal,
      discountAmount: activeOrderDiscount,
      taxAmount: activeOrderTax,
      tipAmount: 0,
      total: activeOrderTotal,
      outstandingTotal: activeOrderOutstandingTotal,
      amountPaid: activeOrder?.amount_paid ?? 0,
    })
  }, [
    isConnected,
    activeOrder,
    cfdItems,
    activeOrderSubtotal,
    activeOrderDiscount,
    activeOrderTax,
    activeOrderTotal,
    activeOrderOutstandingTotal,
  ])

  // ==================== EXPOSED METHODS ====================

  const showTipSelection = useCallback((presetPercentages?: number[]) => {
    controllerRef.current?.showTipSelection(activeOrderSubtotal, presetPercentages)
  }, [activeOrderSubtotal])

  const showPayment = useCallback(() => {
    controllerRef.current?.showPayment()
  }, [])

  const showProcessing = useCallback(() => {
    controllerRef.current?.showProcessing()
  }, [])

  const showApproved = useCallback(() => {
    controllerRef.current?.showApproved()
  }, [])

  const showDeclined = useCallback(() => {
    controllerRef.current?.showDeclined()
  }, [])

  const showIdle = useCallback(() => {
    controllerRef.current?.showIdle()
  }, [])

  return {
    // ===== STATUS =====
    serverStatus,           // 'initializing' | 'ready' | 'connected' | 'error' | 'disabled'
    isServerReady: serverStatus === 'ready' || serverStatus === 'connected',
    isConnected,            // true if CFD(s) connected
    clientCount,            // number of connected CFDs
    serverError,            // error message if failed
    
    // ===== PAIRING =====
    pairingData,            // { ip, port, stationId, ... } or null
    serverInfo: controllerRef.current?.getServerInfo() ?? null,

    // ===== ACTIONS =====
    showTipSelection,
    showPayment,
    showProcessing,
    showApproved,
    showDeclined,
    showIdle,
  }
}