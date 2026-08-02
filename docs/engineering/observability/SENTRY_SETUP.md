# Sentry Integration Guide

Step-by-step instructions for adding crash reporting, performance tracing, and session replay to Dexa-POS via `@sentry/react-native`.

---

## 1. Install the SDK

```bash
npx expo install @sentry/react-native
```

For EAS builds, Sentry's Expo plugin handles source-map uploads automatically.

---

## 2. Create a Sentry project

1. Go to [sentry.io](https://sentry.io) → **Projects → Create Project → React Native**.
2. Copy the DSN.
3. Add it to `.env`:

```
EXPO_PUBLIC_SENTRY_DSN=https://xxxxx@oXXXX.ingest.sentry.io/XXXXX
```

---

## 3. Add the Expo plugin

In `app.json` (or `app.config.ts`):

```json
{
  "expo": {
    "plugins": [
      [
        "@sentry/react-native/expo",
        {
          "organization": "appflow-studios",
          "project": "dexa-pos"
        }
      ]
    ]
  }
}
```

This handles:
- Source map uploads during EAS Build
- Native crash symbolication
- ProGuard / dSYM upload

---

## 4. Create `lib/sentry.ts`

```typescript
import * as Sentry from "@sentry/react-native";

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";

let _initialized = false;

export function initSentry(): void {
  if (_initialized || !SENTRY_DSN) {
    if (!SENTRY_DSN && !__DEV__) {
      console.warn("[Sentry] No DSN configured — skipping initialization");
    }
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    debug: __DEV__,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    profilesSampleRate: __DEV__ ? 1.0 : 0.1,
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30_000,
    environment: __DEV__ ? "development" : "production",
    beforeSend(event) {
      // Drop events in dev to avoid noise
      if (__DEV__) return null;
      return event;
    },
  });

  _initialized = true;
}

export function isSentryInitialized(): boolean {
  return _initialized;
}

export { Sentry };
```

---

## 5. Initialize in the root layout

In `app/_layout.tsx`:

```typescript
import { initSentry, Sentry } from "@/lib/sentry";

// Call at module level, before any component code
initSentry();

// Change `export default function RootLayout()` to:
function RootLayout() { ... }

// Wrap at the bottom of the file:
export default Sentry.wrap(RootLayout);
```

---

## 6. Connect the structured logger

In your app init (e.g. `_layout.tsx` or a boot file), wire Sentry breadcrumbs into the logger:

```typescript
import { logger } from "@/lib/logger";
import { Sentry, isSentryInitialized } from "@/lib/sentry";

logger.onLog = (level, category, message, data) => {
  if (!isSentryInitialized()) return;

  const sentryLevel =
    level === "debug" ? "debug" :
    level === "info"  ? "info" :
    level === "warn"  ? "warning" :
    "error";

  Sentry.addBreadcrumb({
    category,
    message,
    level: sentryLevel as any,
    data,
  });
};
```

---

## 7. Update ProductionErrorBoundary

In `components/ErrorBoundary.tsx`, replace the `componentDidCatch` TODO:

```typescript
componentDidCatch(error: Error, info: React.ErrorInfo) {
  Sentry.withScope((scope) => {
    scope.setTag("error_boundary", this.props.section);
    scope.setExtra("componentStack", info.componentStack);
    Sentry.captureException(error);
  });
}
```

---

## 8. Custom performance metrics

Track key POS metrics via Sentry custom measurements:

```typescript
// Order creation latency
const txn = Sentry.startTransaction({ name: "order.create" });
// ... create order ...
txn.finish();

// Or use custom metrics (Sentry SDK v5+)
Sentry.metrics.distribution("sync_queue_depth", queueDepth);
Sentry.metrics.distribution("store_size_orders", orderCount);
```

Suggested metrics:
- `order_create_latency_ms`
- `sync_queue_depth`
- `sync_operation_latency_ms`
- `store_size_orders`
- `mmkv_write_latency_ms`
- `table_transition_count`

---

## 9. Wrap critical UI sections

Add `ProductionErrorBoundary` around the key sections:

```tsx
<ProductionErrorBoundary section="order-panel">
  <OrderPanel />
</ProductionErrorBoundary>

<ProductionErrorBoundary section="payment-flow">
  <PaymentView />
</ProductionErrorBoundary>

<ProductionErrorBoundary section="table-view">
  <TablesView />
</ProductionErrorBoundary>

<ProductionErrorBoundary section="kds-grid">
  <KDSGrid />
</ProductionErrorBoundary>
```

---

## 10. EAS Build configuration

For source maps to work, add Sentry auth token to EAS secrets:

```bash
eas secret:create --name SENTRY_AUTH_TOKEN --value "sntrys_..."
eas secret:create --name SENTRY_ORG --value "your-org"
eas secret:create --name SENTRY_PROJECT --value "dexa-pos"
```

The `@sentry/react-native/expo` plugin reads these automatically during builds.

---

## Checklist

- [ ] Install `@sentry/react-native`
- [ ] Add Expo plugin to `app.json`
- [ ] Create `lib/sentry.ts`
- [ ] Call `initSentry()` in `_layout.tsx`
- [ ] Wrap `RootLayout` with `Sentry.wrap()`
- [ ] Wire `logger.onLog` to Sentry breadcrumbs
- [ ] Update `ProductionErrorBoundary.componentDidCatch`
- [ ] Add EAS secrets for source maps
- [ ] Test in a `preview` build (Sentry skips `__DEV__`)
