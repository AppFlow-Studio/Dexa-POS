// types/customer.ts

export interface Customer {
    id: string;
    merchant_id: string;

    name: string | null;
    phone: string | null;
    email: string | null;
    address?: string | null;

    // Visit tracking
    last_visit: string | null;
    visits: number;

    // Order metrics (materialized)
    last_order_date: string | null;
    lifetime_spend: number;
    avg_spend: number;
    avg_tip_percent: number;
    total_orders: number;

    // Metadata
    tags: string[];
    notes: string | null;

    created_at: string;
    updated_at: string;
}

/**
 * Offline-aware customer shape for MMKV cache and queueing.
 * Optional fields keep compatibility with backend Customer rows.
 */
export interface CustomerWithMeta extends Customer {
    // For legacy UI fields
    phoneNumber?: string | null;

    // Offline metadata
    local_temp_id?: string;
    is_offline?: boolean;
    synced_at?: string | null;
}

export interface CustomerActivity {
    id: string;
    customer_id: string;
    merchant_id: string;
    activity_type: "order" | "refund" | "feedback" | "visit";
    related_order_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
}

export interface CustomerOrderChannel {
    channel: "pickup" | "dine_in" | "delivery";
    order_count: number;
    percentage: number;
}

export interface CustomerMostOrderedItem {
    item_id: string;
    item_name: string;
    order_count: number;
    total_quantity: number;
}

export interface CustomerProfile {
    customer: Customer;
    order_channels: CustomerOrderChannel[];
    most_ordered_items: CustomerMostOrderedItem[];
    recent_activity: CustomerActivity[];
}