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

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

type PrintType = "test_page" | "receipt" | "kitchen";

interface TestPrintModalProps {
  visible: boolean;
  onClose: () => void;
  initialPrinter?: PrinterConfig | null;
  initialPrintType?: PrintType;
}

// ---------------------------------------------------------------------------
// PRINT TYPE OPTIONS
// ---------------------------------------------------------------------------

const PRINT_TYPES: { key: PrintType; label: string; description: string; color: string }[] = [
  {
    key: "test_page",
    label: "Test Page",
    description: "Basic connectivity test with printer info",
    color: colors.info,
  },
  {
    key: "receipt",
    label: "Receipt",
    description: "Sample receipt with items, tax & payment",
    color: colors.success,
  },
  {
    key: "kitchen",
    label: "Kitchen Ticket",
    description: "Sample order ticket with modifiers",
    color: colors.warning,
  },
];

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export function TestPrintModal({ visible, onClose, initialPrinter, initialPrintType }: TestPrintModalProps) {
  const allPrinters = usePrinterStore((s) => s.printers);

  const [selectedPrinterId, setSelectedPrinterId] = useState<string | null>(
    initialPrinter?.id ?? null,
  );
  const [printType, setPrintType] = useState<PrintType>(initialPrintType ?? "receipt");
  const [isPrinting, setIsPrinting] = useState(false);
  const [showPrinterDropdown, setShowPrinterDropdown] = useState(false);
  const [lastResult, setLastResult] = useState<"success" | "error" | null>(null);

  // Sync print type when modal opens with a new initial type
  useEffect(() => {
    if (visible && initialPrintType) {
      setPrintType(initialPrintType);
      setLastResult(null);
    }
  }, [visible, initialPrintType]);

  const activePrinters = allPrinters.filter((p) => p.isActive);
  const selectedPrinter = activePrinters.find((p) => p.id === selectedPrinterId) ?? null;

  const handlePrint = async () => {
    if (!selectedPrinter) return;
    setIsPrinting(true);
    setLastResult(null);
    try {
      if (printType === "receipt") {
        await PrinterService.printTestReceipt(selectedPrinter);
      } else if (printType === "kitchen") {
        await PrinterService.printTestKitchenTicket(selectedPrinter);
      } else {
        await PrinterService.printTestPage(selectedPrinter);
      }
      setLastResult("success");
    } catch {
      setLastResult("error");
    } finally {
      setIsPrinting(false);
    }
  };

  const selectedType = PRINT_TYPES.find((t) => t.key === printType)!;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-black/60">
        <View className="bg-panel rounded-2xl w-[480px] max-w-[90%] overflow-hidden border border-gray-700">
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 pt-5 pb-4 border-b border-gray-700">
            <View className="flex-row items-center">
              <View className="w-9 h-9 rounded-lg bg-blue-600/20 items-center justify-center mr-3">
                <Printer size={18} color={colors.info} />
              </View>
              <Text className="text-white font-bold text-lg">Test Print</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-2 bg-card rounded-lg">
              <X size={18} color={colors.label} />
            </TouchableOpacity>
          </View>

          <ScrollView className="px-5 py-4" scrollEnabled={false}>
            {/* Printer Selector */}
            <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
              Select Printer
            </Text>
            <TouchableOpacity
              onPress={() => setShowPrinterDropdown((v) => !v)}
              className="flex-row items-center justify-between bg-surface border border-gray-600 rounded-xl px-4 py-3 mb-1"
            >
              <View className="flex-1 mr-2">
                {selectedPrinter ? (
                  <>
                    <Text className="text-white text-sm font-medium">{selectedPrinter.printerName}</Text>
                    <Text className="text-gray-500 text-xs capitalize mt-0.5">
                      {selectedPrinter.printerRole} · {selectedPrinter.networkAddress ?? selectedPrinter.connectionType}
                    </Text>
                  </>
                ) : (
                  <Text className="text-gray-500 text-sm">Choose a printer…</Text>
                )}
              </View>
              <ChevronDown
                size={16}
                color={colors.label}
                style={{ transform: [{ rotate: showPrinterDropdown ? "180deg" : "0deg" }] }}
              />
            </TouchableOpacity>

            {showPrinterDropdown && (
              <View className="bg-surface border border-gray-600 rounded-xl mb-4 overflow-hidden">
                {activePrinters.length === 0 && (
                  <View className="px-4 py-3">
                    <Text className="text-gray-500 text-sm">No active printers configured</Text>
                  </View>
                )}
                {activePrinters.map((p, idx) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => {
                      setSelectedPrinterId(p.id);
                      setShowPrinterDropdown(false);
                      setLastResult(null);
                    }}
                    className={`flex-row items-center justify-between px-4 py-3 ${
                      idx < activePrinters.length - 1 ? "border-b border-gray-700" : ""
                    } ${selectedPrinterId === p.id ? "bg-blue-600/10" : ""}`}
                  >
                    <View className="flex-1">
                      <Text className={`text-sm font-medium ${selectedPrinterId === p.id ? "text-blue-400" : "text-white"}`}>
                        {p.printerName}
                      </Text>
                      <Text className="text-gray-500 text-xs capitalize mt-0.5">
                        {p.printerRole} · {p.networkAddress ?? p.connectionType}
                      </Text>
                    </View>
                    {selectedPrinterId === p.id && (
                      <View className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Print Type */}
            <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 mt-2">
              Print Type
            </Text>
            <View className="gap-2 mb-5">
              {PRINT_TYPES.map((type) => {
                const isSelected = printType === type.key;
                return (
                  <TouchableOpacity
                    key={type.key}
                    onPress={() => { setPrintType(type.key); setLastResult(null); }}
                    className={`flex-row items-center px-4 py-3 rounded-xl border ${
                      isSelected
                        ? "bg-blue-600/10 border-blue-500/60"
                        : "bg-surface border-gray-700"
                    }`}
                  >
                    {/* Radio dot */}
                    <View
                      className={`w-4 h-4 rounded-full border-2 mr-3 items-center justify-center ${
                        isSelected ? "border-blue-500" : "border-gray-600"
                      }`}
                    >
                      {isSelected && <View className="w-2 h-2 rounded-full bg-blue-500" />}
                    </View>
                    <View className="flex-1">
                      <Text className={`text-sm font-semibold ${isSelected ? "text-white" : "text-gray-300"}`}>
                        {type.label}
                      </Text>
                      <Text className="text-gray-500 text-xs mt-0.5">{type.description}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Result feedback */}
            {lastResult && (
              <View
                className={`rounded-xl px-4 py-3 mb-4 ${
                  lastResult === "success" ? "bg-green-600/10 border border-green-600/30" : "bg-red-600/10 border border-red-600/30"
                }`}
              >
                <Text className={`text-sm font-medium ${lastResult === "success" ? "text-green-400" : "text-red-400"}`}>
                  {lastResult === "success"
                    ? `${selectedType.label} queued — check the printer.`
                    : "Print failed. Check printer connection."}
                </Text>
              </View>
            )}

            {/* Print Button */}
            <TouchableOpacity
              onPress={handlePrint}
              disabled={!selectedPrinter || isPrinting}
              className={`flex-row items-center justify-center py-3.5 rounded-xl mb-2 ${
                selectedPrinter && !isPrinting ? "bg-blue-600" : "bg-blue-600/30"
              }`}
            >
              {isPrinting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Printer size={18} color={selectedPrinter ? "white" : "rgba(255,255,255,0.4)"} />
                  <Text
                    className={`font-semibold ml-2 text-base ${
                      selectedPrinter ? "text-white" : "text-white/40"
                    }`}
                  >
                    Print Test
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
