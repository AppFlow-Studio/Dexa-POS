import { mmkvStorage } from '@/lib/storage'
import { toastService } from '@/lib/toastService'
import { TaxRate, TaxRatesMap } from '@/types/menu'
import { SelectedStation } from '@/types/station'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

// Selected location from Supabase
export interface SelectedLocation {
  id: string
  merchant_id: string
  name: string
  code: string | null
  phone: string | null
  email: string | null
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  postal_code: string
  country: string
  timezone: string
  is_active: boolean
  is_accepting_orders: boolean
  pricing_strategy?: string | null
  dual_pricing_percentage?: number | null
  business_hours: Record<
    string,
    { open: string; close: string; is_closed: boolean }
  >
  created_at: string
  updated_at: string
}

export interface StoreSettings {
  // Tax Settings (synced from backend)
  storeTaxId: string
  deviceId: string
  taxRates: TaxRate[] // Array of tax rates from backend
  taxRatesMap: TaxRatesMap // Quick lookup: { "standard": 8.875, "alcohol": 12.0 }
  ptoAccrualRate: number
  minimumPtoNoticeDays: number
  targetLaborPercent: number

  // Scheduling
  scheduling: {
    autoDetectConflicts: boolean
    conflictTypes: {
      doubleBooked: boolean
      overtime: boolean
      minStaffing: boolean
      backToBack: boolean
      // Add other conflict types here as needed
    }
  }

  // Employee Settings
  isBreakAndSwitchEnabled: boolean
  breakDurationMinutes: number // Break duration in minutes

  // Online Ordering Settings
  onlineOrderingEnabled: boolean
  onlinePauseReason: string | null
  autoResumeTime: string | null // ISO date

  // Order Acceptance
  autoAcceptOrders: boolean
  largeOrderApprovalThreshold: number
  rejectWhenBusyThreshold: number // 0 = disabled

  // Dynamic Prep Times
  dynamicPrepTimeEnabled: boolean
  basePrepTime: number // minutes
  prepTimeAdjustments: {
    kitchenLoad: boolean // +10m if >25 orders
    peakHours: boolean // +5m 5-8PM
    weather: boolean // +15m if bad weather (simulated)
  }

  // Pre-Ordering
  preOrderingEnabled: boolean
  preOrderMaxDays: number
  preOrderMinAdvanceMinutes: number
  preOrderMaxDaily: number

  // Selected store from database
  selectedStore: SelectedLocation | null

  // Organization branding
  organizationLogoUrl: string | null

  // Auto-Print Settings
  autoPrintKitchenTickets: boolean
  autoPrintReceipt: boolean

  // KDS Settings
  kdsAutoFireEnabled: boolean
  kdsAutoFireDelayMinutes: number // Minutes before auto-firing pending items
  kdsHideDoneItems: boolean // Hide individually-done items in KDS tickets
  kdsDisplayModifierGroupName: 'for_group_priced' | 'always' | 'never'
  kdsItemNameLines: number // 0 = unlimited, 1, 2, 3
  kdsDisplaySeatNumbers: boolean
  kdsDisplayGuestCount: boolean
  kdsAlphabeticalSort: boolean
  kdsHighlightNotes: boolean
  kdsDisplayExclusionsAtTop: boolean
  kdsAggregateIdenticalItems: boolean
  kdsAggregateToExistingTickets: boolean
  kdsYellowThresholdMinutes: number
  kdsOrangeThresholdMinutes: number
  kdsRedThresholdMinutes: number

  // Waitlist Settings
  waitlistNotificationGracePeriodMinutes: number // Auto-expire notified parties after this many minutes

  // Station session management
  selectedStation: SelectedStation | null
  stationSessionId: string | null
  deviceName: string
}

interface StoreSettingsState extends StoreSettings {
  isDirty: boolean
  changedFields: Set<string>
  initialState: StoreSettings // To compare for changes
  updateField: <K extends keyof StoreSettings>(
    field: K,
    value: StoreSettings[K]
  ) => void
  setIsBreakAndSwitchEnabled: (isEnabled: boolean) => void
  setPtoAccrualRate: (rate: number) => void // New action
  setTargetLaborPercent: (percent: number) => void
  // Generic update for nested objects like prepTimeAdjustments
  updatePrepAdjustment: (
    key: keyof StoreSettings['prepTimeAdjustments'],
    value: boolean
  ) => void
  updateSchedulingSettings: (
    updates: Partial<StoreSettings['scheduling']>
  ) => void
  saveChanges: () => void
  discardChanges: () => void

