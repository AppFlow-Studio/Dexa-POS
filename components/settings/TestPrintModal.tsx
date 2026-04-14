import { ChevronDown, Printer, X } from "lucide-react-native";
import { colors } from "@/lib/theme";
import { PrinterService } from "@/services/printing/PrinterService";
import { usePrinterStore } from "@/stores/usePrinterStore";
import type { PrinterConfig } from "@/types/printer";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type PrintType = "test_page" | "receipt" | "kitchen";

interface TestPrintModalProps {
  visible: boolean;
  onClose: () => void;
  initialPrinter?: PrinterConfig | null;
  initialPrintType?: PrintType;
}

const PRINT_TYPES: { key: PrintType; label: string; description: string }[] = [
  { key: "test_page", label: "Test Page",      description: "Basic connectivity test with printer info" },
  { key: "receipt",   label: "Receipt",         description: "Sample receipt with items, tax & payment" },
  { key: "kitchen",   label: "Kitchen Ticket",  description: "Sample order ticket with modifiers" },
];

export function TestPrintModal({ visible, onClose, initialPrinter, initialPrintType }: TestPrintModalProps) {
  const allPrinters = usePrinterStore((s) => s.printers);

  const [selectedPrinterId,    setSelectedPrinterId]    = useState<string | null>(initialPrinter?.id ?? null);
  const [printType,            setPrintType]            = useState<PrintType>(initialPrintType ?? "receipt");
  const [isPrinting,           setIsPrinting]           = useState(false);
  const [showPrinterDropdown,  setShowPrinterDropdown]  = useState(false);
  const [lastResult,           setLastResult]           = useState<"success" | "error" | null>(null);

  useEffect(() => {
    if (visible && initialPrintType) {
      setPrintType(initialPrintType);
      setLastResult(null);
    }
  }, [visible, initialPrintType]);

  const activePrinters  = allPrinters.filter((p) => p.isActive);
  const selectedPrinter = activePrinters.find((p) => p.id === selectedPrinterId) ?? null;

  const handlePrint = async () => {
    if (!selectedPrinter) return;
    setIsPrinting(true);
    setLastResult(null);
    try {
      if (printType === "receipt")      await PrinterService.printTestReceipt(selectedPrinter);
      else if (printType === "kitchen") await PrinterService.printTestKitchenTicket(selectedPrinter);
      else                              await PrinterService.printTestPage(selectedPrinter);
      setLastResult("success");
    } catch {
      setLastResult("error");
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)" }}>
        <View style={{
          backgroundColor: colors.panel,
          borderRadius: 14,
          width: 460,
          maxWidth: "90%",
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colors.teal + "18", alignItems: "center", justifyContent: "center" }}>
                <Printer size={14} color={colors.teal} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>Test Print</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
              <X size={14} color={colors.label} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ paddingHorizontal: 14, paddingVertical: 12 }} scrollEnabled={false}>

            {/* Printer selector */}
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.label, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
              Select Printer
            </Text>
            <TouchableOpacity
              onPress={() => setShowPrinterDropdown((v) => !v)}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 }}
            >
              <View style={{ flex: 1, marginRight: 8 }}>
                {selectedPrinter ? (
                  <>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>{selectedPrinter.printerName}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1, textTransform: "capitalize" }}>
                      {selectedPrinter.printerRole} · {selectedPrinter.networkAddress ?? selectedPrinter.connectionType}
                    </Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 13, color: colors.muted }}>Choose a printer…</Text>
                )}
              </View>
              <ChevronDown size={14} color={colors.label} style={{ transform: [{ rotate: showPrinterDropdown ? "180deg" : "0deg" }] }} />
            </TouchableOpacity>

            {showPrinterDropdown && (
              <View style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginBottom: 12, overflow: "hidden" }}>
                {activePrinters.length === 0 && (
                  <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                    <Text style={{ fontSize: 12, color: colors.muted }}>No active printers configured</Text>
                  </View>
                )}
                {activePrinters.map((p, idx) => {
                  const isSelected = selectedPrinterId === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => { setSelectedPrinterId(p.id); setShowPrinterDropdown(false); setLastResult(null); }}
                      style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                        paddingHorizontal: 12, paddingVertical: 10,
                        borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: colors.border,
                        backgroundColor: isSelected ? colors.teal + "10" : "transparent",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: isSelected ? colors.teal : colors.heading }}>{p.printerName}</Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1, textTransform: "capitalize" }}>
                          {p.printerRole} · {p.networkAddress ?? p.connectionType}
                        </Text>
                      </View>
                      {isSelected && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.teal }} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Print type */}
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.label, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6, marginTop: 4 }}>
              Print Type
            </Text>
            <View style={{ gap: 6, marginBottom: 14 }}>
              {PRINT_TYPES.map((type) => {
                const isSelected = printType === type.key;
                return (
                  <TouchableOpacity
                    key={type.key}
                    onPress={() => { setPrintType(type.key); setLastResult(null); }}
                    style={{
                      flexDirection: "row", alignItems: "center",
                      paddingHorizontal: 12, paddingVertical: 10,
                      borderRadius: 8, borderWidth: 1,
                      borderColor: isSelected ? colors.teal + "50" : colors.border,
                      backgroundColor: isSelected ? colors.teal + "10" : colors.screen,
                    }}
                  >
                    <View style={{
                      width: 16, height: 16, borderRadius: 8, borderWidth: 2,
                      borderColor: isSelected ? colors.teal : colors.border,
                      alignItems: "center", justifyContent: "center", marginRight: 10,
                    }}>
                      {isSelected && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.teal }} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: isSelected ? colors.heading : colors.label }}>{type.label}</Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>{type.description}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Result feedback */}
            {lastResult && (
              <View style={{
                borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
                backgroundColor: lastResult === "success" ? colors.success + "15" : colors.danger + "15",
                borderWidth: 1,
                borderColor: lastResult === "success" ? colors.success + "40" : colors.danger + "40",
              }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: lastResult === "success" ? colors.success : colors.danger }}>
                  {lastResult === "success"
                    ? "Print job queued — check the printer."
                    : "Print failed. Check printer connection."}
                </Text>
              </View>
            )}

            {/* Print button */}
            <TouchableOpacity
              onPress={handlePrint}
              disabled={!selectedPrinter || isPrinting}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                paddingVertical: 11, borderRadius: 8, marginBottom: 4,
                backgroundColor: selectedPrinter && !isPrinting ? colors.teal : colors.teal + "30",
              }}
            >
              {isPrinting
                ? <ActivityIndicator size="small" color={colors.onSolid} />
                : <Printer size={14} color={selectedPrinter ? colors.onSolid : colors.muted} />
              }
              <Text style={{ fontSize: 13, fontWeight: "700", color: selectedPrinter && !isPrinting ? colors.onSolid : colors.muted }}>
                {isPrinting ? "Printing…" : "Print Test"}
              </Text>
            </TouchableOpacity>

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
