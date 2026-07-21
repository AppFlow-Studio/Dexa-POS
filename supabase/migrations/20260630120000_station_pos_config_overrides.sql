-- Add station-level POS config overrides and a resolver for the effective
-- config used by a POS station.

ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS pos_config_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.stations.pos_config_overrides IS
  'Station-specific POS behavior overrides. Effective config resolves as defaults -> locations.pos_config -> this jsonb.';

CREATE OR REPLACE FUNCTION public._pos_jsonb_deep_merge(
  p_base jsonb,
  p_override jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN jsonb_typeof(COALESCE(p_base, '{}'::jsonb)) = 'object'
      AND jsonb_typeof(COALESCE(p_override, '{}'::jsonb)) = 'object'
    THEN (
      SELECT COALESCE(jsonb_object_agg(merged.key, merged.value), '{}'::jsonb)
      FROM (
        SELECT
          COALESCE(base_entries.key, override_entries.key) AS key,
          CASE
            WHEN base_entries.key IS NULL THEN override_entries.value
            WHEN override_entries.key IS NULL THEN base_entries.value
            ELSE public._pos_jsonb_deep_merge(
              base_entries.value,
              override_entries.value
            )
          END AS value
        FROM jsonb_each(COALESCE(p_base, '{}'::jsonb)) AS base_entries(key, value)
        FULL JOIN jsonb_each(COALESCE(p_override, '{}'::jsonb)) AS override_entries(key, value)
          ON base_entries.key = override_entries.key
      ) AS merged
    )
    ELSE COALESCE(p_override, p_base, 'null'::jsonb)
  END;
$$;

CREATE OR REPLACE FUNCTION public._pos_default_config()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = 'public', 'pg_temp'
AS $$
  SELECT '{
    "_version": 1,
    "_updated_at": null,
    "dining": {
      "enablePerSeatOrdering": false,
      "enableCoursing": true,
      "allowTableMerging": true,
      "allowTableSplitting": false,
      "autoUpdateTableStatus": true,
      "autoClearTableOnPayment": false,
      "defaultSittingTimeMinutes": 60,
      "defaultPartySize": 2
    },
    "kds": {
      "workflowMode": "2-step",
      "autoFireEnabled": false,
      "autoFireDelayMinutes": 5,
      "hideDoneItems": false,
      "displayModifierGroupName": "for_group_priced",
      "itemNameLines": 0,
      "displaySeatNumbers": false,
      "displayGuestCount": true,
      "alphabeticalSort": false,
      "highlightNotes": true,
      "displayExclusionsAtTop": false,
      "aggregateIdenticalItems": false,
      "aggregateToExistingTickets": false,
      "yellowThresholdMinutes": 5,
      "orangeThresholdMinutes": 10,
      "redThresholdMinutes": 15,
      "newOrderPosition": "right"
    },
    "printing": {
      "autoPrintKitchenTickets": true,
      "autoPrintReceipt": false,
      "autoPrintSplitReceipts": false,
      "autoPrintVoidReceipt": true,
      "printVoidTickets": true,
      "printRefundTickets": true,
      "printMerchantCopy": false,
      "printCustomerCopy": true,
      "matchReceiptPricingToPaymentMethod": false
    },
    "cashDrawer": {
      "requireNoSaleReason": true,
      "requireNoSaleApproval": false,
      "noSaleAlertThreshold": 5,
      "blindCloseCount": true,
      "autoPrintNoSaleReceipt": false,
      "defaultOpeningAmount": 200,
      "varianceWarningThreshold": 5,
      "varianceAlertThreshold": 20,
      "requireEodBeforeClose": true
    },
    "onlineOrdering": {
      "enabled": true,
      "pauseReason": null,
      "autoResumeTime": null,
      "autoAcceptOrders": false,
      "largeOrderApprovalThreshold": 200,
      "rejectWhenBusyThreshold": 35,
      "dynamicPrepTimeEnabled": true,
      "basePrepTime": 25,
      "prepTimeAdjustments": {
        "kitchenLoad": true,
        "peakHours": true
      },
      "preOrderingEnabled": true,
      "preOrderMaxDays": 30,
      "preOrderMinAdvanceMinutes": 120,
      "preOrderMaxDaily": 25
    },
    "tips": {
      "presetPercentages": [18, 20, 25],
      "openDrawerOnTip": false,
      "allowCustom": true,
      "maxTipPercentage": 100,
      "tipAdjustTimeoutSeconds": 30,
      "defaultTipOption": null,
      "highTipWarningThreshold": 30,
      "requireTipOnCard": false,
      "enableTipOnCash": true
    },
    "preAuth": {
      "enabled": false,
      "defaultAmount": 25
    },
    "waitlist": {
      "notificationGracePeriodMinutes": 10,
      "enabled": true,
      "autoSmsEnabled": true,
      "smsTemplate": "Hi {name}, your table for {party_size} is ready! Please check in with the host within 5 minutes.",
      "reservationsEnabled": true,
      "reservationDaysAhead": 30,
      "maxGuestsPerSlot": 6,
      "slotDurationMinutes": 90,
      "requireDeposit": false,
      "depositAmount": 20,
      "cancellationPolicy": "Cancellations must be made 24 hours in advance to receive a full refund."
    },
    "payment": {
      "cashEnabled": true,
      "splitByAmount": true,
      "splitByItem": true,
      "splitEvenly": true,
      "dualPricingEnabled": false,
      "dualPricingCashDiscountPercent": 4,
      "textToPayEnabled": false
    },
    "notifications": {
      "soundEnabled": true,
      "onlineOrderSound": "bell",
      "kioskOrderSound": "ding",
      "thirdPartyOrderSound": "alert"
    },
    "timeclock": {
      "breakAndSwitchEnabled": true,
      "breakDurationMinutes": 30,
      "clockInRequirePin": true,
      "preventEarlyClockIn": true,
      "preventOpenOrdersClockOut": true,
      "autoCloseStaleShifts": false,
      "maxShiftHours": 24
    },
    "fraudDetection": {
      "refundToSelfEnabled": false,
      "alertThreshold": 2,
      "blockThreshold": 3,
      "windowMinutes": 60
    }
  }'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.get_effective_pos_config(p_station_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_location_id uuid;
  v_location_config jsonb;
  v_station_overrides jsonb;
  v_public_metadata jsonb;
  v_kds_workflow_mode text;
