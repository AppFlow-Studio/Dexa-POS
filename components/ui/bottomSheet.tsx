/**
 * Bottom-sheet adapter — PanelSheet-backed.
 *
 * WHY THIS FILE IS THE ONE PLACE THAT CHANGES
 * Every sheet in the app imports from here. It used to `export *` from
 * `@expo/ui/community/bottom-sheet`, whose Android sheet is a Jetpack Compose
 * `ModalBottomSheet` — a separate native window that re-reveals the hidden Android
 * status/navigation bars the instant it opens. That is unfixable from JS.
 *
 * This adapter now maps the whole gorhom/Expo-UI-compatible surface onto
 * `components/ui/PanelSheet.tsx`, an in-tree Reanimated overlay that creates NO native
 * window (→ the immersive bars stay hidden). Call sites are unchanged — same names,
 * same `ref.present()/expand()/dismiss()` API, same child components.
 *
 * Notable mappings:
 *  - `BottomSheetModal` is a *deferred* modal (must not open on mount even with an
 *    `index` set — e.g. CashDrawerSheet mounts it with `index={1}`); it opens only via
 *    `ref.present()`. We enforce that with PanelSheet's `modal` prop.
 *  - `BottomSheetModalProvider` is a passthrough (PanelSheet renders through the root
 *    `<PortalHost/>`; no provider needed).
 *  - Backdrop/handle are inert shims (PanelSheet draws its own scrim + handle).
 *  - `BottomSheetFooter` content is pinned by PanelSheet via the `footerComponent` prop.
 */
import PanelSheet, {
  PanelSheetFlatList,
  PanelSheetScrollView,
  PanelSheetSectionList,
  PanelSheetTextInput,
  PanelSheetView,
  type BottomSheetMethods,
  type PanelSheetProps,
} from "@/components/ui/PanelSheet";
import * as React from "react";
import { FlatList, ScrollView, SectionList, TextInput, View } from "react-native";
// Legacy native path — kept only for the kill switch below; removed once the
// PanelSheet path is signed off on-device (drops the `@expo/ui` dependency too).
import NativeBottomSheet, {
  BottomSheetFlatList as NativeBottomSheetFlatList,
  BottomSheetModal as NativeBottomSheetModal,
  BottomSheetModalProvider as NativeBottomSheetModalProvider,
  BottomSheetScrollView as NativeBottomSheetScrollView,
  BottomSheetSectionList as NativeBottomSheetSectionList,
  BottomSheetTextInput as NativeBottomSheetTextInput,
  BottomSheetView as NativeBottomSheetView,
} from "@expo/ui/community/bottom-sheet";

/**
 * KILL SWITCH.
 *   true  → in-tree PanelSheet (immersive system bars stay hidden). DEFAULT.
 *   false → legacy native `@expo/ui` sheet (reveals the Android bars on open).
 * Flip and rebuild to fall back app-wide. Types always resolve to the PanelSheet
 * (permissive) surface regardless, so call sites keep compiling either way.
 */
const USE_PANEL_SHEET = true;

// ── Modal variant ───────────────────────────────────────────────────────────
// Deferred-present semantics via PanelSheet's `modal` (starts closed on mount, ignores
// `index` for initial visibility, opens to the `index` snap on `present()`).
const PanelSheetModal = React.forwardRef<BottomSheetMethods, PanelSheetProps>(
  function PanelSheetModal(props, ref) {
    return <PanelSheet ref={ref} {...props} modal />;
  },
);

// ── Top-level sheet components (typed against PanelSheet's permissive props so
//    call sites passing topInset / android_keyboardInputMode / footerComponent /
//    className type-check; the runtime value follows the kill switch) ──
const BottomSheet: typeof PanelSheet = USE_PANEL_SHEET
  ? PanelSheet
  : (NativeBottomSheet as any);
type BottomSheet = BottomSheetMethods;

const BottomSheetModal: typeof PanelSheetModal = USE_PANEL_SHEET
  ? PanelSheetModal
  : (NativeBottomSheetModal as any);
type BottomSheetModal = BottomSheetMethods;

// ── Provider: PanelSheet needs none (root PortalHost). Passthrough for API compat. ──
export const BottomSheetModalProvider: React.FC<{ children?: React.ReactNode }> =
  USE_PANEL_SHEET
    ? ({ children }) => <>{children}</>
    : (NativeBottomSheetModalProvider as any);

// ── Child components (plain RN under PanelSheet — they work in-tree) ──
export const BottomSheetView: typeof View = USE_PANEL_SHEET
  ? PanelSheetView
  : (NativeBottomSheetView as any);
export const BottomSheetScrollView: typeof ScrollView = USE_PANEL_SHEET
  ? PanelSheetScrollView
  : (NativeBottomSheetScrollView as any);
export const BottomSheetFlatList: typeof FlatList = USE_PANEL_SHEET
  ? PanelSheetFlatList
  : (NativeBottomSheetFlatList as any);
export const BottomSheetSectionList: typeof SectionList = USE_PANEL_SHEET
  ? PanelSheetSectionList
  : (NativeBottomSheetSectionList as any);
export const BottomSheetTextInput: typeof TextInput = USE_PANEL_SHEET
  ? PanelSheetTextInput
  : (NativeBottomSheetTextInput as any);

// ── Inert shims: PanelSheet renders its own scrim + drag handle ──
export const BottomSheetBackdrop: React.FC<any> = () => null;
export const BottomSheetHandle: React.FC<any> = () => null;

// Footer: PanelSheet pins the `footerComponent`; this renders the content inside it.
export const BottomSheetFooter: React.FC<any> = ({ children }) =>
  children ? <View>{children}</View> : null;

export default BottomSheet;
export { BottomSheet, BottomSheetModal };
export type { BottomSheetMethods };

// ── gorhom-compatible prop types (permissive; only a couple of call sites annotate) ──
export type BottomSheetDefaultFooterProps = {
  children?: React.ReactNode;
  style?: any;
  animatedFooterPosition?: { value: number };
  bottomInset?: number;
};
export type BottomSheetFooterProps = {
  animatedFooterPosition?: { value: number };
  [key: string]: any;
};
export type BottomSheetBackdropProps = {
  animatedIndex?: { value: number };
  animatedPosition?: { value: number };
  style?: any;
  [key: string]: any;
};
export type BottomSheetHandleProps = {
  animatedIndex?: { value: number };
  animatedPosition?: { value: number };
};
