BEGIN;

-- Refunds need their own public receipt identity and display number. These are
-- separate from the reversal UUID so hosted links never expose primary keys.
ALTER TABLE public.reversals
  ADD COLUMN IF NOT EXISTS receipt_token text,
  ADD COLUMN IF NOT EXISTS refund_number text;

CREATE UNIQUE INDEX IF NOT EXISTS reversals_receipt_token_key
  ON public.reversals (receipt_token)
  WHERE receipt_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reversals_location_refund_number_key
  ON public.reversals (location_id, refund_number)
  WHERE refund_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.refund_number_counters (
  location_id uuid PRIMARY KEY REFERENCES public.locations(id) ON DELETE CASCADE,
  last_value bigint NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.refund_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.refund_number_counters FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_refund_receipt_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sequence bigint;
  v_prefix text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed'
     OR NEW.reversal_type NOT IN ('refund', 'partial_refund', 'item_return') THEN
    RETURN NEW;
  END IF;

  IF NEW.receipt_token IS NULL OR btrim(NEW.receipt_token) = '' THEN
    NEW.receipt_token := replace(gen_random_uuid()::text, '-', '');
  END IF;

  IF NEW.refund_number IS NULL OR btrim(NEW.refund_number) = '' THEN
    INSERT INTO public.refund_number_counters (location_id, last_value)
    VALUES (NEW.location_id, 1)
    ON CONFLICT (location_id) DO UPDATE
      SET last_value = public.refund_number_counters.last_value + 1,
          updated_at = now()
    RETURNING last_value INTO v_sequence;

    SELECT regexp_replace(
             coalesce(nullif(s.station_code, ''), nullif(l.code, ''),
               substr(replace(NEW.location_id::text, '-', ''), 1, 4)),
             '[^A-Za-z0-9]', '', 'g'
           )
      INTO v_prefix
      FROM public.order_payments op
      JOIN public.orders o ON o.id = op.order_id
      JOIN public.locations l ON l.id = NEW.location_id
      LEFT JOIN public.stations s ON s.id = o.station_id
     WHERE op.id = NEW.original_payment_id;

    IF v_prefix IS NULL OR v_prefix = '' THEN
      v_prefix := substr(replace(NEW.location_id::text, '-', ''), 1, 4);
    END IF;

    NEW.refund_number := 'R' || upper(v_prefix) || '-' || lpad(v_sequence::text, 6, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_refund_receipt_identity ON public.reversals;
CREATE TRIGGER set_refund_receipt_identity
BEFORE INSERT OR UPDATE ON public.reversals
FOR EACH ROW
EXECUTE FUNCTION public.set_refund_receipt_identity();

-- Existing receipt sends remain order-linked. Refund delivery uses the same
-- audit table but links to exactly one reversal instead.
ALTER TABLE public.receipt_sends
  ALTER COLUMN order_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS reversal_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'receipt_sends_reversal_id_fkey'
       AND conrelid = 'public.receipt_sends'::regclass
  ) THEN
    ALTER TABLE public.receipt_sends
      ADD CONSTRAINT receipt_sends_reversal_id_fkey
      FOREIGN KEY (reversal_id)
      REFERENCES public.reversals(id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

ALTER TABLE public.receipt_sends
  DROP CONSTRAINT IF EXISTS receipt_sends_order_or_reversal_check;

ALTER TABLE public.receipt_sends
  ADD CONSTRAINT receipt_sends_order_or_reversal_check
  CHECK (num_nonnulls(order_id, reversal_id) = 1);

CREATE INDEX IF NOT EXISTS idx_receipt_sends_reversal_sent_at
  ON public.receipt_sends (reversal_id, sent_at DESC)
  WHERE reversal_id IS NOT NULL;

-- Each active location inherits its active sale receipt appearance. Locations
-- without a stored sale template get conservative defaults.
INSERT INTO public.receipt_templates (
  merchant_id,
  location_id,
  template_name,
  template_type,
  is_active,
  header_text,
  footer_text,
  logo_url,
  show_logo,
  show_barcode,
  show_qr_code,
  show_order_type,
  show_server_name,
  show_tax_breakdown,
  show_tip_line,
  show_customer_phone,
  show_item_modifiers,
  show_allergy_alert,
  show_ready_by_time,
  show_mods_large,
  large_item_text,
  group_by_station,
  group_by_seat,
  modifier_style,
  show_void_reason,
  show_approved_by,
  show_break_details
)
SELECT
  l.merchant_id,
  l.id,
  'Refund Receipt',
  'refund',
  true,
  sale.header_text,
  sale.footer_text,
  sale.logo_url,
  coalesce(sale.show_logo, false),
  false,
  coalesce(sale.show_qr_code, false),
  coalesce(sale.show_order_type, true),
  coalesce(sale.show_server_name, true),
  coalesce(sale.show_tax_breakdown, true),
  false,
  coalesce(sale.show_customer_phone, true),
  coalesce(sale.show_item_modifiers, true),
  coalesce(sale.show_allergy_alert, true),
  coalesce(sale.show_ready_by_time, true),
  coalesce(sale.show_mods_large, true),
  coalesce(sale.large_item_text, true),
  coalesce(sale.group_by_station, true),
  coalesce(sale.group_by_seat, false),
  coalesce(sale.modifier_style, 'inverted'),
  coalesce(sale.show_void_reason, true),
  coalesce(sale.show_approved_by, true),
  coalesce(sale.show_break_details, true)
FROM public.locations l
LEFT JOIN LATERAL (
  SELECT rt.*
    FROM public.receipt_templates rt
   WHERE rt.location_id = l.id
     AND rt.template_type = 'receipt'
     AND coalesce(rt.is_active, true)
   ORDER BY rt.updated_at DESC NULLS LAST, rt.created_at DESC NULLS LAST
   LIMIT 1
) sale ON true
WHERE l.is_active
  AND NOT EXISTS (
    SELECT 1
      FROM public.receipt_templates existing
     WHERE existing.location_id = l.id
       AND existing.template_type = 'refund'
       AND coalesce(existing.is_active, true)
  );

-- Promote processor approval fields out of JSONB for every historical
-- completed refund. COALESCE preserves any value already written correctly.
UPDATE public.reversals r
   SET reversal_psp_reference = coalesce(
         r.reversal_psp_reference,
         nullif(r.terminal_response ->> 'RRN', ''),
         nullif(r.terminal_response ->> 'rrn', ''),
         nullif(r.terminal_response #>> '{castles_transaction,rrn}', ''),
         nullif(r.terminal_response ->> 'PNReferenceId', '')
       ),
       result_code = coalesce(
         r.result_code,
         nullif(r.terminal_response #>> '{GeneralResponse,ResultCode}', ''),
         nullif(r.terminal_response ->> 'ResultCode', ''),
         nullif(r.terminal_response ->> 'resultCode', ''),
         nullif(r.terminal_response #>> '{castles_transaction,resultCode}', '')
       ),
       response_message = coalesce(
         r.response_message,
         nullif(r.terminal_response #>> '{GeneralResponse,Message}', ''),
         nullif(r.terminal_response ->> 'Message', ''),
         nullif(r.terminal_response ->> 'responseMessage', ''),
         nullif(r.terminal_response #>> '{castles_transaction,responseMessage}', '')
       )
 WHERE r.status = 'completed'
   AND r.reversal_type IN ('refund', 'partial_refund', 'item_return');

UPDATE public.order_payments p
   SET return_rrn = coalesce(
         p.return_rrn,
         nullif(r.terminal_response ->> 'RRN', ''),
         nullif(r.terminal_response ->> 'rrn', ''),
         nullif(r.terminal_response #>> '{castles_transaction,rrn}', '')
       ),
       return_auth_code = coalesce(
         p.return_auth_code,
         nullif(r.terminal_response ->> 'AuthCode', ''),
         nullif(r.terminal_response ->> 'authCode', ''),
         nullif(r.terminal_response #>> '{castles_transaction,approvalCode}', '')
       ),
       return_reference_id = coalesce(
         p.return_reference_id,
         nullif(r.terminal_response ->> 'ReferenceId', ''),
         nullif(r.terminal_response ->> 'referenceId', ''),
         nullif(r.terminal_response ->> 'PNReferenceId', ''),
         nullif(r.terminal_response #>> '{castles_transaction,referenceId}', '')
       ),
       return_number = coalesce(
         p.return_number,
         nullif(r.terminal_response ->> 'TransactionNumber', ''),
         nullif(r.terminal_response ->> 'transactionNumber', ''),
         nullif(r.terminal_response #>> '{castles_transaction,stan}', ''),
         nullif(r.terminal_response #>> '{castles_transaction,txnInvoiceNumber}', '')
       ),
       return_reason = coalesce(p.return_reason, r.reason_description, r.reason_code),
       returned_by = coalesce(p.returned_by, r.initiated_by),
       returned_at = coalesce(p.returned_at, r.completed_at, r.processed_at),
       return_amount = coalesce(p.return_amount, r.amount),
       is_returned = true
  FROM public.reversals r
 WHERE r.original_payment_id = p.id
   AND r.status = 'completed'
   AND r.reversal_type IN ('refund', 'partial_refund', 'item_return');

-- Fire the identity trigger for historical rows without overwriting existing
-- values. The counter update is atomic, so concurrent refunds stay unique.
UPDATE public.reversals
   SET requested_at = requested_at
 WHERE status = 'completed'
   AND reversal_type IN ('refund', 'partial_refund', 'item_return')
   AND (receipt_token IS NULL OR refund_number IS NULL);

COMMENT ON COLUMN public.reversals.receipt_token IS
  'Opaque public token for hosted refund receipts; never expose reversal UUIDs.';
COMMENT ON COLUMN public.reversals.refund_number IS
  'Human-readable location-scoped refund receipt number.';
COMMENT ON COLUMN public.receipt_sends.reversal_id IS
  'Refund receipt delivery target; mutually exclusive with order_id.';

COMMIT;