  // Selected store actions
  setSelectedStore: (store: SelectedLocation) => void
  clearSelectedStore: () => void

  // Organization branding
  setOrganizationLogoUrl: (url: string | null) => void

  // Tax rates actions
  setTaxRates: (rates: TaxRate[]) => void

  // Break duration action
  setBreakDurationMinutes: (minutes: number) => void

  // Station session actions
  setSelectedStation: (station: SelectedStation) => void
  clearSelectedStation: () => void
  setStationSessionId: (sessionId: string | null) => void
  setDeviceName: (name: string) => void
  clearStationSession: () => void
}

const initialData: StoreSettings = {
  // Tax Settings (synced from backend)
  storeTaxId: 'US123456789',
  deviceId: '',
  taxRates: [],
  taxRatesMap: {},
  ptoAccrualRate: 0.0375,
  minimumPtoNoticeDays: 7,
  targetLaborPercent: 25,

  // Scheduling Defaults
  scheduling: {
    autoDetectConflicts: true,
    conflictTypes: {
      doubleBooked: true,
      overtime: true,
      minStaffing: true,
      backToBack: true
    }
  },

  isBreakAndSwitchEnabled: true, // Enabled by default
  breakDurationMinutes: 30, // Default 30 minute breaks

  // Online Ordering Defaults
  onlineOrderingEnabled: true,
  onlinePauseReason: null,
  autoResumeTime: null,
  autoAcceptOrders: false,
  largeOrderApprovalThreshold: 200,
  rejectWhenBusyThreshold: 35,
  dynamicPrepTimeEnabled: true,
  basePrepTime: 25,
  prepTimeAdjustments: {
    kitchenLoad: true,
    peakHours: true,
    weather: false
  },
  preOrderingEnabled: true,
  preOrderMaxDays: 30,
  preOrderMinAdvanceMinutes: 120, // 2 hours
  preOrderMaxDaily: 25,

  // Auto-Print Settings
  autoPrintKitchenTickets: true, // ON by default (most restaurants want this)
  autoPrintReceipt: false, // OFF by default (many use digital receipts)

  // KDS Settings
  kdsAutoFireEnabled: false,
  kdsAutoFireDelayMinutes: 5,
  kdsHideDoneItems: false,
  kdsDisplayModifierGroupName: 'for_group_priced',
  kdsItemNameLines: 0,
  kdsDisplaySeatNumbers: false,
  kdsDisplayGuestCount: true,
  kdsAlphabeticalSort: false,
  kdsHighlightNotes: true,
  kdsDisplayExclusionsAtTop: false,
  kdsAggregateIdenticalItems: false,
  kdsAggregateToExistingTickets: false,
  kdsYellowThresholdMinutes: 5,
  kdsOrangeThresholdMinutes: 10,
  kdsRedThresholdMinutes: 15,

  // Waitlist Settings
  waitlistNotificationGracePeriodMinutes: 10,

  // Waitlist Settings
  waitlistNotificationGracePeriodMinutes: 10,

  // No store selected initially
  selectedStore: null,

  // Organization branding
  organizationLogoUrl: null,

  // Station session defaults
  selectedStation: null,
  stationSessionId: null,
  deviceName: ''
}

