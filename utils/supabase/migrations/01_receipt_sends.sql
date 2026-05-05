-- Audit trail for email + SMS receipt sends.
-- Writes are service-role only (the send-receipt Edge Function);
-- reads are scoped to the merchant's own staff via staff_profiles.

BEGIN;

CREATE TABLE IF NOT EXISTS public.receipt_sends (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  merchant_id         uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  delivery_method     text NOT NULL CHECK (delivery_method IN ('email', 'sms')),
  recipient           text NOT NULL,
  status              text NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message       text,
  receipt_template_id uuid REFERENCES public.receipt_templates(id) ON DELETE SET NULL,
  created_by          text,
  sent_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_sends_order_sent_at
  ON public.receipt_sends (order_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_receipt_sends_merchant_sent_at
  ON public.receipt_sends (merchant_id, sent_at DESC);

ALTER TABLE public.receipt_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receipt_sends_select_merchant_staff ON public.receipt_sends;

CREATE POLICY receipt_sends_select_merchant_staff
  ON public.receipt_sends FOR SELECT
  USING (
    merchant_id IN (
      SELECT merchant_id FROM public.staff_profiles WHERE user_id = auth.uid()
    )
  );

COMMIT;
