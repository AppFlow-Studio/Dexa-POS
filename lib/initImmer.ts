/**
 * Call once at app startup.
 * Note: enableArrayMethods does not exist in Immer 10.x (only enableMapSet, enablePatches).
 * Use original() and freeze() in producers for performance; the other optimizations remain valid.
 */
export function initImmer() {
  // no-op: enableArrayMethods was removed or never existed in Immer 10
}
