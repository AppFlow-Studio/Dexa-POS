// types/realtime.ts
// DEXA POS Realtime Broadcasting Types

// ============================================================================
// CHANNEL TYPES
// ============================================================================

export type RealtimeChannelTopic =
  | `location:${string}:tables`
  | `location:${string}:waitlist`
  | `location:${string}:orders`
  | `location:${string}:kitchen`
  | `session:${string}:events`;

export type RealtimeEventType =
  // Generic Events (used by multiple channels)
  // - location:*:orders channel uses: INSERT, UPDATE, DELETE
  // - location:*:tables channel uses: INSERT, UPDATE, DELETE (for session changes)
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  // Table-specific Events (location:*:tables channel)
  | 'TABLE_ASSIGNMENT_INSERT'
  | 'TABLE_ASSIGNMENT_UPDATE'
  | 'TABLE_ASSIGNMENT_DELETE'
  | 'SESSION_EVENT'
  | 'SESSION_ORDER_UPDATE'
  // Waitlist Events (location:*:waitlist channel)
  | 'WAITLIST_INSERT'
  | 'WAITLIST_UPDATE'
  | 'WAITLIST_DELETE'
  // DEPRECATED: These are not actually used
  // Orders channel uses INSERT/UPDATE/DELETE (not ORDER_INSERT, etc.)
  // Payments come through order updates, not separate events
  | 'ORDER_INSERT'
  | 'ORDER_UPDATE'
  | 'ORDER_DELETE'
  | 'PAYMENT_INSERT'
  | 'PAYMENT_UPDATE';

// ============================================================================
// PAYLOAD TYPES
// ============================================================================

export interface RealtimeBasePayload {
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  timestamp: number; // JS epoch timestamp (ms)
}

// -----------------------------------------------------------------------------
// Table Session Payloads
// -----------------------------------------------------------------------------

export interface TableSessionData {
  id: string;
  status: TableStatus;
  party_size: number;
  server_user_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  guest_notes: string | null;
  seated_at: string | null;
  current_course: number;
  working_course: number;
  course_pacing: CoursePacing;
  needs_attention: boolean;
  is_vip: boolean;
  is_complaint: boolean;
  order_id: string | null;
  session_number: string | null;
  first_order_at: string | null;
  food_served_at: string | null;
  check_presented_at: string | null;
  paid_at: string | null;
}

export interface TableAssignment {
  table_id: string;
  is_primary: boolean;
  table_label: string | null;
  section_id: string | null;
}

export interface ServerInfo {
  user_id: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
}

export interface TableSessionPayload extends RealtimeBasePayload {
  data: {
    session: TableSessionData;
    tables: TableAssignment[] | null;
    server: ServerInfo | null;
  };
}

// -----------------------------------------------------------------------------
// Table Assignment Payloads
// -----------------------------------------------------------------------------

export interface TableAssignmentPayload extends RealtimeBasePayload {
  session_id: string;
  table_id: string;
  is_primary: boolean;
  is_active: boolean;
}

// -----------------------------------------------------------------------------
// Session Event Payloads
// -----------------------------------------------------------------------------

export interface SessionEventPayload {
  id: string;
  session_id: string;
  event_type: SessionEventType;
  event_data: Record<string, unknown>;
  triggered_by_user_id: string | null;
  triggered_by_system: boolean;
  occurred_at: string;
  minutes_since_previous: number | null;
  notes: string | null;
  timestamp: number;
}

// -----------------------------------------------------------------------------
// Waitlist Payloads
// -----------------------------------------------------------------------------

export interface WaitlistEntryData {
  id: string;
  party_name: string;
  party_size: number;
  phone: string | null;
  email: string | null;
  status: WaitlistStatus;
  position_in_queue: number | null;
  quoted_wait_minutes: number | null;
  estimated_ready_at: string | null;
  preferred_section: string | null;
  seating_preference: string | null;
  notes: string | null;
  notification_count: number;
  created_at: string;
  notified_at: string | null;
  arrived_at: string | null;
  seated_at: string | null;
  seated_session_id: string | null;
}

export interface WaitlistPayload extends RealtimeBasePayload {
  waitlist: WaitlistEntryData;
}

// -----------------------------------------------------------------------------
// Order Payloads
// -----------------------------------------------------------------------------

export interface OrderSummaryData {
  id: string;
  order_number: string;
  display_number: string | null;
  status: OrderStatus;
  order_type: OrderType;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  customer_name: string | null;
  item_count: number;
}

