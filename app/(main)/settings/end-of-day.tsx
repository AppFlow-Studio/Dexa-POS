/**
 * End-of-Day Closing Screen — Step-by-Step Wizard Orchestrator
 *
 * Renders each EOD step component sequentially with proper gating,
 * deep-link navigation, and override flow.
 */

import CashDrawerSheet from '@/components/cash-drawer/CashDrawerSheet'
import EodBulkClockOutModal from '@/components/settings/end-of-day/EodBulkClockOutModal'
import EodWizardLayout from '@/components/settings/end-of-day/EodWizardLayout'
import EodIntroScreen from '@/components/settings/end-of-day/steps/EodIntroScreen'
import EodStepCash from '@/components/settings/end-of-day/steps/EodStepCash'
import EodStepFloorOrders from '@/components/settings/end-of-day/steps/EodStepFloorOrders'
import EodStepOverview from '@/components/settings/end-of-day/steps/EodStepOverview'
import EodStepPaymentsPlaceholder from '@/components/settings/end-of-day/steps/EodStepPaymentsPlaceholder'
import EodStepReport from '@/components/settings/end-of-day/steps/EodStepReport'
import EodStepStaff from '@/components/settings/end-of-day/steps/EodStepStaff'
import EodStepTips from '@/components/settings/end-of-day/steps/EodStepTips'
import EodSummaryScreen from '@/components/settings/end-of-day/steps/EodSummaryScreen'
import ConfirmationModal from '@/components/settings/reset-application/ConfirmationModal'
import TipDistributionWizard from '@/components/tip-distribution/TipDistributionWizard'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import {
  bulkCloseOpenOrders,
  fetchDailySummary,
  loadOrderForPaymentSheet,
  runChecklistValidations
} from '@/services/endOfDayService'
import { EOD_STEPS, useEndOfDayStore } from '@/stores/useEndOfDayStore'
import { usePaymentDetailSheetStore } from '@/stores/usePaymentDetailSheetStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useFocusEffect, useRouter } from 'expo-router'
import { Printer, RotateCcw } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'

/** Steps 0..7 are EOD_STEPS; step 8 is the final summary. */
const SUMMARY_STEP = EOD_STEPS.length

/** Wizard-frame steps are 1..7. Offset for display numbering. */
const WIZARD_FIRST = 1
const WIZARD_LAST = EOD_STEPS.length - 1
const WIZARD_COUNT = WIZARD_LAST - WIZARD_FIRST + 1

