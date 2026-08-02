# Payment Processing - Complete Guide

## Overview

Dexa POS supports multiple payment methods with integrated terminal processing (Dejavoo), 
split payments, tips, and comprehensive refund handling.

## Payment Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           PAYMENT PROCESSING FLOW                                 │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   ┌─────────────┐      ┌─────────────────┐      ┌─────────────────┐             │
│   │   Select    │      │   Initialize    │      │   Terminal      │             │
│   │   Payment   │ ───► │   Payment       │ ───► │   Processing    │             │
│   │   Method    │      │   Request       │      │   (Dejavoo)     │             │
│   └─────────────┘      └─────────────────┘      └─────────────────┘             │
│                                                         │                        │
│                                                         ▼                        │
│                              ┌───────────────────────────────────────┐           │
│                              │         Terminal Response             │           │
│                              ├───────────────────────────────────────┤           │
│                              │  ✓ Approved    │  ✗ Declined         │           │
│                              │                │                      │           │
│                              ▼                ▼                      │           │
│                        ┌──────────┐    ┌──────────┐                 │           │
│                        │ Capture  │    │  Retry   │                 │           │
│                        │ Payment  │    │  or      │                 │           │
│                        │ in DB    │    │  Cancel  │                 │           │
│                        └──────────┘    └──────────┘                 │           │
│                              │                                       │           │
│                              ▼                                       │           │
│                        ┌──────────────────────────────┐             │           │
│                        │  Update Order Totals         │             │           │
│                        │  • amount_paid               │             │           │
│                        │  • amount_due                │             │           │
│                        │  • payment_status            │             │           │
│                        └──────────────────────────────┘             │           │
│                                                                      │           │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## Payment Methods

| Method | Terminal | Handler |
|--------|----------|---------|
| Card (Swipe/Tap/Insert) | Dejavoo | `CardPaymentView.tsx` |
| Manual Card Entry | Dejavoo | `ManualCardEntryView.tsx` |
| Cash | No | `CashPaymentView.tsx` |

## Key Files

### Components
- `components/bill/paymentView/CardPaymentView.tsx` - Card payment UI
- `components/bill/paymentView/CashPaymentView.tsx` - Cash payment UI
- `components/bill/paymentView/ManualCardEntryView.tsx` - Manual entry UI
- `components/bill/paymentView/PaymentSuccessView.tsx` - Success screen
- `components/bill/PaymentBottomSheet.tsx` - Payment flow container

### Services
- `services/paymentService.ts` - Payment orchestration
- `services/payments/dejavoo.ts` - Dejavoo terminal integration
- `lib/payments/dejavoo-spin-api.ts` - SPIN API implementation
- `services/refundService.ts` - Refund processing

### Store
- `stores/usePaymentStore.ts` - Payment UI state

### SQL
- `utils/supabase/migrations/process_payment_v8.sql` - Main payment RPC
- `utils/supabase/migrations/refund_system_v1.sql` - Refund RPCs

---

## Dejavoo Terminal Integration

### SPIN API

The Dejavoo terminal uses the SPIN (Secure Payment Integration Network) protocol.

```typescript
// lib/payments/dejavoo-spin-api.ts

// Sale Transaction
async function processSale(params: SaleParams): Promise<SaleResponse> {
  const request = buildSPINRequest({
    transactionType: 'Sale',
    amount: params.amount,
    invoiceNumber: params.invoiceNumber,
    // ...
  });
  
  return await sendToTerminal(request);
}
```

### Response Structure

```typescript
interface DejavooSaleResponse {
  ResultCode: string;        // "0" = approved
  AuthCode: string;          // Authorization code
  RRN: string;               // Retrieval Reference Number (CRITICAL for refunds!)
  ReferenceId: string;       // Our transaction reference
  CardData: {
    Last4: string;
    CardType: string;        // Visa, MC, etc.
    EntryType: string;       // Contactless, Chip, Swipe
    BIN: string;             // First 6 digits
  };
  Amounts: {
    Amount: number;
    TipAmount: number;
    TotalAmount: number;
    FeeAmount: number;
  };
  BatchNumber: string;       // Current batch
  TransactionNumber: string; // Position in batch
  EMVData: {                 // Chip card data
    AID: string;
    ApplicationName: string;
    TVR: string;
    TSI: string;
  };
  GeneralResponse: {
    ResultCode: string;
    StatusCode: string;
    Message: string;
    HostResponseCode: string;
  };
}
```

### Critical Data to Store

For refunds/voids to work, we MUST store these fields:

| Field | Why It's Critical |
|-------|-------------------|
| `RRN` | Required for refunds - network's unique identifier |
| `ReferenceId` | Our transaction identifier for lookups |
| `AuthCode` | Required for some void/adjustment operations |
| `BatchNumber` | Needed for void vs refund decision |
| `terminal_response` | Full response JSON for disputes |

```typescript
// order_payments table storage
{
  reference_number: response.ReferenceId,  // Our reference
  rrn: response.RRN,                        // Network reference (CRITICAL)
  auth_code: response.AuthCode,             // Authorization
  batch_number: response.BatchNumber,       // Batch info
  terminal_response: response,              // Full response JSON
}
```