export const useStoreSettingsStore = create<StoreSettingsState>()(
  persist(
    (set, get) => ({
      ...initialData,
      initialState: { ...initialData },
      isDirty: false,
      changedFields: new Set<string>(),

      updateField: (field, value) => {
        set(state => {
          const changedFields = new Set(state.changedFields)
          if (
            state.initialState &&
            JSON.stringify(state.initialState[field]) === JSON.stringify(value)
          ) {
            changedFields.delete(field as string)
          } else {
            changedFields.add(field as string)
          }
          return {
            ...state,
            [field]: value,
            changedFields,
            isDirty: changedFields.size > 0
          }
        })
      },

      setIsBreakAndSwitchEnabled: (isEnabled: boolean) => {
        set(state => {
          const changedFields = new Set(state.changedFields)
          if (state.initialState?.isBreakAndSwitchEnabled === isEnabled) {
            changedFields.delete('isBreakAndSwitchEnabled')
          } else {
            changedFields.add('isBreakAndSwitchEnabled')
          }
          return {
            ...state,
            isBreakAndSwitchEnabled: isEnabled,
            changedFields,
            isDirty: changedFields.size > 0
          }
        })
      },

      setPtoAccrualRate: (rate: number) => {
        set(state => {
          const changedFields = new Set(state.changedFields)
          if (state.initialState?.ptoAccrualRate === rate) {
            changedFields.delete('ptoAccrualRate')
          } else {
            changedFields.add('ptoAccrualRate')
          }
          return {
            ...state,
            ptoAccrualRate: rate,
            changedFields,
            isDirty: changedFields.size > 0
          }
        })
      },

      setTargetLaborPercent: (percent: number) => {
        set(state => {
          const changedFields = new Set(state.changedFields)
          if (state.initialState?.targetLaborPercent === percent) {
            changedFields.delete('targetLaborPercent')
          } else {
            changedFields.add('targetLaborPercent')
          }
          return {
            ...state,
            targetLaborPercent: percent,
            changedFields,
            isDirty: changedFields.size > 0
          }
        })
      },

      setBreakDurationMinutes: (minutes: number) => {
        set(state => {
          const changedFields = new Set(state.changedFields)
          if (state.initialState?.breakDurationMinutes === minutes) {
            changedFields.delete('breakDurationMinutes')
          } else {
            changedFields.add('breakDurationMinutes')
          }
          return {
            ...state,
            breakDurationMinutes: minutes,
            changedFields,
            isDirty: changedFields.size > 0
          }
        })
      },

      updatePrepAdjustment: (key, value) => {
        set(state => {
          const newAdjustments = { ...state.prepTimeAdjustments, [key]: value }
          const changedFields = new Set(state.changedFields)
          const fieldKey = `prepTimeAdjustments.${key}`
          if (state.initialState?.prepTimeAdjustments[key] === value) {
            changedFields.delete(fieldKey)
          } else {
            changedFields.add(fieldKey)
          }
          return {
            ...state,
            prepTimeAdjustments: newAdjustments,
            changedFields,
            isDirty: changedFields.size > 0
          }
        })
      },

      updateSchedulingSettings: (
        updates: Partial<StoreSettings['scheduling']>
      ) => {
        set(state => {
          const newScheduling = { ...state.scheduling, ...updates }
          // Deep merge for nested conflictTypes if provided
          if (updates.conflictTypes) {
            newScheduling.conflictTypes = {
              ...state.scheduling.conflictTypes,
              ...updates.conflictTypes
            }
          }

          const changedFields = new Set(state.changedFields)
          if (
            JSON.stringify(state.initialState?.scheduling) ===
            JSON.stringify(newScheduling)
          ) {
            changedFields.delete('scheduling')
          } else {
            changedFields.add('scheduling')
          }

          return {
            ...state,
            scheduling: newScheduling,
            changedFields,
            isDirty: changedFields.size > 0
          }
        })
      },

      saveChanges: () => {
        const currentState = get()
        const updatedState = { ...currentState }
        delete (updatedState as any).initialState
        delete (updatedState as any).isDirty

        const newInitialState = { ...updatedState }

        set({
          initialState: newInitialState,
          isDirty: false,
          changedFields: new Set<string>()
        })

        toastService.show({
          title: 'Settings Saved',
          message: 'Store information has been updated successfully.',
          type: 'success'
        })
      },

      discardChanges: () => {
        const { initialState } = get()
        set({
          ...initialState,
          isDirty: false,
          changedFields: new Set<string>()
        })
      },

      // Selected store actions
      setSelectedStore: (store: SelectedLocation) => {
        set({ selectedStore: store })
      },

      clearSelectedStore: () => {
        set({ selectedStore: null, organizationLogoUrl: null })
      },

      setOrganizationLogoUrl: (url: string | null) => {
        set({ organizationLogoUrl: url })
      },

      // Tax rates action
      setTaxRates: (rates: TaxRate[]) => {
        // Build a map for quick lookup: { "standard": 8.875, "alcohol": 12.0 }
        const taxRatesMap: TaxRatesMap = {}
        for (const rate of rates) {
          taxRatesMap[rate.tax_category] = rate.percentage
        }
        set({ taxRates: rates, taxRatesMap })
      },

      // Station session actions
      setSelectedStation: (station: SelectedStation) => {
        set({ selectedStation: station })
      },

      clearSelectedStation: () => {
        set({ selectedStation: null, stationSessionId: null })
      },

      setStationSessionId: (sessionId: string | null) => {
        set({ stationSessionId: sessionId })
      },

      setDeviceName: (name: string) => {
        set({ deviceName: name })
      },

      clearStationSession: () => {
        set({ selectedStation: null, stationSessionId: null })
      }
    }),
    {
      name: 'store-settings-storage',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: state => ({
        // Only persist these fields
        selectedStore: state.selectedStore,
        storeTaxId: state.storeTaxId,
        taxRates: state.taxRates,
        taxRatesMap: state.taxRatesMap,
        ptoAccrualRate: state.ptoAccrualRate,
        minimumPtoNoticeDays: state.minimumPtoNoticeDays,
        targetLaborPercent: state.targetLaborPercent,
        scheduling: state.scheduling,
        isBreakAndSwitchEnabled: state.isBreakAndSwitchEnabled,
        onlineOrderingEnabled: state.onlineOrderingEnabled,
        onlinePauseReason: state.onlinePauseReason,
        autoResumeTime: state.autoResumeTime,
        autoAcceptOrders: state.autoAcceptOrders,
        largeOrderApprovalThreshold: state.largeOrderApprovalThreshold,
        rejectWhenBusyThreshold: state.rejectWhenBusyThreshold,
        dynamicPrepTimeEnabled: state.dynamicPrepTimeEnabled,
        basePrepTime: state.basePrepTime,
        prepTimeAdjustments: state.prepTimeAdjustments,
        preOrderingEnabled: state.preOrderingEnabled,
        preOrderMaxDays: state.preOrderMaxDays,
        preOrderMinAdvanceMinutes: state.preOrderMinAdvanceMinutes,
        preOrderMaxDaily: state.preOrderMaxDaily,
        // Auto-Print Settings
        autoPrintKitchenTickets: state.autoPrintKitchenTickets,
        autoPrintReceipt: state.autoPrintReceipt,
        // KDS Settings
        kdsAutoFireEnabled: state.kdsAutoFireEnabled,
        kdsAutoFireDelayMinutes: state.kdsAutoFireDelayMinutes,
        kdsHideDoneItems: state.kdsHideDoneItems,
        kdsDisplayModifierGroupName: state.kdsDisplayModifierGroupName,
        kdsItemNameLines: state.kdsItemNameLines,
        kdsDisplaySeatNumbers: state.kdsDisplaySeatNumbers,
        kdsDisplayGuestCount: state.kdsDisplayGuestCount,
        kdsAlphabeticalSort: state.kdsAlphabeticalSort,
        kdsHighlightNotes: state.kdsHighlightNotes,
        kdsDisplayExclusionsAtTop: state.kdsDisplayExclusionsAtTop,
        kdsAggregateIdenticalItems: state.kdsAggregateIdenticalItems,
        kdsAggregateToExistingTickets: state.kdsAggregateToExistingTickets,
        kdsYellowThresholdMinutes: state.kdsYellowThresholdMinutes,
        kdsOrangeThresholdMinutes: state.kdsOrangeThresholdMinutes,
        kdsRedThresholdMinutes: state.kdsRedThresholdMinutes,
        // Organization branding
        organizationLogoUrl: state.organizationLogoUrl,
        // Station session fields
        selectedStation: state.selectedStation,
        stationSessionId: state.stationSessionId,
        deviceName: state.deviceName
      })
    }
  )
)