BEGIN
  SELECT
    s.location_id,
    COALESCE(l.pos_config, '{}'::jsonb),
    COALESCE(s.pos_config_overrides, '{}'::jsonb),
    COALESCE(l.public_metadata, '{}'::jsonb),
    l.kds_workflow_mode
  INTO
    v_location_id,
    v_location_config,
    v_station_overrides,
    v_public_metadata,
    v_kds_workflow_mode
  FROM public.stations s
  JOIN public.locations l ON l.id = s.location_id
  WHERE s.id = p_station_id;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Station not found: %', p_station_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT COALESCE(v_location_id = ANY(public.user_location_ids()), false) THEN
    RAISE EXCEPTION 'Access denied: station not in user scope'
      USING ERRCODE = '42501';
  END IF;

  v_station_overrides := v_station_overrides - '_version' - '_updated_at';

  IF (
    (v_location_config->'dining' IS NULL OR v_location_config->'dining' = '{}'::jsonb)
    AND v_public_metadata ? 'dining_settings'
  ) THEN
    v_location_config := jsonb_set(
      v_location_config,
      '{dining}',
      v_public_metadata->'dining_settings',
      true
    );
  END IF;

  IF (
    (v_location_config->'kds' IS NULL OR NOT (v_location_config->'kds' ? 'workflowMode'))
    AND v_kds_workflow_mode IS NOT NULL
  ) THEN
    v_location_config := jsonb_set(
      v_location_config,
      '{kds}',
      public._pos_jsonb_deep_merge(
        COALESCE(v_location_config->'kds', '{}'::jsonb),
        jsonb_build_object('workflowMode', v_kds_workflow_mode)
      ),
      true
    );
  END IF;

  RETURN public._pos_jsonb_deep_merge(
    public._pos_default_config(),
    public._pos_jsonb_deep_merge(v_location_config, v_station_overrides)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_station_pos_config_overrides(
  p_station_id uuid,
  p_overrides jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_location_id uuid;
  v_sanitized_overrides jsonb;
  v_result jsonb;
BEGIN
  IF p_overrides IS NULL OR jsonb_typeof(p_overrides) <> 'object' THEN
    RAISE EXCEPTION 'p_overrides must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  v_sanitized_overrides := p_overrides - '_version' - '_updated_at';

  SELECT location_id
  INTO v_location_id
  FROM public.stations
  WHERE id = p_station_id;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Station not found: %', p_station_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT COALESCE(v_location_id = ANY(public.user_location_ids()), false) THEN
    RAISE EXCEPTION 'Access denied: station not in user scope'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.stations
  SET
    pos_config_overrides = public._pos_jsonb_deep_merge(
      COALESCE(pos_config_overrides, '{}'::jsonb),
      v_sanitized_overrides
    ),
    updated_at = now()
  WHERE id = p_station_id
  RETURNING pos_config_overrides INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_pos_config(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_station_pos_config_overrides(uuid, jsonb) TO authenticated;
