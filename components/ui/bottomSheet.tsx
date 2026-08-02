/**
 * Bottom-sheet adapter — PanelSheet-backed.
 *
 * WHY THIS FILE IS THE ONE PLACE THAT CHANGES
 * Every sheet in the app imports from here. It maps the whole gorhom-compatible
 * surface onto `components/ui/PanelSheet.tsx`, an in-tree Reanimated overlay that
 * creates NO native window (→ the immersive Android bars stay hidden). Call sites
 * are unchanged — same names, same `ref.present()/expand()/dismiss()` API, same
 * child components.
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

// ── Modal variant ───────────────────────────────────────────────────────────
// Deferred-present semantics via PanelSheet's `modal` (starts closed on mount, ignores
// `index` for initial visibility, opens to the `index` snap on `present()`).
const PanelSheetModal = React.forwardRef<BottomSheetMethods, PanelSheetProps>(
  function PanelSheetModal(props, ref) {
    return <PanelSheet ref={ref} {...props} modal />;
  },
);

// ── Top-level sheet components (PanelSheet-backed) ──
const BottomSheet: typeof PanelSheet = PanelSheet;
type BottomSheet = BottomSheetMethods;

const BottomSheetModal: typeof PanelSheetModal = PanelSheetModal;
type BottomSheetModal = BottomSheetMethods;

// ── Provider: PanelSheet needs none (root PortalHost). Passthrough for API compat. ──
export const BottomSheetModalProvider: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => <>{children}</>;

// ── Child components (plain RN under PanelSheet — they work in-tree) ──
export const BottomSheetView: typeof View = PanelSheetView;
export const BottomSheetScrollView: typeof ScrollView = PanelSheetScrollView;
export const BottomSheetFlatList: typeof FlatList = PanelSheetFlatList;
export const BottomSheetSectionList: typeof SectionList = PanelSheetSectionList;
export const BottomSheetTextInput: typeof TextInput = PanelSheetTextInput;

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
