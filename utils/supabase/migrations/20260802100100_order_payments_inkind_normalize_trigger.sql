-- =====================================================================
-- Migration: normalise in-kind payments on insert (trg_inkind_normalize)
-- =====================================================================
-- Makes 'inkind' a first-class non-tender settlement WITHOUT forking the
-- process_payment lineage.
--
-- WHY A TRIGGER AND NOT A process_payment FORK
--   The pricing behaviour in-kind needs is already correct in every live
--   version: process_payment forks on `v_is_cash := p_payment_method =
--   'cash'`, so 'inkind' automatically takes the CARD-pricing path
--   (unit_price, card_total, is_cash_priced = false). Nothing about the
--   balance, split, item-allocation or service-charge math needs to change.
--
--   What DOES need correcting is purely tender METADATA on the inserted
--   row — and every one of those is a column on NEW, so a BEFORE INSERT
--   trigger can set them. That buys three things a fork cannot:
--     • Zero risk to the money math. The 1,000-line balance logic is not
--       copied, so it cannot drift or be transcribed wrong.
--     • Version independence. It applies to whichever process_payment
--       version a client calls (the repo currently has callers on both
--       v16 and v17) and keeps applying after the next fork, instead of
--       silently reverting the moment someone forks again.
--     • No clobber risk. process_payment_v17 exists in the database but
--       has NO migration file in this repo (it carries the Valor
--       card-metadata branch, referenced from
--       stores/useOrderStore.ts). A new fork named v17 would CREATE OR
--       REPLACE it and silently delete that branch; a fork named v18 that
--       was copied from v16 would drop it just as silently.
--
-- WHAT IT NORMALISES (only when payment_method = 'inkind')
--   tip_amount / tip_fee        -> 0     a tip on money never collected
--                                        would post to employee tip
--                                        payouts as a real liability.
--   total_amount                -> amount   keeps the row self-consistent
--                                        after the tip is dropped.
--   amount_tendered             -> NULL  nothing was tendered.
--   change_given                -> 0     nothing to give back; keeps the
--                                        expected cash drawer untouched.
--   dual_pricing_fee            -> 0     models money a PROCESSOR takes.
--   processor_fee_percentage_snapshot,
--   tip_surcharge_percentage_snapshot,
--   dual_pricing_percentage_snapshot -> 0  same reason.
--   terminal_type               -> 'none'  no terminal was involved
--                                        (process_payment would otherwise
--                                        fall through to 'dejavoo').
--   acquirer / batch_number     -> NULL  makes trg_lazy_settlement_batch_link
--                                        skip the row, so in-kind can never
--                                        join a host settlement batch.
--   is_settled                  -> false in-kind never settles.
--
-- WHAT IT DELIBERATELY LEAVES ALONE
--   amount / original_amount — card pricing is the whole point of in-kind.
--   status — stays 'captured'. The check IS settled; order finalisation
--     and enforce_order_math must see a normal captured payment or the
--     order would never close.
--   covers_items / order_payment_items — item coverage is real.
--
-- TRIGGER ORDERING (load-bearing)
--   Postgres fires same-timing triggers in ALPHABETICAL order by trigger
--   name. This must run BEFORE trg_lazy_settlement_batch_link so that
--   acquirer/batch_number are already NULL when the linker inspects them.
--     trg_inkind_normalize
--   < trg_lazy_settlement_batch_link
--   < trg_order_payments_stamp_pricing_snapshot
--   ('i' < 'l' < 'o'), so the name is chosen, not incidental. Do not
--   rename it to something that sorts later.
--
--   trg_order_payments_stamp_pricing_snapshot is a fee backstop that
--   re-stamps dual_pricing_fee when a caller left it at 0 — exactly what
--   this trigger just did. It is safe regardless of order because it
--   guards on a CARD-method allowlist that excludes 'inkind', but running
--   first means we do not depend on that.
--
-- PREREQUISITE: 20260802100000_payment_method_add_inkind.sql applied and
-- COMMITTED first (this function compares against the enum label).
--
-- Rollback: 20260802100100_order_payments_inkind_normalize_trigger_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public._inkind_normalize_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Cheap guard: every non-in-kind insert falls straight through.
    IF NEW.payment_method::text IS DISTINCT FROM 'inkind' THEN
        RETURN NEW;
    END IF;

    -- No funds moved: strip every tender-side field.
    NEW.tip_amount      := 0;
    NEW.total_amount    := NEW.amount;
    NEW.amount_tendered := NULL;
    NEW.change_given    := 0;

    -- No processor: strip every fee and fee-percentage snapshot.
    NEW.tip_fee         := 0;
    NEW.dual_pricing_fee := 0;
    NEW.processor_fee_percentage_snapshot   := 0;
    NEW.tip_surcharge_percentage_snapshot   := 0;
    NEW.dual_pricing_percentage_snapshot    := 0;

    -- No terminal. process_payment's CASE would otherwise land on 'dejavoo'
    -- and attribute a phantom terminal to a payment no device touched.
    NEW.terminal_type := 'none';

    -- No host batch. Nulling these makes trg_lazy_settlement_batch_link
    -- (which runs after this trigger, by name ordering) skip the row, so
    -- in-kind never inflates a settlement batch a merchant reconciles
    -- against the processor.
    NEW.acquirer            := NULL;
    NEW.batch_number        := NULL;
    NEW.settlement_batch_id := NULL;
    NEW.is_settled          := false;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_inkind_normalize ON public.order_payments;
CREATE TRIGGER trg_inkind_normalize
    BEFORE INSERT ON public.order_payments
    FOR EACH ROW
    EXECUTE FUNCTION public._inkind_normalize_payment();

COMMENT ON FUNCTION public._inkind_normalize_payment IS
    'BEFORE INSERT on order_payments. No-op unless payment_method = ''inkind''. In-kind is a non-tender settlement: the check is marked fully paid at CARD pricing while no money is collected. Card pricing already works in every process_payment version (''inkind'' is not ''cash''), so this only strips tender/processor metadata: zeroes tip, fees and fee snapshots, clears amount_tendered/change_given, sets terminal_type=''none'', and nulls acquirer/batch_number/settlement_batch_id so trg_lazy_settlement_batch_link skips the row. Never touches amount, original_amount or status. MUST sort before trg_lazy_settlement_batch_link (BEFORE triggers fire alphabetically) — do not rename.';
