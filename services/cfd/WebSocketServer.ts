// src/services/cfd/WebSocketServer.ts
import { TcpServer, tcpServerEvents } from "@/native/TcpServer";
import { Buffer } from "buffer";
import { sha1 } from "js-sha1";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const HEARTBEAT_INTERVAL = 15000; // 15s ping interval
const HEARTBEAT_TIMEOUT = 20000; // Disconnect if no pong for 20s

type MessageHandler = (clientId: string, message: string) => void;
type ConnectionHandler = (clientId: string) => void;

interface WSClient {
  id: string;
  isUpgraded: boolean;
  buffer: Buffer;
  lastPongTime: number;
}

export class WebSocketServer {
  private clients: Map<string, WSClient> = new Map();
  private port: number;
  private onMessage: MessageHandler | null = null;
  private onConnect: ConnectionHandler | null = null;
  private onDisconnect: ConnectionHandler | null = null;
  private subscriptions: Array<{ remove: () => void }> = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(port: number = 8080) {
    this.port = port;
  }

  async start(handlers: {
    onMessage?: MessageHandler;
    onConnect?: ConnectionHandler;
    onDisconnect?: ConnectionHandler;
  }): Promise<{ ip: string; port: number }> {
    this.onMessage = handlers.onMessage ?? null;
    this.onConnect = handlers.onConnect ?? null;
    this.onDisconnect = handlers.onDisconnect ?? null;

    // Subscribe to native events
    if (tcpServerEvents) {
      this.subscriptions.push(
        tcpServerEvents.addListener("onClientConnect", ({ clientId }) => {
          this.clients.set(clientId, {
            id: clientId,
            isUpgraded: false,
            buffer: Buffer.alloc(0),
            lastPongTime: Date.now(),
          });
          if (__DEV__) console.log("[WS] New TCP connection:", clientId);
        }),
      );

      this.subscriptions.push(
        tcpServerEvents.addListener("onClientDisconnect", ({ clientId }) => {
          const client = this.clients.get(clientId);
          if (client?.isUpgraded) {
            this.onDisconnect?.(clientId);
          }
          this.clients.delete(clientId);
          if (__DEV__) console.log("[WS] Client disconnected:", clientId);
        }),
      );

      this.subscriptions.push(
        tcpServerEvents.addListener("onClientData", ({ clientId, data }) => {
          this.handleData(clientId, data);
        }),
      );
    }

    // Start TCP server
    const result = await TcpServer.start(this.port);
    if (__DEV__) console.log(`[WS] Server started at ${result.ip}:${result.port}`);

    // Start server-side heartbeat
    this.startHeartbeat();

    return result;
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      this.clients.forEach((client) => {
        if (!client.isUpgraded) return;

        // Check if client missed heartbeat timeout
        if (now - client.lastPongTime > HEARTBEAT_TIMEOUT) {
          console.error(`[WS] Client ${client.id} heartbeat timeout, disconnecting`);
          TcpServer.disconnect(client.id);
          return;
        }

        // Send ping frame (opcode 0x09)
        this.sendFrame(client.id, Buffer.alloc(0), 0x09);
      });
    }, HEARTBEAT_INTERVAL);
  }

  private handleData(clientId: string, base64Data: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Decode Base64 from native
    const chunk = Buffer.from(base64Data, "base64");

    // Append to buffer
    client.buffer = Buffer.concat([client.buffer, chunk]);

    // Not yet upgraded - check for HTTP upgrade request
    if (!client.isUpgraded) {
      const asString = client.buffer.toString("utf8");
      if (asString.includes("\r\n\r\n")) {
        if (__DEV__) console.log(`[WS] Found HTTP Upgrade Request for ${clientId}`);
        this.handleUpgrade(client);
      }
      return;
    }

    // Already upgraded - parse WebSocket frames
    this.parseFrames(client);
  }

  private handleUpgrade(client: WSClient): void {
    const request = client.buffer.toString("utf8");

    // Extract Sec-WebSocket-Key
    const keyMatch = request.match(/Sec-WebSocket-Key:\s*(.+)\r\n/i);
    if (!keyMatch) {
      console.error("[WS] No WebSocket key found, closing");
      TcpServer.disconnect(client.id);
      return;
    }

    const key = keyMatch[1].trim();
    const acceptKey = this.generateAcceptKey(key);

    // Send upgrade response
    const response = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      "",
    ].join("\r\n");

    TcpServer.send(client.id, response);

    client.isUpgraded = true;
    client.buffer = Buffer.alloc(0);
    client.lastPongTime = Date.now();

    if (__DEV__) console.log("[WS] Client upgraded:", client.id);
    this.onConnect?.(client.id);
  }

  private generateAcceptKey(key: string): string {
    const hash = sha1(key + WS_GUID);
    // Convert hex to base64
    const bytes: number[] = [];
    for (let i = 0; i < hash.length; i += 2) {
      bytes.push(parseInt(hash.substr(i, 2), 16));
    }
    return Buffer.from(bytes).toString("base64");
  }

  private parseFrames(client: WSClient): void {
    let buffer = client.buffer;
    let offset = 0;

    while (offset < buffer.length) {
      // Need at least 2 bytes
      if (buffer.length - offset < 2) break;

      const firstByte = buffer[offset];
      const secondByte = buffer[offset + 1];

      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;

      let headerLength = 2;

      if (payloadLength === 126) {
        if (buffer.length - offset < 4) break;
        payloadLength = buffer.readUInt16BE(offset + 2);
        headerLength = 4;
      } else if (payloadLength === 127) {
        if (buffer.length - offset < 10) break;
        payloadLength = Number(buffer.readBigUInt64BE(offset + 2));
        headerLength = 10;
      }

      if (isMasked) headerLength += 4;

      const totalLength = headerLength + payloadLength;
      if (buffer.length - offset < totalLength) break;

      // Extract payload
      let payload: Buffer = Buffer.from(buffer.subarray(offset + headerLength, offset + totalLength));

      // Unmask if needed
      if (isMasked) {
        const maskKey = Buffer.from(buffer.subarray(
          offset + headerLength - 4,
          offset + headerLength,
        ));
        payload = this.unmask(payload, maskKey);
      }

      // Handle frame by opcode
      if (opcode === 0x01) {
        // Text frame
        const message = payload.toString("utf8");
        this.onMessage?.(client.id, message);
      } else if (opcode === 0x08) {
        // Close frame
        TcpServer.disconnect(client.id);
      } else if (opcode === 0x09) {
        // Ping - respond with pong
        this.sendFrame(client.id, payload, 0x0a);
      } else if (opcode === 0x0a) {
        // Pong - update heartbeat timestamp
        client.lastPongTime = Date.now();
      }

      offset += totalLength;
    }

    // Keep unprocessed data
    client.buffer = Buffer.from(buffer.subarray(offset));
  }

  private unmask(payload: Buffer, maskKey: Buffer): Buffer {
    const result = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      result[i] = payload[i] ^ maskKey[i % 4];
    }
    return result;
  }

  private sendFrame(
    clientId: string,
    data: Buffer | string,
    opcode: number = 0x01,
  ): void {
    const payload = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    const length = payload.length;

    let header: Buffer;

    if (length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode;
      header[1] = length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    const frame = Buffer.concat([header, payload]);
    // The native module now expects Latin1/Binary string if we use .toByteArray(Charsets.ISO_8859_1)
    TcpServer.send(clientId, frame.toString("binary"));
  }

  // ==================== PUBLIC API ====================

  send(clientId: string, message: string): void {
    const client = this.clients.get(clientId);
    if (client?.isUpgraded) {
      this.sendFrame(clientId, message);
    }
  }

  broadcast(message: string): void {
    this.clients.forEach((client) => {
      if (client.isUpgraded) {
        this.sendFrame(client.id, message);
      }
    });
  }

  get clientCount(): number {
    let count = 0;
    this.clients.forEach((c) => {
      if (c.isUpgraded) count++;
    });
    return count;
  }

  get connectedClientIds(): string[] {
    const ids: string[] = [];
    this.clients.forEach((c) => {
      if (c.isUpgraded) ids.push(c.id);
    });
    return ids;
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.subscriptions.forEach((s) => s.remove());
    this.subscriptions = [];
    this.clients.clear();
    await TcpServer.stop();
  }
}
