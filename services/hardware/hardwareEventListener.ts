import { EmitterSubscription } from 'react-native';
import { hardwareEvents, HardwareDetectionResult } from '@/native/HardwareDetection';

type HardwareChangeCallback = (result: HardwareDetectionResult) => void;

let subscription: EmitterSubscription | null = null;

export function startListening(onChange: HardwareChangeCallback): void {
  if (!hardwareEvents || subscription) return;
  subscription = hardwareEvents.addListener('onHardwareChanged', onChange);
}

export function stopListening(): void {
  subscription?.remove();
  subscription = null;
}
