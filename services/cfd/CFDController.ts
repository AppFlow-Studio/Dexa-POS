// src/services/cfd/CFDController.ts
import { NsdPublisher } from "@/native/NsdPublisher";
import type {
    CFDBranding,
    CFDCartItem,
    CFDMessage,
    CFDPairingData,
    CFDPayload,
    CFDPhoneResponse,
    CFDScreenState,
    CFDTipResponse,
} from "@/types/cfd.types";
import type { LoyaltyEarnResult } from "@/services/loyalty/loyaltyService";
import * as Device from "expo-device";
import { WebSocketServer } from "./WebSocketServer";

interface CFDCallbacks {
  onCFDConnected?: (clientId: string) => void;
  onCFDDisconnected?: (clientId: string) => void;
  onTipSelected?: (response: CFDTipResponse) => void;
  onPhoneSubmitted?: (phone: string) => void;
  onLoyaltySkip?: () => void;
}

export class CFDController {
  private server: WebSocketServer;
  private callbacks: CFDCallbacks = {};
  private lastPayload: Partial<CFDPayload> = {};
  private serverInfo: { ip: string; port: number } | null = null;

  // Station/Location context
  private stationId: string;
  private stationName: string;
  private locationId: string;
  private branding: CFDBranding;

  constructor(config: {
    stationId: string;
    stationName: string;
    locationId: string;
    branding: CFDBranding;
    port?: number;
  }) {
    this.stationId = config.stationId;
    this.stationName = config.stationName;
    this.locationId = config.locationId;
    this.branding = config.branding;
    this.server = new WebSocketServer(config.port ?? 8765);
  }

  async start(callbacks?: CFDCallbacks): Promise<{ ip: string; port: number }> {
    if (callbacks) this.callbacks = callbacks;

    this.serverInfo = await this.server.start({
      onConnect: (clientId) => {
        console.log("[CFD] Client connected:", clientId);
        this.callbacks.onCFDConnected?.(clientId);

        // Send current state + branding to new client
        this.sendFullState();
      },
      onDisconnect: (clientId) => {
        console.log("[CFD] Client disconnected:", clientId);
        this.callbacks.onCFDDisconnected?.(clientId);
      },
      onMessage: (clientId, raw) => {
        this.handleMessage(clientId, raw);
      },
    });

    // Emulator Handling: Verify if running on emulator and override IP
    // Android emulators (10.0.2.x) cannot be reached by other devices directly.
    // Use 10.0.2.2 (host Mac) so the CFD client on another emulator/device can
    // connect via: adb forward tcp:<port> tcp:<port>
    if (!Device.isDevice && this.serverInfo.ip.startsWith("10.0.2.")) {
      console.log(
        `[CFD] Emulator detected. Overriding IP with Host Loopback: 10.0.2.2:${this.serverInfo.port}`,
      );
      this.serverInfo.ip = "10.0.2.2";
      // port stays as-is — adb forward maps it on the host
    }

    console.log(
      `[CFD] Controller ready at ${this.serverInfo.ip}:${this.serverInfo.port}`,
    );

    // Register NSD service for auto-discovery
    NsdPublisher.register(this.serverInfo.port, {
      stationId: this.stationId,
      stationName: this.stationName,
      locationId: this.locationId,
      locationName: this.branding.restaurantName,
    }).catch((e) => {
      if (__DEV__) console.log("[CFD] NSD registration failed (non-fatal):", e);
    });

    return this.serverInfo;
  }

  private handleMessage(clientId: string, raw: string): void {
    try {
      const message: CFDMessage = JSON.parse(raw);

      switch (message.type) {
        case "ping":
          this.server.send(
            clientId,
            JSON.stringify({
              type: "pong",
              timestamp: Date.now(),
            }),
          );
          break;

        case "tip_selected":
          if (message.payload) {
            this.callbacks.onTipSelected?.(message.payload as CFDTipResponse);
          }
          break;

        case "phone_submitted":
          if (message.payload) {
            this.callbacks.onPhoneSubmitted?.((message.payload as CFDPhoneResponse).phone);
          }
          break;

        case "loyalty_skip":
          this.callbacks.onLoyaltySkip?.();
          break;

        default:
          console.log("[CFD] Unknown message type:", message.type);
      }
    } catch (e) {
      console.error("[CFD] Parse error:", e);
    }
  }

