import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView, // Using BottomSheetView as per DropShiftBottomSheet
} from "@/components/ui/bottomSheet";
import { useOverlayTelemetry } from "@/hooks/useOverlayTelemetry";
import React, { useCallback, useMemo, useState } from "react";
import { bottomSheetTheme } from "@/lib/theme";
import NotificationPanel from "./NotificationPanel"; // Assuming NotificationPanel is in the same directory

interface NotificationBottomSheetProps {
  bottomSheetRef: React.RefObject<BottomSheet>;
  onClose: () => void;
}

const NotificationBottomSheet: React.FC<NotificationBottomSheetProps> = ({
  bottomSheetRef,
  onClose,
}) => {
  const snapPoints = useMemo(() => ["50%", "85%"], []);
  // Only mount the panel (which subscribes to the notification store and builds
  // a SectionList) while the sheet is actually open. This component lives in the
  // always-mounted (main) layout at index={-1}; without this gate it kept the
  // panel + its store subscription + section data alive for the whole app
  // lifetime, adding to the per-navigation baseline cost.
  const [isOpen, setIsOpen] = useState(false);

  // Renders-while-closed accounting for the global overlay set. The panel is
  // already gated on `isOpen`, so this is the proof rather than a fix.
  useOverlayTelemetry("notifications", isOpen);

  const handleChange = useCallback((index: number) => {
    setIsOpen(index >= 0);
  }, []);

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      onChange={handleChange}
      {...bottomSheetTheme}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      )}
    >
      {/* The content of our notification panel — mounted only while open. */}
      <BottomSheetView className="flex-1">
        {isOpen ? <NotificationPanel onClose={onClose} /> : null}
      </BottomSheetView>
    </BottomSheet>
  );
};

// Persistently mounted in the (main) layout, which re-renders on every
// navigation. Both props must be referentially stable at the call site for this
// to bite — see the hoisted NOOP in app/(main)/_layout.tsx.
export default React.memo(NotificationBottomSheet);
