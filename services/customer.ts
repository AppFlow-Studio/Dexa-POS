// services/customers.ts

import { isValidUUID, resolveToBackendId } from "@/lib/offlineIdRegistry";
import { getSyncJSON, setSyncJSON } from "@/lib/storage";
import { getIsOnline } from "@/services/offlineSyncService";
import {
    Customer,
    CustomerWithMeta
} from "@/types/customer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

const CUSTOMER_CACHE_KEY = "customers_cache";
const CUSTOMER_QUEUE_KEY = "customer_ops_queue";

type CustomerOperation =
    | {
        id: string;
        type: "create";
        payload: {
            local_temp_id: string;
            merchant_id: string;
            name: string | null;
            phone: string | null;
            email?: string | null;
            address?: string | null;
        };
    }
    | {
        id: string;
        type: "link";
        payload: {
            orderId: string;
            dbOrderId?: string | null;
            customerId: string;
            merchantId: string;
        };
    }
    | {
        id: string;
        type: "update";
        payload: {
            customer_id: string;
            updates: { name?: string | null; address?: string | null };
        };
    };

// -----------------------------------------------------------------------------
// Cache helpers (MMKV)
// -----------------------------------------------------------------------------

function readCache(): CustomerWithMeta[] {
    return getSyncJSON<CustomerWithMeta[]>(CUSTOMER_CACHE_KEY) ?? [];
}

function writeCache(customers: CustomerWithMeta[]): void {
    setSyncJSON(CUSTOMER_CACHE_KEY, customers);
}

function readQueue(): CustomerOperation[] {
    return getSyncJSON<CustomerOperation[]>(CUSTOMER_QUEUE_KEY) ?? [];
}

function writeQueue(ops: CustomerOperation[]): void {
    setSyncJSON(CUSTOMER_QUEUE_KEY, ops);
}

function upsertCacheCustomer(customer: CustomerWithMeta): CustomerWithMeta[] {
    const cache = readCache();
    const idx = cache.findIndex(
        (c) =>
            c.id === customer.id ||
            (c.local_temp_id && c.local_temp_id === customer.local_temp_id)
    );
    const normalized: CustomerWithMeta = {
        ...customer,
        phoneNumber: customer.phone ?? customer.phoneNumber ?? null,
    };
    if (idx >= 0) {
        cache[idx] = normalized;
    } else {
        cache.push(normalized);
    }
    writeCache(cache);
    return cache;
}

function resolveCustomerId(
    customerId: string,
    cache: CustomerWithMeta[]
): string | null {
    const match =
        cache.find(
            (c) =>
                c.id === customerId ||
                (c.local_temp_id && c.local_temp_id === customerId) ||
                c.phone === customerId
        ) ?? null;

    if (!match) return null;
    if (match.is_offline && match.local_temp_id && match.id === match.local_temp_id)
        return null; // not yet synced
    return match.id;
}

// -----------------------------------------------------------------------------
// Public helpers
// -----------------------------------------------------------------------------

export function getCachedCustomers(): CustomerWithMeta[] {
    return readCache();
}

export async function fetchAndCacheCustomers(
    supabase: SupabaseClient,
    merchantId: string
): Promise<CustomerWithMeta[]> {
    const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("last_order_date", { ascending: false, nullsFirst: true })
        .limit(200);

    if (error) throw error;

    const normalized = (data ?? []).map((c) => ({
        ...c,
        phoneNumber: c.phone,
        is_offline: false,
        synced_at: new Date().toISOString(),
    }));

    // Preserve any offline customers not yet synced
    const offline = readCache().filter((c) => c.is_offline);
    writeCache(mergeCustomers(normalized, offline));
    return readCache();
}

function mergeCustomers(
    primary: CustomerWithMeta[],
    secondary: CustomerWithMeta[]
): CustomerWithMeta[] {
    const merged = [...primary];
    secondary.forEach((s) => {
        const idx = merged.findIndex(
            (c) =>
                c.id === s.id ||
                (c.local_temp_id && s.local_temp_id && c.local_temp_id === s.local_temp_id)
        );
        if (idx === -1) merged.push(s);
    });
    return merged;
}