export default function EndOfDayScreen () {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const supabase = useSupabaseClient()
  const router = useRouter()
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const locationId = selectedStore?.id

  // ── Store selectors ──────────────────────────────────────────────────
  const currentStep = useEndOfDayStore(s => s.currentStep)
  const setCurrentStep = useEndOfDayStore(s => s.setCurrentStep)
  const checklist = useEndOfDayStore(s => s.checklist)
  const isRunning = useEndOfDayStore(s => s.isRunning)
  const dailySummary = useEndOfDayStore(s => s.dailySummary)
  const summaryLoading = useEndOfDayStore(s => s.summaryLoading)
  const initChecklist = useEndOfDayStore(s => s.initChecklist)
  const updateChecklistItem = useEndOfDayStore(s => s.updateChecklistItem)
  const setDailySummary = useEndOfDayStore(s => s.setDailySummary)
  const setSummaryLoading = useEndOfDayStore(s => s.setSummaryLoading)
  const setCompletionOverride = useEndOfDayStore(s => s.setCompletionOverride)
  const clearCompletionOverride = useEndOfDayStore(
    s => s.clearCompletionOverride
  )
  const canAdvanceFromStep = useEndOfDayStore(s => s.canAdvanceFromStep)
  const getBlockingItems = useEndOfDayStore(s => s.getBlockingItems)
  const isComplete = useEndOfDayStore(s => s.isComplete)
  const reset = useEndOfDayStore(s => s.reset)
  const setEodPhase = useEndOfDayStore(s => s.setEodPhase)
  const completionOverrideReason = useEndOfDayStore(
    s => s.completionOverrideReason
  )

  // ── Store selectors (open orders for floor step) ─────────────────────
  const openOrders = useEndOfDayStore(s => s.openOrders)

  // ── Local state ──────────────────────────────────────────────────────
  const [isCashDrawerOpen, setCashDrawerOpen] = useState(false)
  const [isTipWizardOpen, setTipWizardOpen] = useState(false)
  const [isBulkClockOutOpen, setBulkClockOutOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isBulkClosing, setIsBulkClosing] = useState(false)
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false)

  // ── Navigation helpers ───────────────────────────────────────────────
  const handleNext = useCallback(() => {
    const canAdvance = canAdvanceFromStep(currentStep)
    if (!canAdvance) return

    if (currentStep < WIZARD_LAST) {
      setCurrentStep(currentStep + 1)
      setEodPhase('wizard')
      return
    }

    if (currentStep === WIZARD_LAST) {
      setCurrentStep(SUMMARY_STEP)
      setEodPhase('summary')
    }
  }, [canAdvanceFromStep, currentStep, setCurrentStep, setEodPhase])

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
      setEodPhase('wizard')
    }
  }, [currentStep, setCurrentStep, setEodPhase])

  // ── Deep-link callbacks ──────────────────────────────────────────────
  const onSafeNavigate = useCallback(
    (route: string) => {
      try {
        router.push(route as any)
      } catch (error) {
        console.warn('[EOD] Failed to navigate:', route, error)
      }
    },
    [router]
  )
  const onOpenTables = useCallback(
    () => onSafeNavigate('/(main)/tables'),
    [onSafeNavigate]
  )
  const onOpenOrders = useCallback(
    () => onSafeNavigate('/(main)/previous-orders'),
    [onSafeNavigate]
  )
  const onOpenTimeclock = useCallback(
    () => onSafeNavigate('/(profiles-and-timeclock)/timeclock'),
    [onSafeNavigate]
  )
  const onGoToSettlement = useCallback(
    () => onSafeNavigate('/(main)/settings/end-of-day/settlement'),
    [onSafeNavigate]
  )

  // ── Modal callbacks ──────────────────────────────────────────────────
  const onOpenCashDrawer = useCallback(() => setCashDrawerOpen(true), [])
  const onOpenTipWizard = useCallback(() => setTipWizardOpen(true), [])
  const onOpenBulkClockOut = useCallback(() => setBulkClockOutOpen(true), [])

  // ── Floor & Orders: bulk close ────────────────────────────────────────
  const handleBulkClose = useCallback(
    async (orderIds: string[]) => {
      if (!locationId) return
      setIsBulkClosing(true)
      await bulkCloseOpenOrders(supabase, locationId, orderIds)
      // Re-run validations so the list and checklist item refresh
      await runChecklistValidations(supabase, locationId)
      setIsBulkClosing(false)
    },
    [supabase, locationId]
  )

  const handleNavigateToOrder = useCallback(
    (_orderId: string) => onSafeNavigate('/(main)/previous-orders'),
    [onSafeNavigate]
  )

  const handlePayOrder = useCallback(
    async (orderId: string) => {
      await loadOrderForPaymentSheet(supabase, orderId)
      usePaymentDetailSheetStore.getState().open(orderId, 'summary')
    },
    [supabase]
  )

  // ── Refresh validations ──────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    if (!locationId) return
    setIsRefreshing(true)
    try {
      await runChecklistValidations(supabase, locationId)
    } finally {
      setIsRefreshing(false)
    }
  }, [supabase, locationId])

  // ── Start EOD ────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (!locationId) return
    initChecklist()
    clearCompletionOverride()
    setCurrentStep(1)
    setEodPhase('wizard')
    void handleRefresh()
  }, [
    locationId,
    initChecklist,
    clearCompletionOverride,
    setCurrentStep,
    setEodPhase,
    handleRefresh
  ])

  // ── View-only: jump straight to overview without advancing ──────────
  const handleViewChecklist = useCallback(() => {
    if (!locationId) return
    initChecklist()
    clearCompletionOverride()
    setCurrentStep(1)
    setEodPhase('wizard')
    void handleRefresh()
  }, [
    locationId,
    initChecklist,
    clearCompletionOverride,
    setCurrentStep,
    setEodPhase,
    handleRefresh
  ])

  // ── Generate daily report ────────────────────────────────────────────
  const handleRunSummary = useCallback(async () => {
    if (!locationId) return
    setSummaryLoading(true)
    const summary = await fetchDailySummary(supabase, locationId)
    if (summary) {
      setDailySummary(summary)
      updateChecklistItem('report_generated', 'passed')
    }
    setSummaryLoading(false)
  }, [
    supabase,
    locationId,
    setDailySummary,
    setSummaryLoading,
    updateChecklistItem
  ])

  // ── Override flow ────────────────────────────────────────────────────
  const handleContinueWithIssues = useCallback(() => {
    setIsOverrideModalOpen(true)
  }, [])
  const closeOverrideModal = useCallback(() => {
    setIsOverrideModalOpen(false)
  }, [])
  const confirmOverride = useCallback(() => {
    const blocking = getBlockingItems({ includePending: true })
    const failedLabels = blocking
      .filter(item => item.status === 'failed')
      .map(item => item.label)
      .join(', ')
    const message = failedLabels
      ? `Closing with unresolved blockers: ${failedLabels}`
      : 'Closing with unresolved items'
    setCompletionOverride(message)
    setIsOverrideModalOpen(false)
    if (currentStep < WIZARD_LAST) {
      setCurrentStep(currentStep + 1)
      setEodPhase('wizard')
    } else {
      setCurrentStep(SUMMARY_STEP)
      setEodPhase('summary')
    }
  }, [
    getBlockingItems,
    currentStep,
    setCompletionOverride,
    setCurrentStep,
    setIsOverrideModalOpen,
    setEodPhase
  ])

  // ── Finalize ─────────────────────────────────────────────────────────
  const handleFinalize = useCallback(() => {
    const overrideReason = useEndOfDayStore.getState().completionOverrideReason
    if (!(isComplete() || !!overrideReason)) {
      return
    }
    reset()
    router.back()
  }, [isComplete, reset, router])

  // ── Auto-refresh validations on screen focus ────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (!isRunning || !locationId) {
        return
      }
      void (async () => {
        await runChecklistValidations(supabase, locationId)
      })()
    }, [isRunning, locationId, supabase])
  )

  // ── Date label ───────────────────────────────────────────────────────
  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const locationName = selectedStore?.name ?? null
  const canAdvance = canAdvanceFromStep(currentStep)
  const blockingItems = getBlockingItems({ includePending: true })
  const allComplete = isComplete()
  const canCompleteFinal = allComplete || !!completionOverrideReason

  // ── Step 0: Intro (standalone — no wizard frame) ─────────────────────
  if (!isRunning || currentStep === 0) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.screen }}
        contentContainerStyle={{ padding: s(20) }}
      >
        <EodIntroScreen
          locationName={locationName}
          dateLabel={dateLabel}
          isStartEnabled={!!locationId}
          onStart={handleStart}
          onViewChecklist={handleViewChecklist}
        />

        {/* Sub-sheets need to be mounted even on intro */}
        <CashDrawerSheet
          isOpen={isCashDrawerOpen}
          onClose={() => {
            setCashDrawerOpen(false)
            handleRefresh()
          }}
        />
        <TipDistributionWizard
          isOpen={isTipWizardOpen}
          onClose={() => {
            setTipWizardOpen(false)
            handleRefresh()
          }}
        />
        <ConfirmationModal
          isOpen={isOverrideModalOpen}
          onClose={closeOverrideModal}
          onConfirm={confirmOverride}
          title='Continue close out with issues?'
          description='Some required checks are unresolved. This will record a manual override so you can complete close out.'
          confirmText='Continue with issues'
          variant='destructive'
        />
      </ScrollView>
    )
  }

  // ── Step 8: Summary (standalone — no wizard frame) ───────────────────
  if (currentStep === SUMMARY_STEP) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.screen }}
        contentContainerStyle={{ padding: s(20), paddingBottom: s(40) }}
      >
        <EodSummaryScreen
          checklist={checklist}
          blockingItems={blockingItems}
          canComplete={canCompleteFinal}
        />

        {/* Action buttons */}
        <View style={{ marginTop: s(20), gap: s(10) }}>
          <TouchableOpacity
            onPress={handleFinalize}
            disabled={!canCompleteFinal}
            style={{
              backgroundColor: canCompleteFinal
                ? colors.teal
                : colors.teal + '66',
              paddingVertical: s(10),
              borderRadius: s(9),
              alignItems: 'center',
              opacity: canCompleteFinal ? 1 : 0.5
            }}
          >
            <Text
              style={{ fontSize: s(12), fontWeight: '700', color: colors.onSolid }}
            >
              Complete Close Out
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingVertical: s(10),
              borderRadius: s(9),
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: s(8)
            }}
          >
            <Printer size={s(14)} color={colors.label} />
            <Text
              style={{ fontSize: s(12), fontWeight: '600', color: colors.label }}
            >
              Print EOD Report
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleBack}
            style={{
              paddingVertical: s(8),
              alignItems: 'center'
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}
            >
              <RotateCcw size={s(13)} color={colors.label} />
              <Text style={{ fontSize: s(12), color: colors.label }}>
                Back to Report
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <CashDrawerSheet
          isOpen={isCashDrawerOpen}
          onClose={() => {
            setCashDrawerOpen(false)
            handleRefresh()
          }}
        />
        <TipDistributionWizard
          isOpen={isTipWizardOpen}
          onClose={() => {
            setTipWizardOpen(false)
            handleRefresh()
          }}
        />
      </ScrollView>
    )
  }

  // ── Steps 1..7: Wrapped in EodWizardLayout ───────────────────────────
  const stepDef = EOD_STEPS[currentStep]
  const isLastWizardStep = currentStep === WIZARD_LAST

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <EodStepOverview
            allItems={checklist}
            blockingItems={blockingItems}
            isLoading={isRefreshing}
            onRefresh={handleRefresh}
            onOpenTables={onOpenTables}
            onOpenOrders={onOpenOrders}
            onOpenCashDrawer={onOpenCashDrawer}
            onOpenTips={onOpenTipWizard}
            onOpenStaff={onOpenTimeclock}
          />
        )
      case 2:
        return (
          <EodStepFloorOrders
            checklist={checklist}
            isRunning={isRefreshing}
            onRefresh={handleRefresh}
            onOpenTables={onOpenTables}
            onOpenOrders={onOpenOrders}
            openOrders={openOrders}
            isBulkClosing={isBulkClosing}
            onBulkClose={handleBulkClose}
            onNavigateToOrder={handleNavigateToOrder}
            onPayOrder={handlePayOrder}
          />
        )
      case 3:
        return (
          <EodStepCash
            checklist={checklist}
            drawerBreakdown={dailySummary?.drawerBreakdown}
            onOpenCashDrawer={onOpenCashDrawer}
            onRefresh={handleRefresh}
          />
        )
      case 4:
        return (
          <EodStepTips
            checklist={checklist}
            onOpenTipWizard={onOpenTipWizard}
            onRefresh={handleRefresh}
          />
        )
      case 5:
        return (
          <EodStepStaff
            checklist={checklist}
            onOpenTimeclock={onOpenTimeclock}
            onOpenBulkClockOut={onOpenBulkClockOut}
            onRefresh={handleRefresh}
          />
        )
      case 6:
        return (
          <EodStepPaymentsPlaceholder
            summary={dailySummary}
            summaryLoading={summaryLoading}
            onGoToSettlement={onGoToSettlement}
          />
        )
      case 7:
        return (
          <EodStepReport
            checklist={checklist}
            summary={dailySummary}
            summaryLoading={summaryLoading}
            onRunSummary={handleRunSummary}
            canComplete={canCompleteFinal}
            onContinueWithIssues={handleContinueWithIssues}
          />
        )
      default:
        return null
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, padding: s(12) }}>
      <EodWizardLayout
        title={stepDef?.title ?? ''}
        subtitle={stepDef?.subtitle ?? ''}
        currentStep={currentStep - WIZARD_FIRST}
        totalSteps={WIZARD_COUNT}
        canGoBack={currentStep > 0}
        canGoNext={canAdvance}
        hasBlockingItems={blockingItems.length > 0}
        onBack={handleBack}
        onNext={handleNext}
        onContinueWithIssues={handleContinueWithIssues}
        nextLabel={isLastWizardStep ? 'Finish' : 'Next'}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: s(16) }}
          showsVerticalScrollIndicator={false}
        >
          {renderStepContent()}
        </ScrollView>
      </EodWizardLayout>

      {/* Sub-sheets */}
      <CashDrawerSheet
        isOpen={isCashDrawerOpen}
        onClose={() => {
          setCashDrawerOpen(false)
          handleRefresh()
        }}
      />
      <TipDistributionWizard
        isOpen={isTipWizardOpen}
        onClose={() => {
          setTipWizardOpen(false)
          handleRefresh()
        }}
      />
      <EodBulkClockOutModal
        isOpen={isBulkClockOutOpen}
        onClose={() => {
          setBulkClockOutOpen(false)
          void handleRefresh()
        }}
      />
      <ConfirmationModal
        isOpen={isOverrideModalOpen}
        onClose={closeOverrideModal}
        onConfirm={confirmOverride}
        title='Continue close out with issues?'
        description='Some required checks are unresolved. This will record a manual override so you can complete close out.'
        confirmText='Continue with issues'
        variant='destructive'
      />
    </View>
  )
}
