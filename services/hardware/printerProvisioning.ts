// services/hardware/printerProvisioning.ts
// Simple, user-triggered printer provisioning — no auto-provisioning or device swap detection.

import { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoveredStarPrinter } from "@/services/printing/discovery/StarPrinterDiscovery";
import type { DeviceCapabilities } from "./deviceDetection";
import type { StationPaymentTerminal } from "@/types/station";
import type { PrinterConfig } from "@/types/printer";
import { printerRowToConfig } from "@/types/printer";
import { DejavooDriver } from "@/services/printing/drivers/DejavooDriver";
import {
  StarPrinter,
  StarConnectionSettings,
  InterfaceType,
  StarIO10InUseError,
} from "react-native-star-io10";
import { getStarPrinterMutex } from "@/services/printing/starPrinterMutex";
import { initLandiPrinter, getLandiPrinterStatus } from "@/native/LandiPrinter";
import { usePrinterStore } from "@/stores/usePrinterStore";

const TAG = "[PrinterProvisioning]";

// ============================================================================
// ADD STAR PRINTER
// ============================================================================

export async function addStarPrinter(
  supabase: SupabaseClient,
  stationId: string,
  locationId: string,
  merchantId: string,
  discovered: DiscoveredStarPrinter,
  role: "receipt" | "kitchen",
): Promise<string | null> {
  const caps = discovered.capabilities;

  // Check if a printer with this IP already exists at this location
  const { data: existing } = await supabase
    .from("printers")
    .select("id")
    .eq("location_id", locationId)
    .eq("network_address", discovered.ipAddress)
    .eq("printer_type", "star_micronics")
    .limit(1);

  if (existing?.length) {
    // Update existing row (IP match — same physical printer)
    // Printers are location-level resources — don't bind to a specific station
    await supabase
      .from("printers")
      .update({
        printer_name: `${discovered.modelName} (${discovered.ipAddress})`,
        printer_model: discovered.modelName,
        printer_role: role,
        paper_width: caps.paperWidth,
        max_chars_per_line: caps.maxCharsPerLine,
        supports_auto_cut: caps.supportsAutoCut,
        supports_cash_drawer_kick: true,
        is_active: true,
        metadata: {
          starModel: discovered.model,
          macAddress: discovered.macAddress,
          identifier: discovered.identifier,
          graphicsOnly: caps.graphicsOnly || false,
          emulation: discovered.emulation,
          serialNumber: discovered.serialNumber,
        },
      })
      .eq("id", existing[0].id);

    console.log(`${TAG} Updated Star printer ${existing[0].id} → ${discovered.ipAddress}`);
    usePrinterStore.getState().fetchPrinters(locationId);
    return existing[0].id;
  }

  // Insert new row
  const { data: inserted, error } = await supabase
    .from("printers")
    .insert({
      printer_name: `${discovered.modelName} (${discovered.ipAddress})`,
      printer_model: discovered.modelName,
      printer_type: "star_micronics",
      printer_role: role,
      connection_type: "network",
      network_address: discovered.ipAddress,
      paper_width: caps.paperWidth,
      max_chars_per_line: caps.maxCharsPerLine,
      supports_auto_cut: caps.supportsAutoCut,
      supports_cash_drawer_kick: true,
      supports_qr_code: true,
      supports_barcode: true,
      supports_logo: false,
      is_active: true,
      is_connected: false,
      location_id: locationId,
      merchant_id: merchantId,
      // Printers are location-level resources — no station binding
      metadata: {
        starModel: discovered.model,
        macAddress: discovered.macAddress,
        identifier: discovered.identifier,
        graphicsOnly: caps.graphicsOnly || false,
        emulation: discovered.emulation,
        serialNumber: discovered.serialNumber,
      },
    })
    .select("id")
    .single();

  if (error) {
    console.error(`${TAG} Failed to insert Star printer:`, error.message);
    return null;
  }

  console.log(`${TAG} Added Star printer:`, inserted?.id);
  usePrinterStore.getState().fetchPrinters(locationId);
  return inserted?.id ?? null;
}

// ============================================================================
// ADD BUILTIN (LANDI) PRINTER
// ============================================================================