---

## Payment Processing Flow

### 1. Initialize Payment

```typescript
// usePaymentStore.ts
const startPayment = (amount: number, method: PaymentMethod) => {
  set({
    paymentAmount: amount,
    paymentMethod: method,
    paymentStatus: 'pending',
  });
};
```

### 2. Lock Order

```typescript
// Prevent concurrent modifications during payment
await supabase.rpc('lock_order_for_payment', { p_order_id: orderId });
```

### 3. Process Terminal Transaction

```typescript
// CardPaymentView.tsx
const result = await dejavooService.processSale({
  amount: paymentAmount,
  tipAmount: tipAmount,
  invoiceNumber: generateInvoiceNumber(),
  referenceId: generateReferenceId(),
  tpn: terminalProfileNumber,  // Terminal ID
});

if (result.success) {
  // Proceed to capture
} else {
  // Show error, allow retry
}
```

### 4. Capture in Database

```typescript
// process_payment_v8.sql handles:
// - Creating order_payments record
// - Updating order_items paid_quantity
// - Creating order_payment_items coverage
// - Recalculating order totals
// - Broadcasting changes

const { data } = await supabase.rpc('process_payment_v8', {
  p_order_id: orderId,
  p_amount: amount,
  p_tip_amount: tipAmount,
  p_payment_method: 'card',
  p_terminal_response: terminalResponse,
  p_reference_id: referenceId,
  p_rrn: rrn,
  p_auth_code: authCode,
  p_card_last4: cardLast4,
  p_card_type: cardType,
  // ... other params
});
```

### 5. Update UI

```typescript
// Payment store updates
set({
  paymentStatus: 'completed',
  completedPaymentInfo: {
    amount: result.amount,
    method: 'card',
    last4: result.cardLast4,
  },
});
```

---

## Split Payments

### Types of Splits

| Type | Description | Use Case |
|------|-------------|----------|
| Split Evenly | Total ÷ number of people | Friends splitting equally |
| Split by Amount | Custom amounts per payment | Different amounts per person |
| Pay for Items | Select specific items to pay | Each person pays for their items |

### Flow

```typescript
// SplitPaymentView.tsx
const processSplitPayment = async (splitConfig: SplitConfig) => {
  for (const split of splitConfig.splits) {
    await processPayment({
      amount: split.amount,
      splitIndex: split.index,
      splitTotal: splitConfig.totalSplits,
      coverItems: split.items,  // For "pay for items"
    });
  }
};
```

### Database Tracking

Each split payment is a separate `order_payments` record with:
- `split_index` - Which split (1, 2, 3...)
- `split_total` - Total number of splits
- `covers_items` - Array of item IDs this payment covers

---

## Refund Processing

### Refund Types

| Type | Description | Terminal Action |
|------|-------------|-----------------|
| Full Payment | Refund entire payment | Void (same batch) or Refund |
| Partial Amount | Refund custom amount | Refund |
| Item Return | Refund specific items | Refund |

### Void vs Refund Decision

```
┌─────────────────────────────────────────────────────────────────┐
│                  VOID vs REFUND DECISION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Is payment in current batch (unsettled)?                      │
│                │                                                 │
│       ┌───────┴───────┐                                         │
│       ▼               ▼                                         │
│     [YES]           [NO]                                        │
│       │               │                                         │
│       ▼               ▼                                         │
│   ┌───────┐      ┌───────┐                                     │
│   │ VOID  │      │REFUND │                                     │
│   │       │      │       │                                     │
│   │Faster │      │Credit │                                     │
│   │No fee │      │May fee│                                     │
│   └───────┘      └───────┘                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Refund Flow

```typescript
// services/refundService.ts
class RefundService {
  async processRefund(request: RefundRequest): Promise<RefundResult> {
    // 1. Create reversal record (for audit trail)
    const reversal = await this.createReversal(request);
    
    // 2. Determine void vs refund
    const useVoid = await this.canVoidPayment(request.paymentId);
    
    // 3. Process terminal transaction
    const terminalResult = useVoid
      ? await this.processTerminalVoid(request)
      : await this.processTerminalRefund(request);
    
    // 4. Update database records
    await this.applyRefundToPayment(request.paymentId, request.amount);
    await this.updateOrderPaymentStatus(request.orderId);
    
    // 5. Sync local state
    await syncOrderFromBackendComplete(request.orderId);
    
    return { success: true, reversalId: reversal.id };
  }
}
```

### Refund Reasons

```typescript
type RefundReasonType =
  | 'customer_request'
  | 'item_quality'
  | 'wrong_item'
  | 'never_received'
  | 'duplicate_charge'
  | 'price_adjustment'
  | 'order_cancelled'
  | 'kitchen_error'
  | 'manager_comp'
  | 'other';