  private sendFullState(): void {
    const payload: CFDPayload = {
      stationId: this.stationId,
      stationName: this.stationName,
      locationId: this.locationId,
      serverName: this.lastPayload.serverName ?? null,
      customerName: this.lastPayload.customerName ?? null,
      screenState: this.lastPayload.screenState ?? "idle",
      orderNumber: this.lastPayload.orderNumber ?? null,
      orderType: this.lastPayload.orderType ?? null,
      tableName: this.lastPayload.tableName ?? null,
      guestCount: this.lastPayload.guestCount ?? null,
      items: this.lastPayload.items ?? [],
      subtotal: this.lastPayload.subtotal ?? 0,
      subtotalCash: this.lastPayload.subtotalCash ?? 0,
      subtotalCard: this.lastPayload.subtotalCard ?? 0,
      discountAmount: this.lastPayload.discountAmount ?? 0,
      taxAmount: this.lastPayload.taxAmount ?? 0,
      taxCash: this.lastPayload.taxCash ?? 0,
      taxCard: this.lastPayload.taxCard ?? 0,
      tipAmount: this.lastPayload.tipAmount ?? 0,
      tipPercentage: this.lastPayload.tipPercentage ?? null,
      total: this.lastPayload.total ?? 0,
      totalCash: this.lastPayload.totalCash ?? 0,
      totalCard: this.lastPayload.totalCard ?? 0,
      savingsAmount: this.lastPayload.savingsAmount ?? 0,
      outstandingTotal: this.lastPayload.outstandingTotal ?? 0,
      amountPaid: this.lastPayload.amountPaid ?? 0,
      paymentMethod: this.lastPayload.paymentMethod ?? null,
      branding: this.branding,
      layout: this.lastPayload.layout,
      orderingPanelImages: this.lastPayload.orderingPanelImages,
      tipConfig: this.lastPayload.tipConfig,
      carouselImages: this.lastPayload.carouselImages,
      loyaltyPrompt: this.lastPayload.loyaltyPrompt,
      loyaltyResult: this.lastPayload.loyaltyResult,
      timestamp: Date.now(),
    };

    this.broadcast(payload);
  }

  private broadcast(payload: CFDPayload): void {
    this.lastPayload = payload;
    const message: CFDMessage = {
      type: "state_update",
      payload,
      timestamp: Date.now(),
    };
    this.server.broadcast(JSON.stringify(message));
  }

  // ==================== PUBLIC API ====================

  /**
   * Update cart display on CFD
   */
  updateOrder(params: {
    screenState?: CFDScreenState;
    serverName?: string | null;
    customerName?: string | null;
    orderNumber: string | null;
    orderType: string | null;
    tableName?: string | null;
    guestCount: number | null;
    items: CFDCartItem[];
    subtotal: number;
    subtotalCash: number;
    subtotalCard: number;
    discountAmount: number;
    taxAmount: number;
    taxCash: number;
    taxCard: number;
    tipAmount: number;
    tipPercentage: number | null;
    total: number;
    totalCash: number;
    totalCard: number;
    savingsAmount: number;
    outstandingTotal: number;
    amountPaid: number;
    paymentMethod?: "cash" | "card" | "manual" | null;
    layout?: CFDPayload["layout"];
    orderingPanelImages?: CFDPayload["orderingPanelImages"];
    tipConfig?: CFDPayload["tipConfig"];
  }): void {
    const screenState =
      params.screenState || (params.items.length > 0 ? "ordering" : "idle");

    const payload: CFDPayload = {
      stationId: this.stationId,
      stationName: this.stationName,
      locationId: this.locationId,
      screenState,
      ...params,
      paymentMethod: params.paymentMethod ?? this.lastPayload.paymentMethod ?? null,
      branding: this.branding,
      timestamp: Date.now(),
    };

    this.broadcast(payload);
  }

