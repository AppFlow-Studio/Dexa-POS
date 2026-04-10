import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AlertTriangle,
  CheckCircle2,
  Printer,
  RefreshCw,
  Route,
  Settings2,
  Trash2,
  XCircle,
} from "lucide-react-native";
import { formatDistanceToNow } from "date-fns";
import type {
  PrinterConfig,
  PrinterDriverType,
  PrinterRole,
} from "@/types/printer";
import { colors } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PrinterListSectionProps {
  printers: PrinterConfig[];
  selectedStationId: string | null;
  // Callbacks
  onRetryConnection: (printer: PrinterConfig) => Promise<void>;
  onTestPrint: (printer: PrinterConfig) => Promise<void>;
  onConfigurePrinter: (printerId: string) => void;
  onSavePrinterConfig: (
    printerId: string,
    updates: Partial<PrinterConfig>,
  ) => Promise<void>;
  onDeletePrinter: (printer: PrinterConfig) => void;
  // Routing
  onOpenRouting: (printer: PrinterConfig) => void;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function getPrinterStatusColor(printer: PrinterConfig): string {
  if (printer.lastStatus === "verified") return colors.success;
  if (printer.isConnected) return colors.success;
  if (printer.lastStatus?.startsWith("verification_failed")) return colors.danger;
  if (printer.errorCount > 0) return colors.muted;
  return colors.muted;
}

function getPrinterStatusLabel(printer: PrinterConfig): string {
  if (printer.lastStatus === "verified") return "Verified";
  if (printer.isConnected) return "Online";
  if (printer.lastStatus?.startsWith("verification_failed")) return "Verify Failed";
  if (printer.errorCount > 0) return "Error";
  return "Offline";
}

function getPrinterStatusIcon(printer: PrinterConfig): React.ReactNode {
  if (printer.lastStatus === "verified" || printer.isConnected) {
    return <CheckCircle2 size={13} color={colors.success} />;
  }
  if (printer.lastStatus?.startsWith("verification_failed")) {
    return <XCircle size={13} color={colors.danger} />;
  }
  if (printer.errorCount > 0) {
    return <AlertTriangle size={13} color={colors.muted} />;
  }
  return <XCircle size={13} color={colors.muted} />;
}

function getRoleBadge(role: PrinterRole): { label: string; bg: string; text: string } {
  switch (role) {
    case "receipt": return { label: "Receipt", bg: colors.teal + "20", text: colors.teal };
    case "kitchen": return { label: "Kitchen", bg: colors.teal + "20", text: colors.teal };
    case "bar": return { label: "Bar", bg: colors.teal + "20", text: colors.teal };
    case "label": return { label: "Label", bg: colors.teal + "15", text: colors.teal };
    default: return { label: role, bg: colors.teal + "15", text: colors.teal };
  }
}

function getTypeBadge(type: PrinterDriverType): string {
  switch (type) {
    case "builtin_landi": return "Built-in";
    case "dejavoo_spin_p": return "Dejavoo";
    case "star_micronics": return "Star";
    case "generic_escpos": return "ESC/POS";
    default: return type;
  }
}

function getRelativeTime(iso: string | null): string {
  if (!iso) return "\u2014";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "\u2014";
  }
}

// ---------------------------------------------------------------------------
// Helpers — status classification (mirrors printers-kitchen.tsx logic)
// ---------------------------------------------------------------------------

function isOnline(p: PrinterConfig): boolean {
  return p.isActive && p.isConnected;
}

function isError(p: PrinterConfig): boolean {
  return (
    p.isActive &&
    !p.isConnected &&
    !!(
      p.lastStatus?.includes("error") ||
      p.lastStatus?.includes("Paper") ||
      p.lastStatus?.includes("Cover") ||
      p.lastStatus?.includes("Cutter")
    )
  );
}

