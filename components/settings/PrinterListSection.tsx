import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CheckCircle2,
  HelpCircle,
  Lock,
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
import { useUiScale } from "@/lib/uiScale";
import { getPrinterReachability } from "@/stores/selectors/printerSelectors";
import { triggerHealthCheckNow } from "@/services/hardware/starPrinterHealthCheck";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PrinterListSectionProps {
  printers: PrinterConfig[];
  selectedStationId: string | null;
  // Map of printer.id -> array of station IDs that currently claim it as
  // their receipt printer. Drives the "Your station" / "Used by N other
  // station(s)" chips. Omit (or pass {}) to disable the chip column.
  claimsByPrinterId?: Record<string, string[]>;
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
  switch (getPrinterReachability(printer)) {
    case "connectable": return colors.success;
    case "in_use": return colors.warning;
    case "offline": return colors.danger;
    case "unknown": return colors.muted;
  }
}

function getPrinterStatusLabel(printer: PrinterConfig): string {
  switch (getPrinterReachability(printer)) {
    case "connectable": return "Connectable";
    case "in_use": return "In use";
    case "offline": return "Offline";
    case "unknown": return "Unknown";
  }
}

function getPrinterStatusIcon(printer: PrinterConfig, scale: number): React.ReactNode {
  const s = (n: number) => Math.round(n * scale);
  switch (getPrinterReachability(printer)) {
    case "connectable": return <CheckCircle2 size={s(13)} color={colors.success} />;
    case "in_use": return <Lock size={s(13)} color={colors.warning} />;
    case "offline": return <XCircle size={s(13)} color={colors.danger} />;
    case "unknown": return <HelpCircle size={s(13)} color={colors.muted} />;
  }
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
// Component
// ---------------------------------------------------------------------------

export function PrinterListSection({
  printers,
  selectedStationId,
  claimsByPrinterId,
  onRetryConnection,
  onTestPrint,
  onConfigurePrinter,
  onSavePrinterConfig: _onSavePrinterConfig,
  onDeletePrinter,
  onOpenRouting,
}: PrinterListSectionProps) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  // Local state
  const [retryingPrinterId, setRetryingPrinterId] = useState<string | null>(null);
  const [testPrintingId, setTestPrintingId] = useState<string | null>(null);
  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);

  // Kick a single probe round on mount so badges reflect current reachability
  // immediately instead of waiting up to 2 minutes for the next background
  // tick. The health-check is guarded by isChecking, so this is safe to call
  // concurrently with the periodic interval.
  useEffect(() => {
    triggerHealthCheckNow();
  }, []);

  // Scoped to this station: builtins / Dejavoo bound to other stations are
  // hidden; location-level printers (Star — station_id NULL) and this
  // station's own printers stay visible.
  const visiblePrinters = useMemo(() => {
    return printers.filter(
      (p) => p.stationId === selectedStationId || p.stationId === null,
    );
  }, [printers, selectedStationId]);

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
  // Minimal layout: just the cards. Parent (printers.tsx) supplies the
  // section title ("Receipt Printers" / "Kitchen / Bar / Label Printers")
  // and the "Your Station's Receipt Printer" summary card above. The
  // previous count header + scope toggle + status filter pills are gone —
  // per-station claim semantics + the per-card claim chip already convey
  // everything an operator needs at a glance.
  return (
    <View>
      {visiblePrinters.length === 0 ? (
        <View style={{
          backgroundColor: colors.card,
          borderRadius: s(10),
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: s(14),
          paddingVertical: s(20),
          alignItems: "center",
          gap: s(6),
        }}>
          <Printer size={s(20)} color={colors.muted} />
          <Text style={{ fontSize: s(12), color: colors.muted }}>
            No printers configured
          </Text>
        </View>
      ) : (
        visiblePrinters.map((printer) => {
          const role = getRoleBadge(printer.printerRole);
          const isTestPrinting = testPrintingId === printer.id;
          const isEditing = editingPrinterId === printer.id;
          const statusColor = getPrinterStatusColor(printer);
          const statusLabel = getPrinterStatusLabel(printer);

          // Soft-shared receipt-printer claim chip.
          // Green "Your station" if this device's station owns the claim;
          // gray "Used by N other station(s)" otherwise. Chip is informational
          // — routing remains permissive at the print-queue level.
          const claimingStationIds = claimsByPrinterId?.[printer.id] ?? [];
          const claimedByCurrent =
            !!selectedStationId && claimingStationIds.includes(selectedStationId);
          const otherClaimCount = claimingStationIds.filter(
            (sid) => sid !== selectedStationId,
          ).length;

          return (
            <View
              key={printer.id}
              style={{
                backgroundColor: colors.card,
                borderRadius: s(12),
                borderWidth: 1,
                borderColor: printer.isActive ? colors.border : colors.border + "60",
                marginBottom: s(8),
                opacity: printer.isActive ? 1 : 0.65,
              }}
            >
              {/* Card row */}
              <View style={{
                paddingHorizontal: s(12),
                paddingVertical: s(10),
                flexDirection: "row",
                alignItems: "center",
                overflow: "hidden",
              }}>
                {/* Col 1 -- Printer icon */}
                <View style={{
                  width: s(30), height: s(30), borderRadius: s(7),
                  backgroundColor: colors.teal + "15",
                  alignItems: "center", justifyContent: "center",
                  marginRight: s(10), flexShrink: 0,
                }}>
                  <Printer size={s(14)} color={colors.teal} />
                </View>

                {/* Col 2 -- Name + status badge + address */}
                <View style={{ width: s(180), flexShrink: 0, marginRight: s(16) }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: s(5) }}>
                    <Text
                      style={{ fontSize: s(12), fontWeight: "700", color: colors.heading, flexShrink: 1 }}
                      numberOfLines={1}
                    >
                      {printer.printerName}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: s(3), flexShrink: 0 }}>
                      <View style={{
                        flexDirection: "row", alignItems: "center", gap: s(3),
                        backgroundColor: statusColor + "20",
                        borderWidth: 1, borderColor: statusColor + "50",
                        paddingHorizontal: s(6), paddingVertical: s(1), borderRadius: s(20),
                      }}>
                        {getPrinterStatusIcon(printer, uiScale)}
                        <Text style={{ fontSize: s(10), fontWeight: "600", color: statusColor }}>
                          {statusLabel}
                        </Text>
                      </View>
                      {printer.errorCount > 0 && (
                        <View style={{
                          backgroundColor: colors.warning + "25",
                          borderWidth: 1, borderColor: colors.warning + "60",
                          borderRadius: s(20), minWidth: s(16), height: s(16),
                          alignItems: "center", justifyContent: "center",
                          paddingHorizontal: s(4),
                        }}>
                          <Text style={{ fontSize: s(9), fontWeight: "700", color: colors.warning }}>
                            {printer.errorCount}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={{ fontSize: s(10), color: colors.label, marginTop: s(2) }} numberOfLines={1}>
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
                  gap: s(6),
                  overflow: "hidden",
                }}>
                  <View style={{
                    flexShrink: 0,
                    backgroundColor: role.bg,
                    borderWidth: 1, borderColor: role.text + "60",
                    paddingHorizontal: s(8), paddingVertical: s(2), borderRadius: s(20),
                  }}>
                    <Text style={{ fontSize: s(10), fontWeight: "600", color: role.text }}>
                      {role.label}
                    </Text>
                  </View>
                  {claimedByCurrent && (
                    <View style={{
                      flexShrink: 0,
                      backgroundColor: colors.success + "20",
                      borderWidth: 1, borderColor: colors.success + "55",
                      paddingHorizontal: s(8), paddingVertical: s(2), borderRadius: s(20),
                    }}>
                      <Text style={{ fontSize: s(10), fontWeight: "700", color: colors.success }}>
                        Your station
                      </Text>
                    </View>
                  )}
                  {!claimedByCurrent && otherClaimCount > 0 && (
                    <View style={{
                      flexShrink: 0,
                      backgroundColor: colors.muted + "20",
                      borderWidth: 1, borderColor: colors.muted + "55",
                      paddingHorizontal: s(8), paddingVertical: s(2), borderRadius: s(20),
                    }}>
                      <Text style={{ fontSize: s(10), fontWeight: "600", color: colors.muted }}>
                        {otherClaimCount === 1
                          ? "Used by 1 other station"
                          : `Used by ${otherClaimCount} other stations`}
                      </Text>
                    </View>
                  )}
                  {printer.isDefaultReceipt && printer.printerRole !== "receipt" && (
                    <View style={{
                      flexShrink: 0, backgroundColor: colors.teal + "15",
                      borderWidth: 1, borderColor: colors.teal + "40",
                      paddingHorizontal: s(8), paddingVertical: s(2), borderRadius: s(20),
                    }}>
                      <Text style={{ fontSize: s(10), fontWeight: "600", color: colors.teal }}>Receipt</Text>
                    </View>
                  )}
                  {printer.isDefaultKitchen && printer.printerRole !== "kitchen" && (
                    <View style={{
                      flexShrink: 0, backgroundColor: colors.teal + "15",
                      borderWidth: 1, borderColor: colors.teal + "40",
                      paddingHorizontal: s(8), paddingVertical: s(2), borderRadius: s(20),
                    }}>
                      <Text style={{ fontSize: s(10), fontWeight: "600", color: colors.teal }}>Kitchen</Text>
                    </View>
                  )}
                  {printer.lastPrintAt && (
                    <Text style={{ fontSize: s(10), color: colors.muted, flexShrink: 1 }} numberOfLines={1}>
                      Last: {getRelativeTime(printer.lastPrintAt)}
                    </Text>
                  )}
                </View>

                {/* Col 4 -- Action buttons */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: s(6), flexShrink: 0, marginLeft: s(10) }}>
                  {getPrinterReachability(printer) !== "connectable" && (
                    <TouchableOpacity
                      onPress={() => handleRetryConnection(printer)}
                      disabled={retryingPrinterId === printer.id}
                      style={{
                        padding: s(6),
                        backgroundColor: colors.teal + "15",
                        borderWidth: 1, borderColor: colors.teal + "40",
                        borderRadius: s(7),
                      }}
                    >
                      {retryingPrinterId === printer.id
                        ? <ActivityIndicator size="small" color={colors.teal} />
                        : <RefreshCw size={s(12)} color={colors.teal} />}
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
                      flexDirection: "row", alignItems: "center", gap: s(4),
                      paddingHorizontal: s(9), paddingVertical: s(5),
                      backgroundColor: isEditing ? colors.teal + "30" : colors.teal + "15",
                      borderWidth: 1,
                      borderColor: isEditing ? colors.teal + "70" : colors.teal + "40",
                      borderRadius: s(7),
                    }}
                  >
                    <Settings2 size={s(12)} color={colors.teal} />
                    <Text style={{ fontSize: s(11), fontWeight: "600", color: colors.teal }}>
                      {isEditing ? "Close" : "Configure"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleTestPrint(printer)}
                    disabled={isTestPrinting}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: s(4),
                      paddingHorizontal: s(9), paddingVertical: s(5),
                      backgroundColor: colors.teal + "15",
                      borderWidth: 1, borderColor: colors.teal + "40",
                      borderRadius: s(7),
                    }}
                  >
                    {isTestPrinting
                      ? <ActivityIndicator size="small" color={colors.teal} />
                      : <Printer size={s(12)} color={colors.teal} />}
                    <Text style={{ fontSize: s(11), fontWeight: "600", color: colors.teal }}>Test Print</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Expandable quick-actions panel (when editing) */}
              {isEditing && (
                <View style={{
                  paddingHorizontal: s(12),
                  paddingBottom: s(12),
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingTop: s(10),
                  gap: s(8),
                }}>
                  {/* Quick action row: Configure full settings + Routing + Delete */}
                  <View style={{ flexDirection: "row", gap: s(8) }}>
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
                        gap: s(6),
                        paddingVertical: s(9),
                        borderRadius: s(8),
                        backgroundColor: colors.teal + "15",
                        borderWidth: 1,
                        borderColor: colors.teal + "40",
                      }}
                    >
                      <Settings2 size={s(13)} color={colors.teal} />
                      <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.teal }}>
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
                          gap: s(6),
                          paddingVertical: s(9),
                          borderRadius: s(8),
                          backgroundColor: colors.teal + "15",
                          borderWidth: 1,
                          borderColor: colors.teal + "40",
                        }}
                      >
                        <Route size={s(13)} color={colors.teal} />
                        <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.teal }}>
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
                        paddingHorizontal: s(14),
                        paddingVertical: s(9),
                        borderRadius: s(8),
                        backgroundColor: colors.danger + "10",
                        borderWidth: 1,
                        borderColor: colors.danger + "30",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: s(5),
                      }}
                    >
                      <Trash2 size={s(13)} color={colors.danger} />
                      <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.danger }}>Delete</Text>
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
