-- ============================================================================
-- Refund System V1
-- Adds reversals, refund item tracking, and item refund fields
-- ============================================================================

-- ============================================
-- 1. ENUMS
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_reason_type') THEN
    CREATE TYPE refund_reason_type AS ENUM (
      'customer_request',
      'item_quality',
      'wrong_item',
      'never_received',
      'duplicate_charge',
      'price_adjustment',
      'order_cancelled',
      'kitchen_error',
      'manager_comp',
      'other'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reversal_type') THEN
    CREATE TYPE reversal_type AS ENUM (
      'void',
      'refund',
      'partial_refund',
      'item_return'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reversal_status_type') THEN
    CREATE TYPE reversal_status_type AS ENUM (
      'pending',
      'completed',
      'failed'
    );
  END IF;
END $$;

-- ============================================
-- 2. REVERSALS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS reversals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_payment_id UUID NOT NULL REFERENCES order_payments(id),
  original_psp_reference TEXT, -- RRN from original payment
  reversal_reference_id TEXT, -- Internal reference for this reversal
  reversal_psp_reference TEXT, -- RRN/PNReferenceId from the void/refund response
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  location_id UUID NOT NULL REFERENCES locations(id),
  reversal_type reversal_type NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  reason_code refund_reason_type NOT NULL,
  reason_description TEXT,
  status reversal_status_type NOT NULL DEFAULT 'pending',
  result_code TEXT, -- Terminal result code (e.g., "0" for approved)
  response_message TEXT, -- Terminal response message (e.g., "Approved")
  initiated_by UUID,
  approved_by UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ, -- When the terminal processed the reversal
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  terminal_response JSONB,
  emv_data JSONB,
  metadata JSONB
);

-- Add columns if table already exists
ALTER TABLE reversals ADD COLUMN IF NOT EXISTS reversal_psp_reference TEXT;
ALTER TABLE reversals ADD COLUMN IF NOT EXISTS result_code TEXT;
ALTER TABLE reversals ADD COLUMN IF NOT EXISTS response_message TEXT;
ALTER TABLE reversals ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reversals_original_payment
  ON reversals(original_payment_id);

CREATE INDEX IF NOT EXISTS idx_reversals_location_date
  ON reversals(location_id, requested_at);

-- ============================================
-- 3. REFUND LINE ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS order_refund_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reversal_id UUID NOT NULL REFERENCES reversals(id),
  order_item_id UUID NOT NULL REFERENCES order_items(id),
  order_payment_item_id UUID REFERENCES order_payment_items(id),
  quantity_refunded INTEGER NOT NULL DEFAULT 1,
  unit_price_refunded NUMERIC NOT NULL,
  subtotal_refunded NUMERIC NOT NULL,
  tax_refunded NUMERIC NOT NULL DEFAULT 0,
  total_refunded NUMERIC NOT NULL,
  refund_reason refund_reason_type NOT NULL,
  refund_reason_detail TEXT,
  return_to_inventory BOOLEAN DEFAULT false,
  inventory_updated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_refund_items_reversal
  ON order_refund_items(reversal_id);

CREATE INDEX IF NOT EXISTS idx_order_refund_items_order_item
  ON order_refund_items(order_item_id);

-- ============================================
-- 4. ADD REFUND FIELDS TO ORDER ITEMS
-- ============================================
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS refunded_quantity INTEGER DEFAULT 0;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC DEFAULT 0;

-- ============================================
-- 5. RPC: Create reversal record
-- ============================================
CREATE OR REPLACE FUNCTION create_reversal(
  p_original_payment_id uuid,
  p_original_psp_reference text,
  p_reversal_reference_id text,
  p_reversal_type reversal_type,
  p_amount numeric,
  p_reason_code refund_reason_type,
  p_reason_description text,
  p_initiated_by uuid,
  p_approved_by uuid
)
RETURNS reversals
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment record;
  v_reversal reversals;
BEGIN
  SELECT op.*, o.merchant_id, o.location_id
  INTO v_payment
  FROM order_payments op
  JOIN orders o ON o.id = op.order_id
  WHERE op.id = p_original_payment_id
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found or access denied';
  END IF;

  INSERT INTO reversals (
    original_payment_id,
    original_psp_reference,
    reversal_reference_id,
    merchant_id,
    location_id,
    reversal_type,
    amount,
    reason_code,
    reason_description,
    status,
    initiated_by,
    approved_by
  )
  VALUES (
    p_original_payment_id,
    p_original_psp_reference,
    p_reversal_reference_id,
    v_payment.merchant_id,
    v_payment.location_id,
    p_reversal_type,
    p_amount,
    p_reason_code,
    p_reason_description,
    'pending',
    p_initiated_by,
    p_approved_by
  )
  RETURNING * INTO v_reversal;

  RETURN v_reversal;
END;
$$;

-- ============================================
-- 6. RPC: Update reversal status + response
-- ============================================
CREATE OR REPLACE FUNCTION update_reversal_status(
  p_reversal_id uuid,
  p_status reversal_status_type,
  p_terminal_response jsonb DEFAULT NULL,
  p_emv_data jsonb DEFAULT NULL,
  p_result_code text DEFAULT NULL,
  p_response_message text DEFAULT NULL,
  p_reversal_psp_reference text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE reversals
  SET status = p_status,
      terminal_response = COALESCE(p_terminal_response, terminal_response),
      emv_data = COALESCE(p_emv_data, emv_data),
      result_code = COALESCE(p_result_code, result_code),
      response_message = COALESCE(p_response_message, response_message),
      reversal_psp_reference = COALESCE(p_reversal_psp_reference, reversal_psp_reference),
      processed_at = CASE WHEN p_status = 'completed' THEN now() ELSE processed_at END,
      completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE completed_at END,
      failed_at = CASE WHEN p_status = 'failed' THEN now() ELSE failed_at END
  WHERE id = p_reversal_id;
END;
$$;

-- ============================================
-- 7. RPC: Apply refund to payment
-- ============================================
CREATE OR REPLACE FUNCTION apply_refund_to_payment(
  p_payment_id uuid,
  p_refund_amount numeric,
  p_reversal_type reversal_type,
  p_return_rrn text DEFAULT NULL,
  p_return_auth_code text DEFAULT NULL,
  p_return_reference_id text DEFAULT NULL,
  p_return_number text DEFAULT NULL,
  p_return_reason text DEFAULT NULL,
  p_initiated_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment record;
  v_new_refunded numeric;
  v_new_status payment_status;
BEGIN
  SELECT * INTO v_payment
  FROM order_payments op
  JOIN orders o ON o.id = op.order_id
  WHERE op.id = p_payment_id
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found or access denied';
  END IF;

  v_new_refunded := COALESCE(v_payment.refunded_amount, 0) + p_refund_amount;

  IF p_reversal_type = 'void' THEN
    v_new_status := 'void'::payment_status;
  ELSIF v_new_refunded + 0.0001 >= v_payment.amount THEN
    v_new_status := 'refunded'::payment_status;
  ELSE
    v_new_status := 'partially_refunded'::payment_status;
  END IF;

  UPDATE order_payments
  SET refunded_amount = v_new_refunded,
      refunded_at = now(),
      status = v_new_status,
      is_voided = (p_reversal_type = 'void'),
      -- Return/refund tracking fields
      is_returned = true,
      returned_at = now(),
      returned_by = COALESCE(p_initiated_by, returned_by),
      return_amount = v_new_refunded,
      return_rrn = COALESCE(p_return_rrn, return_rrn),
      return_auth_code = COALESCE(p_return_auth_code, return_auth_code),
      return_reference_id = COALESCE(p_return_reference_id, return_reference_id),
      return_number = COALESCE(p_return_number, return_number),
      return_reason = COALESCE(p_return_reason, return_reason)
  WHERE id = p_payment_id;
END;
$$;

-- ============================================
-- 8. RPC: Record refunded items + update order_items
-- ============================================
CREATE OR REPLACE FUNCTION record_refund_items(
  p_reversal_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_refund_items (
      reversal_id,
      order_item_id,
      order_payment_item_id,
      quantity_refunded,
      unit_price_refunded,
      subtotal_refunded,
      tax_refunded,
      total_refunded,
      refund_reason,
      refund_reason_detail,
      return_to_inventory,
      inventory_updated
    )
    VALUES (
      p_reversal_id,
      (v_item->>'order_item_id')::uuid,
      NULLIF(v_item->>'order_payment_item_id', '')::uuid,
      COALESCE((v_item->>'quantity_refunded')::integer, 1),
      COALESCE((v_item->>'unit_price_refunded')::numeric, 0),
      COALESCE((v_item->>'subtotal_refunded')::numeric, 0),
      COALESCE((v_item->>'tax_refunded')::numeric, 0),
      COALESCE((v_item->>'total_refunded')::numeric, 0),
      (v_item->>'refund_reason')::refund_reason_type,
      v_item->>'refund_reason_detail',
      COALESCE((v_item->>'return_to_inventory')::boolean, false),
      COALESCE((v_item->>'inventory_updated')::boolean, false)
    );

    UPDATE order_items
    SET refunded_quantity = COALESCE(refunded_quantity, 0)
          + COALESCE((v_item->>'quantity_refunded')::integer, 0),
        refunded_amount = COALESCE(refunded_amount, 0)
          + COALESCE((v_item->>'total_refunded')::numeric, 0)
    WHERE id = (v_item->>'order_item_id')::uuid;
  END LOOP;
END;
$$;

-- ============================================
-- 9. RPC: Update order payment status after refund
-- Uses calculate_order_totals_fast for comprehensive recalculation
-- including both item-based and payment-based refunds
-- ============================================
CREATE OR REPLACE FUNCTION update_order_payment_status_after_refund(
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_payment_status payment_status;
BEGIN
  -- Verify order access
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or access denied';
  END IF;

  -- Use calculate_order_totals_fast for comprehensive calculation
  -- This includes both item-level refunds (refunded_quantity) and
  -- payment-level refunds (refunded_amount) using MAX logic
  PERFORM calculate_order_totals_fast(p_order_id);
  
  -- Refresh order data after recalculation
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;

  -- Determine payment status based on recalculated amounts
  IF COALESCE(v_order.amount_due, 0) <= 0 THEN
    v_payment_status := 'paid'::payment_status;
  ELSIF COALESCE(v_order.amount_paid, 0) > 0 THEN
    v_payment_status := 'partial'::payment_status;
  ELSE
    v_payment_status := 'refunded'::payment_status;
  END IF;

  -- Update only the payment_status (totals already updated by calculate_order_totals_fast)
  UPDATE orders
  SET payment_status = v_payment_status
  WHERE id = p_order_id;
END;
$$;
