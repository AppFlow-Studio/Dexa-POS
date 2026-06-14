let preWarmGeneration = 0

export function beginMenuModifierPreWarm (): number {
  preWarmGeneration += 1
  return preWarmGeneration
}

export function cancelMenuModifierPreWarm (): void {
  preWarmGeneration += 1
}

export function isMenuModifierPreWarmCurrent (generation: number): boolean {
  return generation === preWarmGeneration
}
