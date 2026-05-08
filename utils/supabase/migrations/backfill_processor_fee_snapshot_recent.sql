-- =====================================================================
-- One-time backfill: stamp processor_fee_percentage_snapshot / dual_pricing_fee
-- / tip_fee on card captures from the last 60 days where they were left at 0.
--
-- Scope intentionally bounded:
--   * Card payment methods only (cash is fee-free).
--   * status IN ('captured','partially_refunded','refunded') — open auths
--     and voids excluded.
--   * captured_at > now() - 60 days — older rows are settled and merchant
--     statements have already been issued; do not retroactively change them.
--   * Only locations with dual_pricing_percentage > 0.
--   * Only rows where snapshot was actually missing (= 0).
--
-- Source of truth: locations.dual_pricing_percentage (the markup added to
-- card prices). processor_fee_percentage is a separate concept (bank fee)
-- and is not used for dual_pricing_fee reporting.
-- =====================================================================

-- Fee base = full charge amount sent to the bank (total_amount). tip is
-- rolled in, so tip_fee stays 0 to avoid double counting.
UPDATE order_payments p
SET
  processor_fee_percentage_snapshot = l.dual_pricing_percentage,
  dual_pricing_fee = ROUND(COALESCE(p.total_amount, p.amount, 0) * l.dual_pricing_percentage / 100, 2),
  tip_fee          = 0
FROM locations l
WHERE l.id = p.location_id
  AND l.dual_pricing_percentage > 0
  AND p.payment_method::text IN ('card','card_spinapi','card_dvpaylite','card_manual','card_online')
  AND p.status IN ('captured','partially_refunded','refunded')
  AND p.captured_at > now() - interval '60 days'
  AND COALESCE(p.processor_fee_percentage_snapshot, 0) = 0;
