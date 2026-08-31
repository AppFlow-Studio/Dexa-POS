// services/customers.ts

import {
    CUSTOMER_FETCH_LIMIT,
    writeCustomersSnapshot,
    type ServerCustomer,
} from "@/lib/db/descriptors/customers";
import {
    searchLocalCustomers,
    topLocalCustomers,
} from "@/lib/db/customersQuery";
import { stationKind } from "@/lib/db/policy";
import { isValidUUID, resolveToBackendId } from "@/lib/offlineIdRegistry";
import { getSyncJSON, setSyncJSON } from "@/lib/storage";
import { getIsOnline } from "@/services/offlineSyncService";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
    Customer,
    CustomerWithMeta
} from "@/types/customer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

const CUSTOMER_CACHE_KEY = "customers_cache";
const CUSTOMER_QUEUE_KEY = "customer_ops_queue";

/**
 * Phase 5 — when set, the directory is read from the SQLite mirror instead of
 * the MMKV cache. Off: today's 200-row cache path, unchanged.
 */
const LOCAL_CUSTOMERS_ENABLED =
    process.env.EXPO_PUBLIC_LOCAL_CUSTOMERS === "1";

/**
 * What the MMKV cache still holds once the mirror exists.
 *
 * It stops being the directory and becomes the fallback + the home of
 * offline-pending creates, so it keeps the old 200-row footprint rather than
 * growing to the mirror's 5,000. Writing 5,000 customers through MMKV on every
 * fetch would pay the serialization cost twice for a list nothing reads while
 * the mirror is healthy.
 */
const MMKV_CACHE_LIMIT = 200;

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
        // Phase 5: was a hard 200, which is why a customer who last visited a
        // few months ago at a busy location could not be found — online or
        // offline. The limit and the mirror's retention cap are the same
        // number by construction; see CUSTOMER_FETCH_LIMIT.
        .limit(CUSTOMER_FETCH_LIMIT);

    if (error) throw error;

    const normalized = (data ?? []).map((c) => ({
        ...c,
        phoneNumber: c.phone,
        is_offline: false,
        synced_at: new Date().toISOString(),
    }));

    // Mirror the directory at the seam where the payload has already arrived —
    // one fetch, one cadence, no duplicated round trip. Fire-and-forget: a
    // mirror failure costs the next screen's offline paint, never the list
    // being returned right now.
    if (LOCAL_CUSTOMERS_ENABLED && data?.length) {
        const { selectedStore, selectedStation } =
            useStoreSettingsStore.getState();
        if (selectedStore?.id) {
            void writeCustomersSnapshot(
                stationKind(selectedStation?.station_type),
                selectedStore.id,
                data as ServerCustomer[]
            );
        }
    }

    // The MMKV cache stays the fallback path and keeps holding offline creates.
    // It is deliberately still capped by what one fetch returns — it is not
    // trying to be the directory any more, the mirror is.
    const offline = readCache().filter((c) => c.is_offline);
    writeCache(mergeCustomers(normalized.slice(0, MMKV_CACHE_LIMIT), offline));
    return readCache();
}

/**
 * The customer directory for a type-ahead, from the mirror when it is
 * available and the MMKV cache when it is not.
 *
 * `query` narrows the mirror to a SUPERSET of what any one screen matches on
 * (name, phone, address) — every caller still runs its own filter over the
 * result, so per-screen matching semantics are untouched. See
 * lib/db/customersQuery.ts for why the split is drawn there.
 *
 * OFFLINE-PENDING CUSTOMERS ARE MERGED ON TOP, and that is not a nicety. A
 * customer created while offline exists only in the MMKV queue until it syncs;
 * if the directory came from the mirror alone, the customer an operator just
 * created would vanish from the list they created it in. They are merged
 * unconditionally rather than filtered by `query`, because there are at most a
 * handful and the caller's own filter will narrow them correctly anyway.
 */
export async function loadCustomerDirectory(
    query?: string
): Promise<CustomerWithMeta[]> {
    const pending = readCache().filter((c) => c.is_offline);

    if (!LOCAL_CUSTOMERS_ENABLED) return readCache();

    const locationId = useStoreSettingsStore.getState().selectedStore?.id;
    if (!locationId) return readCache();

    let mirrored: ServerCustomer[] | null = null;
    try {
        mirrored = await searchLocalCustomers({ locationId, query });
    } catch {
        mirrored = null;
    }
    // Null means the DB is not open; empty means it is open and holds nothing
    // for this location yet (no fetch has landed). Both fall back — an empty
    // directory is exactly the blank list this mirror exists to prevent.
    if (!mirrored || mirrored.length === 0) return readCache();

    const normalized: CustomerWithMeta[] = mirrored.map((c) => ({
        ...(c as unknown as CustomerWithMeta),
        phoneNumber: (c.phone as string | null) ?? null,
        is_offline: false,
    }));

    return mergeCustomers(normalized, pending);
}

/**
 * The busiest customers, straight from SQL.
 *
 * Falls back to sorting the MMKV cache — which is what every caller used to
 * do, and which made this "the top N of the most recent 200" rather than the
 * top N.
 */
export async function loadTopCustomers(
    limit = 3
): Promise<CustomerWithMeta[]> {
    const fallback = () =>
        [...readCache()]
            .filter((c) => (c.total_orders ?? 0) > 0)
            .sort((a, b) => (b.total_orders ?? 0) - (a.total_orders ?? 0))
            .slice(0, limit);

    if (!LOCAL_CUSTOMERS_ENABLED) return fallback();
    const locationId = useStoreSettingsStore.getState().selectedStore?.id;
    if (!locationId) return fallback();

    try {
        const rows = await topLocalCustomers(locationId, limit);
        if (!rows || rows.length === 0) return fallback();
        return rows.map((c) => ({
            ...(c as unknown as CustomerWithMeta),
            phoneNumber: (c.phone as string | null) ?? null,
            is_offline: false,
        }));
    } catch {
        return fallback();
    }
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