export interface OrderPayload extends RealtimeBasePayload {
  order: OrderSummaryData;
  previous_status: OrderStatus | null;
}

// -----------------------------------------------------------------------------
// Payment Payloads
// -----------------------------------------------------------------------------

export interface PaymentData {
  id: string;
  order_id: string;
  amount: number;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  is_voided: boolean;
  card_type: string | null;
  card_last_four: string | null;
}

export interface PaymentPayload extends RealtimeBasePayload {
  payment: PaymentData;
  order: {
    id: string;
    order_number: string;
    total_amount: number;
    paid_amount: number;
    balance_due: number;
  };
}

// ============================================================================
// STATUS ENUMS
// ============================================================================

export type TableStatus =
  | 'available'
  | 'seated'
  | 'ordered'
  | 'served'
  | 'check_presented'
  | 'paid'
  | 'cleaning';

export type WaitlistStatus =
  | 'waiting'
  | 'notified'
  | 'arrived'
  | 'seated'
  | 'cancelled'
  | 'expired'
  | 'no_show';

export type OrderStatus =
  | 'draft'
  | 'open'
  | 'sent'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'voided';

export type OrderType =
  | 'dine_in'
  | 'takeout'
  | 'delivery'
  | 'quick_service';

export type CoursePacing = 'slow' | 'normal' | 'fast';

export type SessionEventType =
  | 'seated'
  | 'order_placed'
  | 'order_sent'
  | 'course_fired'
  | 'course_served'
  | 'check_requested'
  | 'check_presented'
  | 'payment_received'
  | 'payment_completed'
  | 'server_assigned'
  | 'table_transferred'
  | 'attention_flagged'
  | 'attention_cleared'
  | 'vip_flagged'
  | 'complaint_flagged'
  | 'note_added'
  | 'cleared';

export type PaymentMethod =
  | 'cash'
  | 'credit'
  | 'debit'
  | 'gift_card'
  | 'other';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'voided';

// ============================================================================
// CHANNEL STATE
// ============================================================================

export type ChannelState =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR';

export interface ChannelStatus {
  topic: RealtimeChannelTopic;
  state: ChannelState;
  lastError: Error | null;
  reconnectAttempts: number;
  subscribedAt: Date | null;
}

// ============================================================================
// HOOK OPTIONS & RETURN TYPES
// ============================================================================

export interface UseRealtimeChannelOptions<T> {
  topic: RealtimeChannelTopic;
  events: RealtimeEventType[];
  onMessage: (event: RealtimeEventType, payload: T) => void;
  onStatusChange?: (status: ChannelStatus) => void;
  enabled?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface UseRealtimeChannelReturn {
  status: ChannelStatus;
  reconnect: () => void;
  disconnect: () => void;
}

export interface UseFloorRealtimeOptions {
  locationId: string;
  enabled?: boolean;
  onSessionChange?: (payload: TableSessionPayload) => void;
  onTableAssignment?: (payload: TableAssignmentPayload) => void;
  onSessionEvent?: (payload: SessionEventPayload) => void;
  onOrderUpdate?: (payload: OrderPayload) => void;
}

export interface UseWaitlistRealtimeOptions {
  locationId: string;
  enabled?: boolean;
  onWaitlistChange?: (payload: WaitlistPayload) => void;
}

export interface UseOrdersRealtimeOptions {
  locationId: string;
  enabled?: boolean;
  onOrderChange?: (payload: OrderPayload) => void;
  onPaymentChange?: (payload: PaymentPayload) => void;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/** Union of all possible realtime payloads */
export type AnyRealtimePayload =
  | TableSessionPayload
  | TableAssignmentPayload
  | SessionEventPayload
  | WaitlistPayload
  | OrderPayload
  | PaymentPayload;

/** Channel topic builder helpers */
export const buildChannelTopic = {
  tables: (locationId: string): RealtimeChannelTopic =>
    `location:${locationId}:tables`,
  waitlist: (locationId: string): RealtimeChannelTopic =>
    `location:${locationId}:waitlist`,
  orders: (locationId: string): RealtimeChannelTopic =>
    `location:${locationId}:orders`,
  kitchen: (locationId: string): RealtimeChannelTopic =>
    `location:${locationId}:kitchen`,
  sessionEvents: (sessionId: string): RealtimeChannelTopic =>
    `session:${sessionId}:events`,
} as const;