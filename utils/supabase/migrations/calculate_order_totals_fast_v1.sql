DECLARE
v_card_subtotal numeric;
v_cash_subtotal numeric;
v_card_tax numeric;
v_cash_tax numeric;
v_discount numeric;
v_service_charge numeric;
v_amount_paid numeric;
v_original_card_subtotal numeric;
v_original_cash_subtotal numeric;
v_unpaid_card_total numeric;
v_unpaid_cash_total numeric;
v_effective_paid numeric;
v_payment_refunded numeric;
v_card_total_calc numeric;
v_payment_based_due numeric;
v_custom_refund_balance numeric;
BEGIN
-- Get original (pre-discount) subtotals and discount amount
SELECT 
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * COALESCE(cash_price, unit_price)), 0),
    COALESCE(SUM(discount_amount), 0)
INTO v_original_card_subtotal, v_original_cash_subtotal, v_discount
FROM public.order_items
WHERE order_id = p_order_id AND is_voided = false;

-- Get post-discount values (subtotal and tax_amount are already discounted per item)
SELECT 
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(cash_subtotal), 0),
    COALESCE(SUM(tax_amount), 0),
    COALESCE(SUM(cash_tax_amount), 0)
INTO v_card_subtotal, v_cash_subtotal, v_card_tax, v_cash_tax
FROM public.order_items
WHERE order_id = p_order_id AND is_voided = false;

-- Get service charge and amount paid
SELECT 
    COALESCE(service_charge, 0),
    COALESCE(amount_paid, 0)
INTO v_service_charge, v_amount_paid
FROM public.orders WHERE id = p_order_id;

-- Calculate amount_due from UNPAID items (item-level calculation)
-- Account for refunded_quantity: refunded items need to be paid again
-- Formula: unpaid_qty = quantity - paid_quantity + refunded_quantity
SELECT 
    COALESCE(SUM(
        ((quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) * unit_price) +
        ROUND(((quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) * unit_price) * COALESCE(tax_rate, 0) / 100, 2)
    ), 0),
    COALESCE(SUM(
        ((quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) * COALESCE(cash_price, unit_price)) +
        ROUND(((quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) * COALESCE(cash_price, unit_price)) * COALESCE(tax_rate, 0) / 100, 2)
    ), 0)
INTO v_unpaid_card_total, v_unpaid_cash_total
FROM public.order_items
WHERE order_id = p_order_id 
    AND is_voided = false 
    AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;

-- Calculate effective amount paid from payments (payment-level calculation)
-- This handles custom amount refunds that aren't tied to specific items
SELECT 
    COALESCE(SUM(amount - COALESCE(refunded_amount, 0)), 0),
    COALESCE(SUM(COALESCE(refunded_amount, 0)), 0)
INTO v_effective_paid, v_payment_refunded
FROM public.order_payments
WHERE order_id = p_order_id
    AND status IN ('captured', 'partially_refunded', 'refunded')
    AND is_voided = false;

-- Calculate card total for payment-based due calculation
v_card_total_calc := v_card_subtotal + v_card_tax + v_service_charge;

-- Payment-based amount due = total - effective_paid (handles custom refunds)
v_payment_based_due := GREATEST(v_card_total_calc - v_effective_paid, 0);

-- Custom refund balance = payment-based due NOT covered by item-level unpaid amounts
-- This is a flat monetary amount from custom refunds — same regardless of card/cash pricing
v_custom_refund_balance := GREATEST(v_payment_based_due - v_unpaid_card_total, 0);
v_unpaid_card_total := v_unpaid_card_total + v_custom_refund_balance;
v_unpaid_cash_total := v_unpaid_cash_total + v_custom_refund_balance;

-- Update order with totals
UPDATE public.orders SET
    -- Original subtotals (pre-discount) for reference
    card_subtotal = v_original_card_subtotal,
    cash_subtotal = v_original_cash_subtotal,
    
    -- Discount amount
    discount_amount = v_discount,
    
    -- Effective values (after discount)
    effective_subtotal = v_card_subtotal,
    effective_tax_amount = v_card_tax,
    effective_total = v_card_subtotal + v_card_tax + v_service_charge,
    
    -- Tax amounts (on discounted subtotals)
    card_tax_amount = v_card_tax,
    cash_tax_amount = v_cash_tax,
    
    -- Totals (discounted subtotal + tax + service)
    card_total = v_card_subtotal + v_card_tax + v_service_charge,
    cash_total = v_cash_subtotal + v_cash_tax + v_service_charge,
    
    -- Legacy fields
    subtotal = v_card_subtotal,
    tax_amount = v_card_tax,
    total_amount = v_card_subtotal + v_card_tax + v_service_charge,
    
    -- Amount due (calculated from UNPAID items, not total - paid)
    amount_due = v_unpaid_card_total,
    cash_amount_due = v_unpaid_cash_total,
    
    updated_at = now()
WHERE id = p_order_id;

RETURN jsonb_build_object(
    'success', true,
    'card_subtotal', v_original_card_subtotal,
    'effective_subtotal', v_card_subtotal,
    'discount_amount', v_discount,
    'card_tax', v_card_tax,
    'card_total', v_card_subtotal + v_card_tax + v_service_charge,
    'cash_total', v_cash_subtotal + v_cash_tax + v_service_charge,
    'amount_due', v_unpaid_card_total,
    'cash_amount_due', v_unpaid_cash_total
);
END;