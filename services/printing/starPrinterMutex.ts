// services/printing/starPrinterMutex.ts
// Shared per-printer mutex to prevent concurrent Star SDK open() calls.
// The Star SDK (react-native-star-io10) only allows one connection at a time
// per printer. If two callers (e.g. health check + print job) call open()
// simultaneously, the SDK throws "Printer is used by another device".

import { Mutex } from "async-mutex";

const mutexes = new Map<string, Mutex>();

/**
 * Returns a shared Mutex for the given printer network address.
 * All Star SDK operations (health checks, print jobs, status queries)
 * targeting the same printer should run inside this mutex.
 */
export function getStarPrinterMutex(networkAddress: string): Mutex {
  let mutex = mutexes.get(networkAddress);
  if (!mutex) {
    mutex = new Mutex();
    mutexes.set(networkAddress, mutex);
  }
  return mutex;
}