export async function addBuiltinPrinter(
  supabase: SupabaseClient,
  stationId: string,
  locationId: string,
  merchantId: string,
  capabilities: DeviceCapabilities,
): Promise<string | null> {
  // Check if another active non-builtin printer already owns the default receipt role.
  // If so, the built-in should NOT steal that role — it's a fallback, not the primary.
  const { data: existingDefaults } = await supabase
    .from("printers")
    .select("id")
    .eq("location_id", locationId)
    .eq("is_default_receipt", true)
    .eq("is_active", true)
    .neq("connection_type", "builtin")
    .limit(1);
  const anotherPrinterIsDefault = (existingDefaults?.length ?? 0) > 0;

  // Check if a builtin row already exists for this station
  const { data: existing } = await supabase
    .from("printers")
    .select("id, is_active")
    .eq("station_id", stationId)
    .eq("connection_type", "builtin")
    .limit(1);

  if (existing?.length) {
    if (!existing[0].is_active) {
      // Reactivate deactivated row. Only take default receipt if nothing else holds it.
      await supabase
        .from("printers")
        .update({
          printer_name: `${capabilities.model} Built-in Printer`,
          printer_model: capabilities.model,
          is_active: true,
          is_connected: false,
          is_default_receipt: !anotherPrinterIsDefault,
        })
        .eq("id", existing[0].id);
      console.log(`${TAG} Reactivated builtin printer:`, existing[0].id, `default_receipt=${!anotherPrinterIsDefault}`);
    }
    usePrinterStore.getState().fetchPrinters(locationId);
    return existing[0].id;
  }

  // Insert new builtin row. Only set as default receipt if no other printer holds that role.
  const { data: inserted, error } = await supabase
    .from("printers")
    .insert({
      printer_name: `${capabilities.model} Built-in Printer`,
      printer_model: capabilities.model,
      printer_type: "builtin_landi",
      printer_role: "receipt",
      connection_type: "builtin",
      paper_width: 58,
      max_chars_per_line: 32,
      supports_auto_cut: true,
      supports_cash_drawer_kick: true,
      supports_qr_code: true,
      supports_barcode: false,
      supports_logo: false,
      is_default_receipt: !anotherPrinterIsDefault,
      is_active: true,
      is_connected: false,
      location_id: locationId,
      merchant_id: merchantId,
      station_id: stationId,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`${TAG} Failed to insert builtin printer:`, error.message);
    return null;
  }

  console.log(`${TAG} Added builtin printer:`, inserted?.id);
  usePrinterStore.getState().fetchPrinters(locationId);
  return inserted?.id ?? null;
}

// ============================================================================
// ADD DEJAVOO PRINTER
// ============================================================================

export async function addDejavooPrinter(
  supabase: SupabaseClient,
  stationId: string,
  locationId: string,
  merchantId: string,
  terminal: StationPaymentTerminal,
): Promise<string | null> {
  // Check if a dejavoo printer row already exists for this station
  const { data: existing } = await supabase
    .from("printers")
    .select("id, is_active")
    .eq("station_id", stationId)
    .eq("printer_type", "dejavoo_spin_p")
    .limit(1);

  if (existing?.length) {
    if (!existing[0].is_active) {
      await supabase
        .from("printers")
        .update({ is_active: true, is_connected: false })
        .eq("id", existing[0].id);
      console.log(`${TAG} Reactivated Dejavoo printer:`, existing[0].id);
    }
    usePrinterStore.getState().fetchPrinters(locationId);
    return existing[0].id;
  }

  // Fetch credentials via RPC
  const { data: creds, error: credsError } = await supabase.rpc("get_terminal_credentials", {
    p_terminal_id: terminal.id,
  });

  if (credsError || !creds?.success) {
    console.error(`${TAG} Failed to fetch terminal credentials:`, credsError?.message || creds?.error);
    return null;
  }

  const { data: inserted, error } = await supabase
    .from("printers")
    .insert({
      printer_name: `${terminal.terminal_name || "Dejavoo P18"} Printer`,
      printer_model: terminal.terminal_model || "Dejavoo P18",
      printer_type: "dejavoo_spin_p",
      printer_role: "receipt",
      connection_type: "network",
      paper_width: 58,
      max_chars_per_line: 32,
      supports_auto_cut: true,
      supports_cash_drawer_kick: false,
      supports_qr_code: true,
      supports_barcode: false,
      supports_logo: false,
      is_active: true,
      is_connected: false,
      location_id: locationId,
      merchant_id: merchantId,
      station_id: stationId,
      metadata: {
        dejavooAuthKey: creds.auth_key,
        dejavooRegisterId: terminal.register_id,
        dejavooBaseUrl: creds.api_base_url,
        paymentTerminalId: terminal.id,
      },
    })
    .select("id")
    .single();

  if (error) {
    console.error(`${TAG} Failed to insert Dejavoo printer:`, error.message);
    return null;
  }

  console.log(`${TAG} Added Dejavoo printer:`, inserted?.id);
  usePrinterStore.getState().fetchPrinters(locationId);
  return inserted?.id ?? null;
}

