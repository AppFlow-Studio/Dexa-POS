import { NativeModules, Platform } from "react-native";

export interface SecondaryDisplayItem {
  name: string;
  quantity: number;
  cardPrice: number; // cents
  cashPrice: number; // cents
  cardLineTotal: number; // cents
  cashLineTotal: number; // cents
  modifiers: string[];
  notes: string | null;
}

export interface SecondaryDisplayData {
  screenState: string;
  restaurantName: string;
  orderNumber: string | null;
  orderType: string | null;
  guestCount: number | null;
  items: SecondaryDisplayItem[];
  cardSubtotal: number; // cents
  cashSubtotal: number; // cents
  discountAmount: number; // cents
  cardTax: number; // cents
  cashTax: number; // cents
  cardTotal: number; // cents
  cashTotal: number; // cents
  amountPaid: number; // cents
}

interface SecondaryDisplayNative {
  updateDisplay(data: SecondaryDisplayData): void;
  dismiss(): void;
}

const { SecondaryDisplayModule } = NativeModules as {
  SecondaryDisplayModule: SecondaryDisplayNative | undefined;
};

export function updateSecondaryDisplay(data: SecondaryDisplayData): void {
  if (Platform.OS !== "android" || !SecondaryDisplayModule) return;
  try {
    SecondaryDisplayModule.updateDisplay(data);
  } catch (e) {
    console.warn("[SecondaryDisplay] Failed to update:", e);
  }
}

export function dismissSecondaryDisplay(): void {
  if (Platform.OS !== "android" || !SecondaryDisplayModule) return;
  try {
    SecondaryDisplayModule.dismiss();
  } catch (e) {
    console.warn("[SecondaryDisplay] Failed to dismiss:", e);
  }
}
