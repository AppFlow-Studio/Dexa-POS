// services/printing/starPrintActivity.ts
// Tracks the timestamp of the last successful Star SDK operation per network
// address. Used by the health-check loop to avoid redundant `open()` probes
// immediately after a real print job (the printer is demonstrably reachable,
// and an extra probe risks a TCP-backlog collision with a peer device).

const lastSuccessByAddress = new Map<string, number>();

export function recordStarSuccess(networkAddress: string): void {
  lastSuccessByAddress.set(networkAddress, Date.now());
}

export function getLastStarSuccess(networkAddress: string): number {
  return lastSuccessByAddress.get(networkAddress) ?? 0;
}

export function clearStarActivity(networkAddress: string): void {
  lastSuccessByAddress.delete(networkAddress);
}
