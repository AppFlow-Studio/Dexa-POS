import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check } from "@/lib/types";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { Mail, Printer } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";

const DetailRow = ({
  label,
  value,
  scale,
}: {
  label: string;
  value: string | number;
  scale: (v: number) => number;
}) => (
  <View
    style={{
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: scale(12),
      borderBottomWidth: 1,
      borderBottomColor: "#374151",
    }}
  >
    <Text style={{ fontSize: scale(18), color: "#d1d5db" }}>{label}</Text>
    <Text style={{ fontSize: scale(18), fontWeight: "600", color: "white" }}>
      {value}
    </Text>
  </View>
);

const CheckDetailsModal = ({
  isOpen,
  onClose,
  check,
}: {
  isOpen: boolean;
  onClose: () => void;
  check: Check | null;
}) => {
  const scale = useUiScale();
  const s = (value: number) => Math.round(value * scale);

  if (!check) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        style={{
          paddingHorizontal: 0,
          paddingVertical: 0,
          borderRadius: s(16),
          overflow: "hidden",
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: "#374151",
          width: s(550),
        }}
      >
        {/* Header */}
        <View
          style={{
            paddingHorizontal: s(24),
            paddingVertical: s(24),
            borderBottomWidth: 1,
            borderBottomColor: "#374151",
          }}
        >
          <DialogTitle
            style={{
              color: "white",
              fontSize: s(24),
              fontWeight: "bold",
              textAlign: "center",
            }}
          >
            Check Details
          </DialogTitle>
        </View>

        {/* Content */}
        <ScrollView contentContainerStyle={{ paddingHorizontal: s(24), paddingVertical: s(24) }}>
          <View style={{ gap: s(16) }}>
            <DetailRow label="Check Number" value={check.checkNo} scale={s} />
            <DetailRow label="Status" value={check.status} scale={s} />
            <DetailRow label="Payee" value={check.payee} scale={s} />
            <DetailRow label="Date Issued" value={check.dateIssued} scale={s} />

            {/* Items Section */}
            <View
              style={{
                paddingTop: s(16),
                marginTop: s(8),
                borderTopWidth: 1,
                borderTopColor: "#374151",
              }}
            >
              <Text style={{ fontSize: s(20), fontWeight: "bold", color: "white", marginBottom: s(8) }}>
                Items ({check.items.length})
              </Text>
              {check.items.map((item, index) => (
                <DetailRow
                  key={index}
                  label={item.name}
                  value={`$${item.price.toFixed(2)}`}
                  scale={s}
                />
              ))}
            </View>

            {/* Totals Section */}
            <View
              style={{
                paddingTop: s(16),
                marginTop: s(8),
                borderTopWidth: 1,
                borderTopColor: "#374151",
              }}
            >
              <DetailRow label="Subtotal" value={`$${check.subtotal.toFixed(2)}`} scale={s} />
              <DetailRow label="Tax" value={`$${check.tax.toFixed(2)}`} scale={s} />
              <DetailRow label="Tips" value={`$${check.tips.toFixed(2)}`} scale={s} />
            </View>

            {/* Grand Total */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: s(16),
                marginTop: s(8),
                borderTopWidth: 1,
                borderTopColor: "#374151",
              }}
            >
              <Text style={{ fontSize: s(24), fontWeight: "bold", color: "white" }}>
                Total
              </Text>
              <Text style={{ fontSize: s(24), fontWeight: "bold", color: "white" }}>
                ${check.total.toFixed(2)}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Footer with Buttons */}
        <DialogFooter
          style={{
            paddingHorizontal: s(24),
            paddingVertical: s(24),
            flexDirection: "row",
            gap: s(16),
            borderTopWidth: 1,
            borderTopColor: "#374151",
            backgroundColor: colors.screen,
            borderBottomLeftRadius: s(16),
            borderBottomRightRadius: s(16),
          }}
        >
          <TouchableOpacity
            style={{
              flex: 1,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: s(8),
              paddingVertical: s(12),
              borderWidth: 1,
              borderColor: "#4b5563",
              borderRadius: s(8),
            }}
          >
            <Mail color={colors.label} size={s(20)} />
            <Text style={{ fontSize: s(18), fontWeight: "bold", color: "#d1d5db" }}>
              Send Email
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flex: 1,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: s(8),
              paddingVertical: s(12),
              backgroundColor: "#2563eb",
              borderRadius: s(8),
            }}
          >
            <Printer color="#FFFFFF" size={s(20)} />
            <Text style={{ fontSize: s(18), fontWeight: "bold", color: "white" }}>
              Print Receipt
            </Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CheckDetailsModal;
