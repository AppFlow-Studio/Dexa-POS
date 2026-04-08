// native/NsdDiscovery.ts
// JS bridge for Android NSD service discovery (CFD client side)
import { NativeEventEmitter, NativeModules, Platform } from "react-native";

interface NsdDiscoveryNative {
  startDiscovery(): Promise<boolean>;
  stopDiscovery(): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export interface NsdServiceInfo {
  serviceName: string;
  ip: string;
  port: number;
  stationId: string;
  stationName: string;
  locationId: string;
  locationName: string;
}

const { NsdDiscovery: NsdDiscoveryModule } = NativeModules as {
  NsdDiscovery: NsdDiscoveryNative | undefined;
};

export const nsdDiscoveryEvents =
  Platform.OS === "android" && NsdDiscoveryModule
    ? new NativeEventEmitter(NativeModules.NsdDiscovery)
    : null;

export const NsdDiscovery = {
  startDiscovery: (): Promise<boolean> => {
    if (Platform.OS !== "android" || !NsdDiscoveryModule) {
      return Promise.resolve(false);
    }
    return NsdDiscoveryModule.startDiscovery();
  },

  stopDiscovery: (): Promise<boolean> => {
    if (Platform.OS !== "android" || !NsdDiscoveryModule) {
      return Promise.resolve(false);
    }
    return NsdDiscoveryModule.stopDiscovery();
  },
};
