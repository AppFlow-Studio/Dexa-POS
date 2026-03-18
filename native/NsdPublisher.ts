// native/NsdPublisher.ts
// JS bridge for Android NSD service registration (POS side)
import { NativeModules, Platform } from "react-native";

interface NsdPublisherNative {
  register(
    port: number,
    metadata: {
      stationId: string;
      stationName: string;
      locationId: string;
      locationName: string;
    },
  ): Promise<boolean>;
  unregister(): Promise<boolean>;
}

const { NsdPublisher: NsdPublisherModule } = NativeModules as {
  NsdPublisher: NsdPublisherNative | undefined;
};

export const NsdPublisher = {
  register: (
    port: number,
    metadata: {
      stationId: string;
      stationName: string;
      locationId: string;
      locationName: string;
    },
  ): Promise<boolean> => {
    if (Platform.OS !== "android" || !NsdPublisherModule) {
      return Promise.resolve(false);
    }
    return NsdPublisherModule.register(port, metadata);
  },

  unregister: (): Promise<boolean> => {
    if (Platform.OS !== "android" || !NsdPublisherModule) {
      return Promise.resolve(false);
    }
    return NsdPublisherModule.unregister();
  },
};