```

---

## Tips

### Tip on Sale

Tips can be added during the initial transaction:

```typescript
await dejavooService.processSale({
  amount: subtotal,
  tipAmount: tipAmount,  // Added to total
  // ...
});
```

### Tip Adjustment (Post-Sale)

Tips can be adjusted after the initial transaction (before batch settlement):

```typescript
// Tip adjustment on settlement
await dejavooService.adjustTip({
  referenceId: originalPayment.referenceId,
  originalAmount: originalPayment.amount,
  newTipAmount: newTipAmount,
  tpn: terminalProfileNumber,
});

// Update payment record
await supabase.rpc('update_payment_tip', {
  p_payment_id: paymentId,
  p_tip_amount: tipAmount,
});
```

---

## Error Handling

### Terminal Errors

| Error | Cause | Action |
|-------|-------|--------|
| `Service Busy` | Terminal processing another transaction | Wait 3 seconds, retry |
| `Card Declined` | Insufficient funds, card issue | Try different card |
| `Communication Error` | Network issue with terminal | Check connection, retry |
| `Timeout` | Transaction took too long | Check status, then retry |
| `Invalid Card` | Card read error | Re-swipe/insert card |

### Recovery: Check Transaction Status

```typescript
// If unclear whether transaction completed
const status = await dejavooService.checkStatus({
  referenceId: originalReferenceId,
  tpn: terminalProfileNumber,
});

if (status.transactionFound && status.approved) {
  // Transaction completed - capture it
  await capturePayment(status.response);
} else {
  // Transaction didn't complete - safe to retry
  await retryPayment();
}
```

### Multiple Payment Refunds

When refunding an order with multiple payments, add delays between terminal calls:

```typescript
for (let i = 0; i < payments.length; i++) {
  if (i > 0) {
    // Wait for terminal to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  await processRefund(payments[i]);
}
```

---

## Database Schema

### order_payments

```sql
CREATE TABLE order_payments (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  payment_method payment_method_type,
  amount NUMERIC,
  tip_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC,
  status payment_status,  -- pending, captured, refunded, voided
  
  -- Terminal data (CRITICAL for refunds)
  terminal_type TEXT,
  terminal_id TEXT,
  reference_number TEXT,  -- Our reference (ReferenceId)
  rrn TEXT,               -- Network reference (CRITICAL!)
  auth_code TEXT,
  batch_number TEXT,
  terminal_response JSONB,
  terminal_request JSONB,
  
  -- Card data (non-PCI safe to store)
  card_type TEXT,
  card_last_four TEXT,
  
  -- Refund tracking
  refunded_amount NUMERIC DEFAULT 0,
  refunded_at TIMESTAMPTZ,
  refunded_by UUID,
  return_reason TEXT,
  
  -- Split payment
  split_index INTEGER,
  split_total INTEGER,
  covers_items JSONB,
  
  -- Voiding
  is_voided BOOLEAN DEFAULT false,
  voided_at TIMESTAMPTZ,
  voided_by UUID,
  void_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  captured_at TIMESTAMPTZ,
  initiated_at TIMESTAMPTZ,
);
```

### order_payment_items

Tracks which items each payment covers (for split payments and refunds):

```sql
CREATE TABLE order_payment_items (
  id UUID PRIMARY KEY,
  order_payment_id UUID REFERENCES order_payments(id),
  order_item_id UUID REFERENCES order_items(id),
  quantity_paid INTEGER,
  unit_price_paid NUMERIC,
  tax_paid NUMERIC,
  total_paid NUMERIC,
);
```

### reversals

Audit trail for all refunds/voids:

```sql
CREATE TABLE reversals (
  id UUID PRIMARY KEY,
  original_payment_id UUID REFERENCES order_payments(id),
  original_psp_reference TEXT,  -- Original RRN
  reversal_reference_id TEXT,
  reversal_psp_reference TEXT,  -- New RRN from refund
  merchant_id UUID,
  location_id UUID,
  reversal_type reversal_type,  -- void, refund, partial_refund
  amount NUMERIC,
  reason_code TEXT,
  reason_description TEXT,
  status reversal_status,
  result_code TEXT,
  response_message TEXT,
  initiated_by UUID,
  approved_by UUID,
  requested_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  raw_response JSONB,
);
```

---

## Cash Payments

Cash payments are simpler (no terminal):

```typescript
// CashPaymentView.tsx
const processCashPayment = async () => {
  const { data } = await supabase.rpc('process_payment_v8', {
    p_order_id: orderId,
    p_amount: amountTendered,
    p_payment_method: 'cash',
    p_amount_tendered: amountTendered,
    p_change_given: changeAmount,
    // No terminal response fields
  });
};
```

### Cash Drawer

Cash payments may trigger cash drawer opening (if configured).

---

## Dual Pricing (Cash Discount)

Some merchants offer cash discounts:

```typescript
// Order totals include both prices
const totals = calculateOrderTotals({
  items,
  // ...
});

// totals.cardTotal - Price if paying by card
// totals.cashTotal - Price if paying by cash (with discount)
```

---

## Related Documentation

- [ORDERS_LIFECYCLE.md](../orders/ORDERS_LIFECYCLE.md) - Order flow details
- [STATE_MANAGEMENT.md](../../engineering/architecture/STATE_MANAGEMENT.md) - Store architecture
