// src/services/cfd/CFDController.ts
import { WebSocketServer } from './WebSocketServer'
import { TcpServer } from '@/native/TcpServer'
import type {
  CFDPayload,
  CFDTipResponse,
  CFDScreenState,
  CFDCartItem,
  CFDBranding,
  CFDMessage,
  CFDPairingData,
} from '@/types/cfd.types'

interface CFDCallbacks {
  onCFDConnected?: (clientId: string) => void
  onCFDDisconnected?: (clientId: string) => void
  onTipSelected?: (response: CFDTipResponse) => void
}

export class CFDController {
  private server: WebSocketServer
  private callbacks: CFDCallbacks = {}
  private lastPayload: Partial<CFDPayload> = {}
  private serverInfo: { ip: string; port: number } | null = null

  // Station/Location context
  private stationId: string
  private stationName: string
  private locationId: string
  private branding: CFDBranding

  constructor(config: {
    stationId: string
    stationName: string
    locationId: string
    branding: CFDBranding
    port?: number
  }) {
    this.stationId = config.stationId
    this.stationName = config.stationName
    this.locationId = config.locationId
    this.branding = config.branding
    this.server = new WebSocketServer(config.port ?? 8080)
  }

  async start(callbacks?: CFDCallbacks): Promise<{ ip: string; port: number }> {
    if (callbacks) this.callbacks = callbacks

    this.serverInfo = await this.server.start({
      onConnect: (clientId) => {
        console.log('[CFD] Client connected:', clientId)
        this.callbacks.onCFDConnected?.(clientId)
        
        // Send current state + branding to new client
        this.sendFullState()
      },
      onDisconnect: (clientId) => {
        console.log('[CFD] Client disconnected:', clientId)
        this.callbacks.onCFDDisconnected?.(clientId)
      },
      onMessage: (clientId, raw) => {
        this.handleMessage(clientId, raw)
      },
    })

    console.log(`[CFD] Controller ready at ${this.serverInfo.ip}:${this.serverInfo.port}`)
    return this.serverInfo
  }

  private handleMessage(clientId: string, raw: string): void {
    try {
      const message: CFDMessage = JSON.parse(raw)

      switch (message.type) {
        case 'ping':
          this.server.send(clientId, JSON.stringify({
            type: 'pong',
            timestamp: Date.now(),
          }))
          break

        case 'tip_selected':
          if (message.payload) {
            this.callbacks.onTipSelected?.(message.payload as CFDTipResponse)
          }
          break

        default:
          console.log('[CFD] Unknown message type:', message.type)
      }
    } catch (e) {
      console.error('[CFD] Parse error:', e)
    }
  }

  private sendFullState(): void {
    const payload: CFDPayload = {
      stationId: this.stationId,
      stationName: this.stationName,
      locationId: this.locationId,
      screenState: this.lastPayload.screenState ?? 'idle',
      orderNumber: this.lastPayload.orderNumber ?? null,
      orderType: this.lastPayload.orderType ?? null,
      guestCount: this.lastPayload.guestCount ?? null,
      items: this.lastPayload.items ?? [],
      subtotal: this.lastPayload.subtotal ?? 0,
      discountAmount: this.lastPayload.discountAmount ?? 0,
      taxAmount: this.lastPayload.taxAmount ?? 0,
      tipAmount: this.lastPayload.tipAmount ?? 0,
      total: this.lastPayload.total ?? 0,
      outstandingTotal: this.lastPayload.outstandingTotal ?? 0,
      amountPaid: this.lastPayload.amountPaid ?? 0,
      branding: this.branding,
      tipConfig: this.lastPayload.tipConfig,
      timestamp: Date.now(),
    }

    this.broadcast(payload)
  }

  private broadcast(payload: CFDPayload): void {
    this.lastPayload = payload
    const message: CFDMessage = {
      type: 'state_update',
      payload,
      timestamp: Date.now(),
    }
    this.server.broadcast(JSON.stringify(message))
  }

  // ==================== PUBLIC API ====================

  /**
   * Update cart display on CFD
   */
  updateOrder(params: {
    orderNumber: string | null
    orderType: string | null
    guestCount: number | null
    items: CFDCartItem[]
    subtotal: number
    discountAmount: number
    taxAmount: number
    tipAmount: number
    total: number
    outstandingTotal: number
    amountPaid: number
  }): void {
    const screenState: CFDScreenState = params.items.length > 0 ? 'ordering' : 'idle'

    this.broadcast({
      stationId: this.stationId,
      stationName: this.stationName,
      locationId: this.locationId,
      screenState,
      ...params,
      branding: this.branding,
      timestamp: Date.now(),
    })
  }

  /**
   * Show tip selection screen
   */
  showTipSelection(subtotalForTip: number, presetPercentages = [15, 18, 20, 25]): void {
    this.broadcast({
      ...this.lastPayload as CFDPayload,
      screenState: 'tip_selection',
      tipConfig: {
        subtotalForTip,
        presetPercentages,
        allowCustom: true,
      },
      timestamp: Date.now(),
    })
  }

  /**
   * Show "Present Card" screen
   */
  showPayment(): void {
    this.broadcast({
      ...this.lastPayload as CFDPayload,
      screenState: 'payment',
      timestamp: Date.now(),
    })
  }

  /**
   * Show processing spinner
   */
  showProcessing(): void {
    this.broadcast({
      ...this.lastPayload as CFDPayload,
      screenState: 'processing',
      timestamp: Date.now(),
    })
  }

  /**
   * Show approved result
   */
  showApproved(): void {
    this.broadcast({
      ...this.lastPayload as CFDPayload,
      screenState: 'approved',
      timestamp: Date.now(),
    })
  }

  /**
   * Show declined result
   */
  showDeclined(): void {
    this.broadcast({
      ...this.lastPayload as CFDPayload,
      screenState: 'declined',
      timestamp: Date.now(),
    })
  }

  /**
   * Show idle/branding screen
   */
  showIdle(): void {
    this.broadcast({
      stationId: this.stationId,
      stationName: this.stationName,
      locationId: this.locationId,
      screenState: 'idle',
      orderNumber: null,
      orderType: null,
      guestCount: null,
      items: [],
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      tipAmount: 0,
      total: 0,
      outstandingTotal: 0,
      amountPaid: 0,
      branding: this.branding,
      timestamp: Date.now(),
    })
  }

  /**
   * Get QR code pairing data
   */
  getPairingData(): CFDPairingData | null {
    if (!this.serverInfo) return null

    return {
      ip: this.serverInfo.ip,
      port: this.serverInfo.port,
      stationId: this.stationId,
      stationName: this.stationName,
      locationId: this.locationId,
      locationName: this.branding.restaurantName,
    }
  }

  get isConnected(): boolean {
    return this.server.clientCount > 0
  }

  get clientCount(): number {
    return this.server.clientCount
  }

  getServerInfo(): { ip: string; port: number } | null {
    return this.serverInfo
  }

  async stop(): Promise<void> {
    await this.server.stop()
    this.serverInfo = null
  }
}