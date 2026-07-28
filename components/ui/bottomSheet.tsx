/**
 * gorhom → Expo UI bottom-sheet adapter.
 *
 * `@gorhom/bottom-sheet` has NO Reanimated-4 support on RN 0.86 + Fabric — its
 * sheets never open (upstream issues #2546 / #2592 / #2600 / #2613, all still
 * open with no release). Every sheet in the app is routed through Expo UI's
 * native community drop-in instead (`@expo/ui/community/bottom-sheet` — Jetpack
 * Compose ModalBottomSheet on Android, SwiftUI on iOS).
 *
 * Expo UI's API is deliberately gorhom-name-compatible (`BottomSheetModal`,
 * `BottomSheetModalProvider`, `BottomSheetView`, `BottomSheetScrollView`,
 * `BottomSheetFlatList`, `BottomSheetSectionList`, `BottomSheetTextInput`,
 * `useBottomSheet`, `ref.present()/dismiss()`), so call sites work unchanged.
 *
 * The only gorhom exports Expo UI doesn't provide are the custom
 * backdrop/handle/footer components — the native modal supplies its own scrim
 * and handle, so we shim them as no-ops for compile compatibility. A sheet's
 * dismiss-on-outside-tap is controlled by `enablePanDownToClose` (maps to the
 * native `shouldDismissOnClickOutside`), not by the (now inert) backdrop.
 */
import * as React from "react";
import { View } from "react-native";

export * from "@expo/ui/community/bottom-sheet";
export { default } from "@expo/ui/community/bottom-sheet";

// ── Shims for gorhom exports Expo UI omits (native modal handles these) ──
// Backdrop: native ModalBottomSheet renders its own scrim. Any `backdropComponent`
// / inline `<BottomSheetBackdrop>` becomes inert (Expo UI ignores the prop).
export const BottomSheetBackdrop: React.FC<any> = () => null;

// Handle: native modal draws its own drag handle (suppress with handleComponent={null}).
export const BottomSheetHandle: React.FC<any> = () => null;

// Footer: no native equivalent. Render children inline so footer content isn't lost.
export const BottomSheetFooter: React.FC<any> = ({ children }) =>
  children ? <View>{children}</View> : null;

// gorhom's default-footer props type (footer is shimmed above; permissive shape).
export type BottomSheetDefaultFooterProps = {
  children?: React.ReactNode;
  style?: any;
  animatedFooterPosition?: { value: number };
  bottomInset?: number;
};
