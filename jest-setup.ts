/**
 * Jest Setup File for Dexa-POS
 *
 * This file runs BEFORE each test file executes.
 * Use it for:
 * - Mocking React Native/Expo APIs that don't work in Node.js
 * - Setting up global test utilities
 * - Adding custom Jest matchers
 *
 * How it works:
 * 1. Jest loads this file first (via setupFilesAfterEnv in jest.config.js)
 * 2. Mocks replace real implementations of native modules
 * 3. Your test files run with these mocks in place
 */

// Optional: Install @testing-library/jest-native for enhanced matchers
// import "@testing-library/jest-native/extend-expect";

// ============================================================================
// REACT NATIVE MOCKS
// ============================================================================

/**
 * Mock react-native-mmkv (used by your stores)
 * MMKV is a native module - it won't work in Jest's Node environment
 */
jest.mock("react-native-mmkv", () => {
  const createInstance = () => ({
    // Native `size` (allocated bytes) is read by the storage monitor; without
    // it every comparison silently comes out `undefined > n === false`.
    size: 0,
    getString: jest.fn(),
    getBoolean: jest.fn(),
    getNumber: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    contains: jest.fn(),
    getAllKeys: jest.fn(() => []),
    clearAll: jest.fn(),
  });
  return {
    MMKV: jest.fn().mockImplementation(createInstance),
    createMMKV: jest.fn().mockImplementation(createInstance),
  };
});

/**
 * Mock expo-secure-store
 * SecureStore uses native keychain - not available in Node
 */
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

/**
 * Mock @react-native-async-storage/async-storage
 * Used as a fallback storage mechanism
 */
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

/**
 * Mock @react-native-community/netinfo
 * Network detection doesn't work in Jest
 */
jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() =>
    Promise.resolve({
      isConnected: true,
      isInternetReachable: true,
    })
  ),
}));

/**
 * Mock @supabase/supabase-js
 * We don't want real API calls in unit tests
 */
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
    })),
    rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(() => ({ status: "SUBSCRIBED" })),
      unsubscribe: jest.fn(),
    })),
  })),
}));

/**
 * Mock expo-haptics
 * Haptic feedback is native-only
 */
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
    Heavy: "heavy",
  },
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

/**
 * Mock react-native-reanimated
 * Animations use native modules
 */
jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  Reanimated.default.call = () => {};
  return Reanimated;
});

/**
 * Mock @sentry/react-native
 * Native bridge unavailable in Jest; we just want the API surface.
 */
jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setContext: jest.fn(),
  setTag: jest.fn(),
  setUser: jest.fn(),
  reactNavigationIntegration: jest.fn(() => ({})),
  metrics: {
    distribution: jest.fn(),
    gauge: jest.fn(),
    increment: jest.fn(),
  },
}));

// ============================================================================
// GLOBAL TEST UTILITIES
// ============================================================================

/**
 * Silence console warnings during tests (optional)
 * Uncomment if you want cleaner test output
 */
// const originalWarn = console.warn;
// beforeAll(() => {
//   console.warn = (...args) => {
//     if (args[0]?.includes('Expected')) return; // Filter specific warnings
//     originalWarn.apply(console, args);
//   };
// });
// afterAll(() => {
//   console.warn = originalWarn;
// });

/**
 * Reset all mocks after each test for isolation
 * This ensures one test doesn't affect another
 */
afterEach(() => {
  jest.clearAllMocks();
});

// ============================================================================
// CUSTOM MATCHERS (Optional)
// ============================================================================

/**
 * Example: Custom matcher for currency values
 * Uncomment and modify if you want custom assertions
 */
// expect.extend({
//   toBeValidCurrency(received) {
//     const pass = typeof received === 'number' &&
//                  !isNaN(received) &&
//                  Number.isFinite(received) &&
//                  Math.round(received * 100) === received * 100;
//     return {
//       pass,
//       message: () => `expected ${received} to be a valid currency value (2 decimal places)`,
//     };
//   },
// });
