import { NativeModules, Platform } from "react-native";

interface SecondaryDisplayNative {
  show(): void;
  dismiss(): void;
}

const { SecondaryDisplayModule } = NativeModules as {
  SecondaryDisplayModule: SecondaryDisplayNative | undefined;
};

/** Create & show the Presentation with a ReactRootView rendering "CFDSecondaryDisplay". */
export function showSecondaryDisplay(): void {
  if (Platform.OS !== "android" || !SecondaryDisplayModule) return;
  try {
    SecondaryDisplayModule.show();
  } catch (e) {
    console.warn("[SecondaryDisplay] Failed to show:", e);
  }
}

/** Dismiss the secondary display Presentation. */
export function dismissSecondaryDisplay(): void {
  if (Platform.OS !== "android" || !SecondaryDisplayModule) return;
  try {
    SecondaryDisplayModule.dismiss();
  } catch (e) {
    console.warn("[SecondaryDisplay] Failed to dismiss:", e);
  }
}
