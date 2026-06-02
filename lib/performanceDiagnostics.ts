export const ENABLE_ORDER_STORE_DIAGNOSTICS =
  __DEV__ && process.env.EXPO_PUBLIC_ORDER_STORE_DIAGNOSTICS === '1'

export function orderStoreDiagnosticLog (...args: unknown[]): void {
  if (ENABLE_ORDER_STORE_DIAGNOSTICS) console.log(...args)
}
