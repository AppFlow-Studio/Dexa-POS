// src/native/TcpServer.ts
import { NativeModules, NativeEventEmitter, Platform } from 'react-native'

interface ServerInfo {
  ip: string
  port: number
  isRunning: boolean
  clientCount: number
}

interface TcpServerNative {
  startServer(port: number): Promise<{ ip: string; port: number }>
  stopServer(): Promise<boolean>
  sendToClient(clientId: string, data: string): void
  broadcastToAll(data: string): void
  disconnectClient(clientId: string): void
  getConnectedClients(): Promise<string[]>
  getServerInfo(): Promise<ServerInfo>
}

const { TcpServerModule } = NativeModules as { TcpServerModule: TcpServerNative }

export const tcpServerEvents = Platform.OS === 'android' 
  ? new NativeEventEmitter(NativeModules.TcpServerModule)
  : null

export const TcpServer = {
  start: (port: number) => TcpServerModule.startServer(port),
  stop: () => TcpServerModule.stopServer(),
  send: (clientId: string, data: string) => TcpServerModule.sendToClient(clientId, data),
  broadcast: (data: string) => TcpServerModule.broadcastToAll(data),
  disconnect: (clientId: string) => TcpServerModule.disconnectClient(clientId),
  getClients: () => TcpServerModule.getConnectedClients(),
  getInfo: () => TcpServerModule.getServerInfo(),
}