function isOffline(p: PrinterConfig): boolean {
  return p.isActive && !p.isConnected && !isError(p);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PrinterListSection({
  printers,
  selectedStationId,
  onRetryConnection,
  onTestPrint,
  onConfigurePrinter,
  onSavePrinterConfig: _onSavePrinterConfig,
  onDeletePrinter,
  onOpenRouting,
}: PrinterListSectionProps) {
  // Local state
  const [printerScope, setPrinterScope] = useState<"station" | "location">("station");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline" | "error">("all");
  const [retryingPrinterId, setRetryingPrinterId] = useState<string | null>(null);
  const [testPrintingId, setTestPrintingId] = useState<string | null>(null);
  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);

  // ── Scope filtering ──────────────────────────────────────────
  const scopedPrinters = useMemo(() => {
    return printers.filter((p) => {
      if (printerScope === "station") {
        return p.stationId === selectedStationId || p.stationId === null;
      }
      // "location" mode: show all, but hide other stations' builtins
      return p.connectionType !== "builtin" || p.stationId === selectedStationId;
    });
  }, [printers, printerScope, selectedStationId]);

  // ── Status counts ────────────────────────────────────────────
  const onlineCount = useMemo(() => scopedPrinters.filter(isOnline).length, [scopedPrinters]);
  const offlineCount = useMemo(() => scopedPrinters.filter(isOffline).length, [scopedPrinters]);
  const errorCount = useMemo(() => scopedPrinters.filter(isError).length, [scopedPrinters]);
  const totalActive = useMemo(() => scopedPrinters.filter((p) => p.isActive).length, [scopedPrinters]);

  // ── Status filtering ────────────────────────────────────────
  const visiblePrinters = useMemo(() => {
    if (statusFilter === "all") return scopedPrinters;
    return scopedPrinters.filter((p) => {
      if (statusFilter === "online") return isOnline(p);
      if (statusFilter === "offline") return isOffline(p);
      if (statusFilter === "error") return isError(p);
      return true;
    });
  }, [scopedPrinters, statusFilter]);

  // ── Handlers ─────────────────────────────────────────────────
  const handleRetryConnection = async (printer: PrinterConfig) => {
    setRetryingPrinterId(printer.id);
    try {
      await onRetryConnection(printer);
    } finally {
      setRetryingPrinterId(null);
    }
  };

  const handleTestPrint = async (printer: PrinterConfig) => {
    setTestPrintingId(printer.id);
    try {
      await onTestPrint(printer);
    } finally {
      setTestPrintingId(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <View>
      {/* Header: title + printer count badge */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
            Configured Printers
          </Text>
          <View style={{
            backgroundColor: colors.teal + "20",
            borderRadius: 10,
            paddingHorizontal: 8,
            paddingVertical: 2,
            minWidth: 22,
            alignItems: "center",
          }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.teal }}>
              {scopedPrinters.length}
            </Text>
          </View>
        </View>
        {/* Connection summary dot */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{
            width: 7, height: 7, borderRadius: 4,
            backgroundColor:
              onlineCount === totalActive && totalActive > 0 ? colors.success
                : onlineCount > 0 ? colors.warning
                  : colors.danger,
          }} />
          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted }}>
            {onlineCount}/{totalActive} online
          </Text>
        </View>
      </View>

      {/* Scope toggle: This Station / All Location */}
      <View style={{
        flexDirection: "row",
        backgroundColor: colors.card,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
        marginBottom: 10,
      }}>
        {([
          { key: "station" as const, label: "This Station" },
          { key: "location" as const, label: "All Location" },
        ]).map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setPrinterScope(key)}
            style={{
              flex: 1,
              paddingVertical: 8,
              alignItems: "center",
              backgroundColor: printerScope === key ? colors.teal + "20" : "transparent",
            }}
          >
            <Text style={{
              fontSize: 12,
              fontWeight: "600",
              color: printerScope === key ? colors.teal : colors.label,
            }}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Status filter pills (only show when 4+ active printers) */}
      {totalActive > 3 && (
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {([
            { key: "all" as const, label: "All", count: scopedPrinters.length, color: undefined },
            { key: "online" as const, label: "Online", count: onlineCount, color: colors.success },
            { key: "offline" as const, label: "Offline", count: offlineCount, color: colors.warning },
            { key: "error" as const, label: "Error", count: errorCount, color: colors.danger },
          ] as const).map(({ key, label, count, color }) => {
            const isActive = statusFilter === key;
            const pillColor = color ?? colors.teal;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setStatusFilter(key)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 14,
                  backgroundColor: isActive ? pillColor + "20" : colors.panel,
                  borderWidth: 1,
                  borderColor: isActive ? pillColor + "50" : colors.border,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "600", color: isActive ? pillColor : colors.label }}>
                  {label}
                </Text>
                <View style={{
                  backgroundColor: isActive ? pillColor + "30" : colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                  minWidth: 18,
                  alignItems: "center",
                }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: isActive ? pillColor : colors.muted }}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Printer cards list */}
      {visiblePrinters.length === 0 ? (
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 14,
          paddingVertical: 20,
          alignItems: "center",
          gap: 6,
        }}>
          <Printer size={20} color={colors.muted} />
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {statusFilter !== "all"
              ? `No ${statusFilter} printers`
              : "No printers configured"}
          </Text>
        </View>
      ) : (
        visiblePrinters.map((printer) => {
          const role = getRoleBadge(printer.printerRole);
          const isTestPrinting = testPrintingId === printer.id;
          const isEditing = editingPrinterId === printer.id;
          const statusColor = getPrinterStatusColor(printer);
          const statusLabel = getPrinterStatusLabel(printer);

          return (
            <View
              key={printer.id}
              style={{
                backgroundColor: colors.card,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: printer.isActive ? colors.border : colors.border + "60",
                marginBottom: 8,
                opacity: printer.isActive ? 1 : 0.65,
              }}
            >
              {/* Card row */}
              <View style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "center",
                overflow: "hidden",
              }}>
                {/* Col 1 -- Printer icon */}
                <View style={{
                  width: 30, height: 30, borderRadius: 7,
                  backgroundColor: colors.teal + "15",
                  alignItems: "center", justifyContent: "center",
                  marginRight: 10, flexShrink: 0,
                }}>
                  <Printer size={14} color={colors.teal} />
                </View>

                {/* Col 2 -- Name + status badge + address */}
                <View style={{ width: 180, flexShrink: 0, marginRight: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Text
                      style={{ fontSize: 12, fontWeight: "700", color: colors.heading, flexShrink: 1 }}
                      numberOfLines={1}
                    >
                      {printer.printerName}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 0 }}>
                      <View style={{
                        flexDirection: "row", alignItems: "center", gap: 3,
                        backgroundColor: statusColor + "20",
                        borderWidth: 1, borderColor: statusColor + "50",
                        paddingHorizontal: 6, paddingVertical: 1, borderRadius: 20,
                      }}>
                        {getPrinterStatusIcon(printer)}
                        <Text style={{ fontSize: 10, fontWeight: "600", color: statusColor }}>
                          {statusLabel}
                        </Text>
                      </View>
                      {printer.errorCount > 0 && (
                        <View style={{
                          backgroundColor: colors.warning + "25",
                          borderWidth: 1, borderColor: colors.warning + "60",
                          borderRadius: 20, minWidth: 16, height: 16,
                          alignItems: "center", justifyContent: "center",
                          paddingHorizontal: 4,
                        }}>
                          <Text style={{ fontSize: 9, fontWeight: "700", color: colors.warning }}>
                            {printer.errorCount}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={{ fontSize: 10, color: colors.label, marginTop: 2 }} numberOfLines={1}>
                    {printer.networkAddress || printer.connectionType.toUpperCase()}
                    {printer.printerModel ? ` \u00B7 ${getTypeBadge(printer.printerType)}` : ""}
                  </Text>
                </View>

                {/* Col 3 -- Role pills + last print */}
                <View style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 6,
                  overflow: "hidden",
                }}>
                  <View style={{
                    flexShrink: 0,
                    backgroundColor: role.bg,
                    borderWidth: 1, borderColor: role.text + "60",
                    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20,
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: role.text }}>
                      {role.label}
                    </Text>
                  </View>
                  {printer.isDefaultReceipt && printer.printerRole !== "receipt" && (
                    <View style={{
                      flexShrink: 0, backgroundColor: colors.teal + "15",
                      borderWidth: 1, borderColor: colors.teal + "40",
                      paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20,
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: "600", color: colors.teal }}>Receipt</Text>
                    </View>
                  )}
                  {printer.isDefaultKitchen && printer.printerRole !== "kitchen" && (
                    <View style={{
                      flexShrink: 0, backgroundColor: colors.teal + "15",
                      borderWidth: 1, borderColor: colors.teal + "40",
                      paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20,
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: "600", color: colors.teal }}>Kitchen</Text>
                    </View>
                  )}
                  {printer.lastPrintAt && (
                    <Text style={{ fontSize: 10, color: colors.muted, flexShrink: 1 }} numberOfLines={1}>
                      Last: {getRelativeTime(printer.lastPrintAt)}
                    </Text>
                  )}
                </View>

                {/* Col 4 -- Action buttons */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 10 }}>
                  {!printer.isConnected && (
                    <TouchableOpacity
                      onPress={() => handleRetryConnection(printer)}
                      disabled={retryingPrinterId === printer.id}
                      style={{
                        padding: 6,
                        backgroundColor: colors.teal + "15",
                        borderWidth: 1, borderColor: colors.teal + "40",
                        borderRadius: 7,
                      }}
                    >
                      {retryingPrinterId === printer.id
                        ? <ActivityIndicator size="small" color={colors.teal} />
                        : <RefreshCw size={12} color={colors.teal} />}
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      if (isEditing) {
                        setEditingPrinterId(null);
                      } else {
                        setEditingPrinterId(printer.id);
                      }
                    }}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 4,
                      paddingHorizontal: 9, paddingVertical: 5,
                      backgroundColor: isEditing ? colors.teal + "30" : colors.teal + "15",
                      borderWidth: 1,
                      borderColor: isEditing ? colors.teal + "70" : colors.teal + "40",
                      borderRadius: 7,
                    }}
                  >
                    <Settings2 size={12} color={colors.teal} />
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>
                      {isEditing ? "Close" : "Configure"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleTestPrint(printer)}
                    disabled={isTestPrinting}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 4,
                      paddingHorizontal: 9, paddingVertical: 5,
                      backgroundColor: colors.teal + "15",
                      borderWidth: 1, borderColor: colors.teal + "40",
                      borderRadius: 7,
                    }}
                  >
                    {isTestPrinting
                      ? <ActivityIndicator size="small" color={colors.teal} />
                      : <Printer size={12} color={colors.teal} />}
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>Test Print</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Expandable quick-actions panel (when editing) */}
              {isEditing && (
                <View style={{
                  paddingHorizontal: 12,
                  paddingBottom: 12,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingTop: 10,
                  gap: 8,
                }}>
                  {/* Quick action row: Configure full settings + Routing + Delete */}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingPrinterId(null);
                        onConfigurePrinter(printer.id);
                      }}
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        paddingVertical: 9,
                        borderRadius: 8,
                        backgroundColor: colors.teal + "15",
                        borderWidth: 1,
                        borderColor: colors.teal + "40",
                      }}
                    >
                      <Settings2 size={13} color={colors.teal} />
                      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>
                        Full Settings
                      </Text>
                    </TouchableOpacity>

                    {(printer.printerRole === "kitchen" || printer.printerRole === "bar") && (
                      <TouchableOpacity
                        onPress={() => {
                          setEditingPrinterId(null);
                          onOpenRouting(printer);
                        }}
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          paddingVertical: 9,
                          borderRadius: 8,
                          backgroundColor: colors.teal + "15",
                          borderWidth: 1,
                          borderColor: colors.teal + "40",
                        }}
                      >
                        <Route size={13} color={colors.teal} />
                        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>
                          Routing
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      onPress={() => {
                        setEditingPrinterId(null);
                        onDeletePrinter(printer);
                      }}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        borderRadius: 8,
                        backgroundColor: colors.danger + "10",
                        borderWidth: 1,
                        borderColor: colors.danger + "30",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <Trash2 size={13} color={colors.danger} />
                      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.danger }}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}
