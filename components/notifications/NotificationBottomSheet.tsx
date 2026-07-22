import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView, // Using BottomSheetView as per DropShiftBottomSheet
} from "@gorhom/bottom-sheet";
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
      // Always render above every screen overlay (Slot can carry zIndex:100,
      // and sibling absolute views mount after this sheet in the layout).
      containerStyle={{ zIndex: 9999, elevation: 9999 }}
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

export default NotificationBottomSheet;
