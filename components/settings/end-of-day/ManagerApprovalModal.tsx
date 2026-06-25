import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad from "@/components/auth/PinNumpad";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useUiScale } from "@/lib/uiScale";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const ManagerApprovalModal = ({
  isOpen,
  onClose,
  onApprove,
}: {
  isOpen: boolean;
  onClose: () => void;
  onApprove: () => void;
}) => {
  const scale = useUiScale();
  const s = (value: number) => Math.round(value * scale);
  const [pin, setPin] = useState("");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        style={{
          minWidth: s(480),
          paddingHorizontal: 0,
          paddingVertical: 0,
          borderRadius: s(16),
          overflow: "hidden",
          backgroundColor: "white",
        }}
      >
        <View style={{ paddingHorizontal: s(16), paddingVertical: s(16), width: "100%" }}>
          <DialogTitle>
            <Text
              style={{
                color: "#0ea5e9",
                fontWeight: "bold",
                textAlign: "center",
                fontSize: s(24),
              }}
            >
              Manager Approval Required
            </Text>
          </DialogTitle>
        </View>
        <View style={{ backgroundColor: "white", paddingHorizontal: s(16), paddingVertical: s(16), width: "100%" }}>
          <Text
            style={{
              fontSize: s(20),
              fontWeight: "600",
              color: "#4b5563",
              marginBottom: s(6),
            }}
          >
            Enter your pin (Manager Only)
          </Text>
          <PinDisplay pinLength={pin.length} maxLength={4} />
          <PinNumpad onKeyPress={() => {}} />
          <TouchableOpacity style={{ alignSelf: "flex-end", marginVertical: s(12) }}>
            <Text style={{ fontWeight: "600", color: "#06b6d4", fontSize: s(16) }}>
              Forgot Pin
            </Text>
          </TouchableOpacity>
          <View
            style={{
              flexDirection: "row",
              gap: s(8),
              borderTopWidth: 1,
              borderTopColor: "#e5e7eb",
              paddingTop: s(16),
            }}
          >
            <TouchableOpacity
              onPress={onClose}
              style={{
                flex: 1,
                paddingVertical: s(12),
                borderWidth: 1,
                borderColor: "#d1d5db",
                borderRadius: s(8),
                alignItems: "center",
              }}
            >
              <Text style={{ fontWeight: "bold", color: "#374151", fontSize: s(20) }}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onApprove}
              style={{
                flex: 1,
                paddingVertical: s(12),
                backgroundColor: "#06b6d4",
                borderRadius: s(8),
                alignItems: "center",
              }}
            >
              <Text style={{ fontWeight: "bold", color: "white", fontSize: s(20) }}>
                Approve
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default ManagerApprovalModal;