export function createCustomerOffline(input: {
    merchantId: string;
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
}): CustomerWithMeta {
    const tempId = `local_customer_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    const now = new Date().toISOString();
    const customer: CustomerWithMeta = {
        id: tempId,
        local_temp_id: tempId,
        is_offline: true,
        synced_at: null,
        merchant_id: input.merchantId,
        name: input.name || null,
        phone: input.phone || null,
        phoneNumber: input.phone || null,
        email: input.email || null,
        address: input.address || null,
        last_visit: null,
        visits: 0,
        last_order_date: null,
        lifetime_spend: 0,
        avg_spend: 0,
        avg_tip_percent: 0,
        total_orders: 0,
        tags: [],
        notes: null,
        created_at: now,
        updated_at: now,
    };

    upsertCacheCustomer(customer);

    const queue = readQueue();
    queue.push({
        id: uuidv4(),
        type: "create",
        payload: {
            local_temp_id: tempId,
            merchant_id: input.merchantId,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            address: customer.address || null,
        },
    });
    writeQueue(queue);
    return customer;
}

export async function createCustomerOnline(
    supabase: SupabaseClient,
    input: {
        merchantId: string;
        name?: string;
        phone?: string;
        email?: string;
        address?: string;
    }
): Promise<CustomerWithMeta> {
    const { data, error } = await supabase
        .from("customers")
        .insert({
            merchant_id: input.merchantId,
            phone: input.phone || null,
            name: input.name || null,
            email: input.email || null,
            address: input.address || null,
            visits: 0,
            lifetime_spend: 0,
            total_orders: 0,
        })
        .select()
        .single();

    if (error) throw error;
    const customer: CustomerWithMeta = {
        ...data,
        phoneNumber: data.phone,
        is_offline: false,
        synced_at: new Date().toISOString(),
    };
    upsertCacheCustomer(customer);
    return customer;
}

export function queueLinkCustomerToOrder(params: {
    orderId: string;
    dbOrderId?: string | null;
    customerId: string;
    merchantId: string;
}): void {
    const queue = readQueue();
    // Only enqueue a backend order ID if it is a UUID; otherwise wait for mapping resolution
    const resolvedFromMapping = resolveToBackendId(params.orderId);
    const sanitizedDbOrderId =
        (params.dbOrderId && isValidUUID(params.dbOrderId))
            ? params.dbOrderId
            : (resolvedFromMapping && isValidUUID(resolvedFromMapping)
                ? resolvedFromMapping
                : null);
    queue.push({
        id: uuidv4(),
        type: "link",
        payload: {
            orderId: params.orderId,
            dbOrderId: sanitizedDbOrderId,
            customerId: params.customerId,
            merchantId: params.merchantId,
        },
    });
    writeQueue(queue);
}

/**
 * Process queued customer operations (create, then link).
 * Call when network is available, ideally before order completion syncs
 * so Supabase triggers receive the correct customer_id.
 */
export async function processCustomerQueue(
    supabase: SupabaseClient
): Promise<void> {
    if (!getIsOnline()) return;
    console.log("[CustomerQueue] processCustomerQueue");
    let queue = readQueue();
    let cache = readCache();
    const remaining: CustomerOperation[] = [];

    // 1) Handle creates first to obtain backend IDs
    for (const op of queue) {
        console.log("[CustomerQueue] processing op", op.type, op.payload);
        if (op.type !== "create") continue;
        try {
            const { payload } = op;
            const { data, error } = await supabase
                .from("customers")
                .insert({
                    merchant_id: payload.merchant_id,
                    name: payload.name,
                    phone: payload.phone,
                    email: payload.email ?? null,
                    address: payload.address ?? null,
                    visits: 0,
                    lifetime_spend: 0,
                    total_orders: 0,
                })
                .select()
                .single();

            if (error) throw error;

            // Update cache: swap local temp ID with backend ID
            cache = cache.map((c) => {
                if (
                    c.local_temp_id === payload.local_temp_id ||
                    c.id === payload.local_temp_id
                ) {
                    return {
                        ...data,
                        phoneNumber: data.phone,
                        is_offline: false,
                        local_temp_id: payload.local_temp_id,
                        synced_at: new Date().toISOString(),
                    };
                }
                return c;
            });

            // Update pending link ops to use the new backend ID
            queue = queue.map((q) =>
                q.type === "link" && q.payload.customerId === payload.local_temp_id
                    ? {
                        ...q,
                        payload: { ...q.payload, customerId: data.id },
                    }
                    : q
            );
        } catch (err) {
            console.warn("[CustomerQueue] Failed to create customer:", err);
            remaining.push(op); // retry later
        }
    }

    // 2) Handle updates
    for (const op of queue) {
        if (op.type !== "update") continue;
        const resolvedId = resolveCustomerId(op.payload.customer_id, cache);
        if (!resolvedId || !isValidUUID(resolvedId)) {
            remaining.push(op);
            continue;
        }
        try {
            await updateCustomer(resolvedId, op.payload.updates, supabase);
        } catch (err) {
            console.warn("[CustomerQueue] Failed to update customer:", err);
            remaining.push(op);
        }
    }

    // 3) Handle link operations
    for (const op of queue) {
        if (op.type !== "link") continue;
        const resolvedId = resolveCustomerId(op.payload.customerId, cache);
        if (!resolvedId) {
            remaining.push(op); // still offline customer
            continue;
        }

        // Resolve to a backend order ID; if still missing or invalid, keep in queue
        const resolvedDbOrderId = (() => {
            if (op.payload.dbOrderId && isValidUUID(op.payload.dbOrderId)) {
                return op.payload.dbOrderId;
            }
            const mapped = resolveToBackendId(op.payload.orderId);
            if (mapped && isValidUUID(mapped)) {
                return mapped;
            }
            return null;
        })();

        if (!resolvedDbOrderId) {
            console.warn(
                "[CustomerQueue] Skipping link; backend order ID not yet available",
                op.payload
            );
            remaining.push(op);
            continue;
        }

        try {
            const { error } = await supabase
                .from("orders")
                .update({ customer_id: resolvedId })
                .eq("id", resolvedDbOrderId)
                .eq("merchant_id", op.payload.merchantId);

            if (error) throw error;
            // success: do not requeue
        } catch (err) {
            console.warn("[CustomerQueue] Failed to link customer:", err,);
            remaining.push(op);
        }
    }

    writeCache(cache);
    writeQueue(remaining);
}

/**
 * Attach customer to order. If offline, queue and return.
 */
export async function linkCustomerToOrder(
    supabase: SupabaseClient,
    params: {
        orderId: string;
        dbOrderId?: string | null;
        customerId: string;
        merchantId: string;
    }
): Promise<void> {
    queueLinkCustomerToOrder(params);
    if (getIsOnline()) {
        await processCustomerQueue(supabase);
    }
}

// -----------------------------------------------------------------------------
// Update helpers
// -----------------------------------------------------------------------------

export function updateCustomerLocal(
    customerId: string,
    updates: { name?: string | null; address?: string | null }
): void {
    const cache = readCache();
    const idx = cache.findIndex((c) => c.id === customerId);
    if (idx >= 0) {
        cache[idx] = { ...cache[idx], ...updates, updated_at: new Date().toISOString() };
        writeCache(cache);
    }
    const queue = readQueue();
    queue.push({
        id: uuidv4(),
        type: "update",
        payload: { customer_id: customerId, updates },
    });
    writeQueue(queue);
}

export async function updateCustomerInfo(
    customerId: string,
    updates: { name?: string | null; address?: string | null },
    supabase: SupabaseClient
): Promise<void> {
    updateCustomerLocal(customerId, updates);

    if (getIsOnline() && isValidUUID(customerId)) {
        try {
            await updateCustomer(customerId, updates, supabase);
        } catch (err) {
            console.warn("[Customer] Online update failed, queued for retry:", err);
        }
    }
}

// -----------------------------------------------------------------------------
// Debug helper: clear customer cache/queue (use only when needed)
// -----------------------------------------------------------------------------
export function clearCustomerCacheAndQueue(): void {
    writeCache([]);
    writeQueue([]);
}

// -----------------------------------------------------------------------------
// Existing API (remote helpers remain available)
// -----------------------------------------------------------------------------

export async function findOrCreateCustomer(
    supabase: SupabaseClient,
    phone: string,
    merchantId: string,
    name?: string
): Promise<Customer> {
    const { data: existing } = await supabase
        .from("customers")
        .select("*")
        .eq("merchant_id", merchantId)
        .eq("phone", phone)
        .maybeSingle();

    if (existing) {
        upsertCacheCustomer({ ...existing, phoneNumber: existing.phone });
        return existing;
    }

    const created = await createCustomerOnline(supabase, {
        merchantId,
        phone,
        name,
    });
    return created;
}

export async function attachCustomerToOrder(
    orderId: string,
    customerId: string,
    supabase: SupabaseClient
): Promise<void> {
    await linkCustomerToOrder(supabase, {
        orderId,
        customerId,
        dbOrderId: orderId,
        merchantId: "", // optional here; not used in legacy path
    });
}

export async function searchCustomers(
    query: string,
    supabase: SupabaseClient
): Promise<Customer[]> {
    const { data, error } = await supabase
        .from("customers")
        .select("*")
        .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
        .order("last_order_date", { ascending: false, nullsFirst: false })
        .limit(20);

    if (error) throw error;
    return data;
}

export async function getTopCustomers(
    limit = 10,
    supabase: SupabaseClient
): Promise<Customer[]> {
    const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("lifetime_spend", { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data;
}

export async function updateCustomer(
    customerId: string,
    updates: Partial<Customer>,
    supabase: SupabaseClient
): Promise<Customer> {
    const { data, error } = await supabase
        .from("customers")
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq("id", customerId)
        .select()
        .single();

    if (error) throw error;
    if (data) {
        upsertCacheCustomer({ ...data, phoneNumber: data.phone });
    }
    return data;
}