  /**
   * Show tip selection screen
   */
  showTipSelection(
    subtotalForTip: number,
    presetPercentages = [15, 18, 20, 25],
  ): void {
    this.broadcast({
      ...(this.lastPayload as CFDPayload),
      screenState: "tip_selection",
      tipConfig: {
        subtotalForTip,
        presetPercentages,
        allowCustom: true,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Show "Present Card" screen
   */
  showPayment(paymentMethod?: "cash" | "card" | "manual"): void {
    this.broadcast({
      ...(this.lastPayload as CFDPayload),
      screenState: "payment",
      paymentMethod: paymentMethod ?? null,
      timestamp: Date.now(),
    });
  }

  /**
   * Show processing spinner
   */
  showProcessing(paymentMethod?: "cash" | "card" | "manual", totals?: { total: number; totalCard: number; totalCash: number; tipAmount: number; savingsAmount: number; outstandingTotal: number; amountPaid: number }): void {
    this.broadcast({
      ...(this.lastPayload as CFDPayload),
      screenState: "processing",
      paymentMethod: paymentMethod ?? null,
      ...(totals ?? {}),
      timestamp: Date.now(),
    });
  }

  /**
   * Show approved result
   */
  showApproved(totals?: { total: number; totalCard: number; totalCash: number; tipAmount: number; savingsAmount: number; paymentMethod?: "cash" | "card" | "manual" | null }): void {
    this.broadcast({
      ...(this.lastPayload as CFDPayload),
      screenState: "approved",
      ...(totals ?? {}),
      timestamp: Date.now(),
    });
  }

  /**
   * Show declined result
   */
  showDeclined(totals?: { total: number; totalCard: number; totalCash: number; tipAmount: number; savingsAmount: number; paymentMethod?: "cash" | "card" | "manual" | null }): void {
    this.broadcast({
      ...(this.lastPayload as CFDPayload),
      screenState: "declined",
      ...(totals ?? {}),
      timestamp: Date.now(),
    });
  }

  /**
   * Show idle/branding screen
   */
  showIdle(): void {
    this.broadcast({
      stationId: this.stationId,
      stationName: this.stationName,
      locationId: this.locationId,
      serverName: null,
      customerName: null,
      screenState: "idle",
      orderNumber: null,
      orderType: null,
      tableName: null,
      guestCount: null,
      items: [],
      subtotal: 0,
      subtotalCash: 0,
      subtotalCard: 0,
      discountAmount: 0,
      taxAmount: 0,
      taxCash: 0,
      taxCard: 0,
      tipAmount: 0,
      tipPercentage: null,
      total: 0,
      totalCash: 0,
      totalCard: 0,
      savingsAmount: 0,
      outstandingTotal: 0,
      amountPaid: 0,
      paymentMethod: null,
      branding: this.branding,
      layout: this.lastPayload.layout,
      orderingPanelImages: this.lastPayload.orderingPanelImages,
      tipConfig: null,
      carouselImages: this.lastPayload.carouselImages,
      loyaltyPrompt: undefined,
      loyaltyResult: undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Show loyalty phone entry screen
   */
  showLoyaltyPrompt(merchantName: string): void {
    this.broadcast({
      ...(this.lastPayload as CFDPayload),
      screenState: "loyalty_prompt",
      loyaltyPrompt: { merchantName },
      loyaltyResult: undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Show loyalty points earned confirmation
   */
  showLoyaltyConfirmation(result: LoyaltyEarnResult[], customerName?: string): void {
    this.broadcast({
      ...(this.lastPayload as CFDPayload),
      screenState: "loyalty_confirmation",
      loyaltyResult: {
        customerName,
        programs: result.map((r) => ({
          name: r.program_name,
          type: r.program_type,
          earned: r.earned,
          newBalance: r.new_balance,
          rewardUnlocked: r.reward_unlocked,
        })),
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Get QR code pairing data
   */
  getPairingData(): CFDPairingData | null {
    if (!this.serverInfo) return null;

    return {
      ip: this.serverInfo.ip,
      port: this.serverInfo.port,
      stationId: this.stationId,
      stationName: this.stationName,
      locationId: this.locationId,
      locationName: this.branding.restaurantName,
    };
  }

  /**
   * Update branding without restarting the server (called when logo URL changes)
   */
  updateBranding(branding: CFDBranding): void {
    this.branding = branding;
    if (this.lastPayload.screenState !== undefined) {
      this.broadcast({ ...(this.lastPayload as CFDPayload), branding, timestamp: Date.now() });
    }
  }

  /**
   * Update idle carousel images
   */
  updateCarouselImages(images: string[]): void {
    this.broadcast({
      ...(this.lastPayload as CFDPayload),
      carouselImages: images,
      timestamp: Date.now(),
    });
  }

  updateOrderingPanelImages(images: NonNullable<CFDPayload["orderingPanelImages"]>): void {
    this.broadcast({
      ...(this.lastPayload as CFDPayload),
      orderingPanelImages: images,
      timestamp: Date.now(),
    });
  }

  get isConnected(): boolean {
    return this.server.clientCount > 0;
  }

  get clientCount(): number {
    return this.server.clientCount;
  }

  get connectedClientIds(): string[] {
    return this.server.connectedClientIds;
  }

  disconnectClient(clientId: string): void {
    this.server.disconnectClient(clientId);
  }

  async unpairClient(clientId: string): Promise<void> {
    // Send exit_cfd_mode command to client so it exits CFD mode and returns to POS login
    this.server.send(clientId, JSON.stringify({ type: 'exit_cfd_mode', timestamp: Date.now() }));
    // Wait longer to allow client to process the message and exit CFD mode
    await new Promise(resolve => setTimeout(resolve, 500));
    this.server.disconnectClient(clientId);
  }

  getServerInfo(): { ip: string; port: number } | null {
    return this.serverInfo;
  }

  async stop(): Promise<void> {
    NsdPublisher.unregister().catch(() => {});
    await this.server.stop();
    this.serverInfo = null;
  }
}
