import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView, // Using BottomSheetView as per DropShiftBottomSheet
} from "@gorhom/bottom-sheet";
import React, { useMemo } from "react";
import NotificationPanel from "./NotificationPanel"; // Assuming NotificationPanel is in the same directory

interface NotificationBottomSheetProps {
  bottomSheetRef: React.RefObject<BottomSheet>;
  onClose: () => void;
}

const NotificationBottomSheet: React.FC<NotificationBottomSheetProps> = ({
  bottomSheetRef,
  onClose,
}) => {
  // Define snap points. Starting with 50% and 85% as discussed in previous plans.
  const snapPoints = useMemo(() => ["50%", "85%"], []);

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1} // Start closed
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
      backgroundStyle={{ backgroundColor: "#1F1F1F" }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      )}
    >
      {/* The content of our notification panel */}
      <BottomSheetView className="flex-1">
        <NotificationPanel onClose={onClose} />
      </BottomSheetView>
    </BottomSheet>
  );
};

export default NotificationBottomSheet;