// ============================================================================
// TEST PRINTER CONNECTION
// ============================================================================

export async function testPrinterConnection(
  supabase: SupabaseClient,
  printer: PrinterConfig,
): Promise<{ online: boolean; error?: string }> {
  let online = false;
  let error: string | undefined;

  try {
    if (printer.printerType === "star_micronics") {
      ({ online, error } = await testStarConnection(printer));
    } else if (printer.printerType === "builtin_landi") {
      ({ online, error } = await testLandiConnection());
    } else if (printer.printerType === "dejavoo_spin_p") {
      ({ online, error } = await testDejavooConnection(printer));
    } else {
      return { online: false, error: `Unsupported printer type: ${printer.printerType}` };
    }
  } catch (e: any) {
    online = false;
    error = e.message;
  }

  // Update DB status
  await supabase
    .from("printers")
    .update({
      is_connected: online,
      last_status: online ? "verified" : `test_failed: ${error ?? "unknown"}`,
      last_status_at: new Date().toISOString(),
    })
    .eq("id", printer.id);

  return { online, error };
}

// ---- Star Micronics ----

async function testStarConnection(
  printer: PrinterConfig,
): Promise<{ online: boolean; error?: string }> {
  if (!printer.networkAddress) {
    return { online: false, error: "No network address configured" };
  }

  const mutex = getStarPrinterMutex(printer.networkAddress);
  return mutex.runExclusive(async () => {
    const settings = new StarConnectionSettings();
    settings.interfaceType = InterfaceType.Lan;
    settings.identifier = printer.networkAddress!;
    settings.autoSwitchInterface = false;

    const probe = new StarPrinter(settings);
    probe.openTimeout = 5000;
    probe.getStatusTimeout = 5000;

    try {
      await probe.open();
      await probe.getStatus();
      await probe.close();
      return { online: true };
    } catch (e: any) {
      try { await probe.close(); } catch { /* ignore */ }
      if (e instanceof StarIO10InUseError) return { online: true };
      return { online: false, error: e.message };
    } finally {
      try { await probe.dispose(); } catch { /* ignore */ }
    }
  });
}

// ---- Landi Built-in ----

async function testLandiConnection(): Promise<{ online: boolean; error?: string }> {
  const initOk = await initLandiPrinter();
  if (!initOk) return { online: false, error: "Landi printer init failed" };

  const status = await getLandiPrinterStatus();
  if (status?.isOnline) return { online: true };
  return { online: false, error: status?.errorMessage ?? "Printer offline" };
}

// ---- Dejavoo ----

async function testDejavooConnection(
  printer: PrinterConfig,
): Promise<{ online: boolean; error?: string }> {
  const driver = new DejavooDriver();
  try {
    await driver.initialize(printer);
    await driver.printDocument({
      nodes: [
        { type: "text_line", content: "DEXA POS", align: "center", format: { bold: true, doubleHeight: true } },
        { type: "empty_line" },
        { type: "text_line", content: "Printer Test Page", align: "center" },
        { type: "text_line", content: new Date().toLocaleString(), align: "center", format: { condensed: true } },
        { type: "feed", lines: 3 },
        { type: "cut" },
      ],
      maxCharsPerLine: 32,
    });
    return { online: true };
  } catch (e: any) {
    return { online: false, error: e.message };
  } finally {
    await driver.disconnect();
  }
}
