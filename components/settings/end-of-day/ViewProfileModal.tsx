import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmployeeShift } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

const DetailRow = ({ label, value, scale }: { label: string; value: string; scale: (v: number) => number }) => (
  <View>
    <Text
      style={{
        fontSize: scale(14),
        color: "#a3a3a3",
        marginBottom: scale(4),
      }}
    >
      {label}
    </Text>
    <Text style={{ fontWeight: "600" }}>{value}</Text>
  </View>
);

const ViewProfileModal = ({
  isOpen,
  onClose,
  employee,
}: {
  isOpen: boolean;
  onClose: () => void;
  employee: EmployeeShift | null;
}) => {
  const scale = useUiScale();
  const s = (value: number) => Math.round(value * scale);

  if (!employee) return null;

  return (
    <Dialog open={isOpen} onOpen-Change={onClose}>
      <DialogContent
        style={{
          width: s(360),
          backgroundColor: "#ffffff",
          paddingHorizontal: s(16),
          paddingVertical: s(16),
          borderRadius: s(16),
          alignItems: "center",
        }}
      >
        <Image
          source={require("@/assets/images/tom_hardy.jpg")}
          style={{
            width: s(112),
            height: s(112),
            borderRadius: s(16),
            marginBottom: s(12),
          }}
        />
        <Text style={{ fontSize: s(20), fontWeight: "bold" }}>
          {employee.name}
        </Text>
        <Text style={{ color: "#a3a3a3", fontSize: s(14) }}>
          ID: {employee.profile.id}
        </Text>

        <View
          style={{
            width: "100%",
            marginVertical: s(16),
            gap: s(12),
            borderWidth: 1,
            borderColor: "#e5e7eb",
            padding: s(12),
            borderRadius: s(8),
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <DetailRow label="Date of birth" value={employee.profile.dob} scale={s} />
            <DetailRow label="Role" value={employee.profile.role} scale={s} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <DetailRow label="Gender" value={employee.profile.gender} scale={s} />
            <DetailRow label="Country" value={employee.profile.country} scale={s} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <DetailRow label="Address" value={employee.profile.address} scale={s} />
          </View>
          <TouchableOpacity
            style={{
              width: "100%",
              paddingVertical: s(8),
              backgroundColor: "#ef4444",
              borderRadius: s(8),
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "bold", color: "white", fontSize: s(16) }}>
              Clock out
            </Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default ViewProfileModal;
