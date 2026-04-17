import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView, // Using BottomSheetView as per DropShiftBottomSheet
} from "@gorhom/bottom-sheet";
import React, { useMemo } from "react";
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

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      {...bottomSheetTheme}
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
