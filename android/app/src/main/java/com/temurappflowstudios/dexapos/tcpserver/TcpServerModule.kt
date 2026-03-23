// android/app/src/main/java/com/temurappflowstudios/dexapos/tcpserver/TcpServerModule.kt
package com.temurappflowstudios.dexapos.tcpserver

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.concurrent.thread

class TcpServerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var serverSocket: ServerSocket? = null
    private var isRunning = false
    private val clients = ConcurrentHashMap<String, ClientConnection>()
    private val executor: ExecutorService = Executors.newCachedThreadPool()
    
    companion object {
        const val TAG = "TcpServer"
        const val NAME = "TcpServerModule"
    }

    override fun getName(): String = NAME

    // ==================== SERVER LIFECYCLE ====================

    @ReactMethod
    fun startServer(port: Int, promise: Promise) {
        if (isRunning) {
            // If already running on the SAME port, just resolve successfully
            if (serverSocket?.localPort == port) {
                promise.resolve(Arguments.createMap().apply {
                    putString("ip", getLocalIpAddress())
                    putInt("port", port)
                })
                return
            }
            // If running on a DIFFERENT port, stop first then continue
            stopServerInternal()
        }

        executor.execute {
            try {
                // Use unbound socket to enable reuse address before binding
                val socket = ServerSocket()
                socket.reuseAddress = true // Crucial for "Address already in use" fix
                socket.bind(java.net.InetSocketAddress(InetAddress.getByName("0.0.0.0"), port))
                
                serverSocket = socket
                isRunning = true
                
                val ip = getLocalIpAddress()
                Log.d(TAG, "Server started on $ip:$port")
                
                promise.resolve(Arguments.createMap().apply {
                    putString("ip", ip)
                    putInt("port", port)
                })

                // Accept loop
                while (isRunning) {
                    try {
                        val clientSocket = serverSocket?.accept() ?: break
                        handleNewClient(clientSocket)
                    } catch (e: Exception) {
                        if (isRunning) {
                            Log.e(TAG, "Accept error: ${e.message}")
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Server start error: ${e.message}")
                promise.reject("START_FAILED", e.message)
            }
        }
    }

    private fun stopServerInternal() {
        isRunning = false
        try {
            clients.values.forEach { it.close() }
            clients.clear()
            serverSocket?.close()
            serverSocket = null
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping server: ${e.message}")
        }
    }

    @ReactMethod
    fun stopServer(promise: Promise) {
        stopServerInternal()
        promise.resolve(true)
    }

    override fun invalidate() {
        super.invalidate()
        stopServerInternal()
    }

    // ==================== CLIENT MANAGEMENT ====================

    private fun handleNewClient(socket: Socket) {
        val clientId = "${socket.inetAddress.hostAddress}:${socket.port}"
        Log.d(TAG, "New client: $clientId")
        
        val connection = ClientConnection(clientId, socket) { id, data ->
            // Forward data to JS
            sendEvent("onClientData", Arguments.createMap().apply {
                putString("clientId", id)
                putString("data", data)
            })
        }
        
        clients[clientId] = connection
        
        sendEvent("onClientConnect", Arguments.createMap().apply {
            putString("clientId", clientId)
        })
        
        // Start reading in background
        executor.execute {
            connection.startReading {
                // On disconnect
                clients.remove(clientId)
                sendEvent("onClientDisconnect", Arguments.createMap().apply {
                    putString("clientId", clientId)
                })
            }
        }
    }

    @ReactMethod
    fun sendToClient(clientId: String, data: String) {
        clients[clientId]?.send(data)
    }

    @ReactMethod
    fun broadcastToAll(data: String) {
        clients.values.forEach { it.send(data) }
    }

    @ReactMethod
    fun disconnectClient(clientId: String) {
        clients[clientId]?.close()
        clients.remove(clientId)
    }

    @ReactMethod
    fun getConnectedClients(promise: Promise) {
        val array = Arguments.createArray()
        clients.keys.forEach { array.pushString(it) }
        promise.resolve(array)
    }

    @ReactMethod
    fun getServerInfo(promise: Promise) {
        promise.resolve(Arguments.createMap().apply {
            putString("ip", getLocalIpAddress())
            putInt("port", serverSocket?.localPort ?: 0)
            putBoolean("isRunning", isRunning)
            putInt("clientCount", clients.size)
        })
    }

    // ==================== HELPERS ====================

    private fun getLocalIpAddress(): String {
        try {
            NetworkInterface.getNetworkInterfaces()?.toList()?.forEach { intf ->
                intf.inetAddresses?.toList()?.forEach { addr ->
                    if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) {
                        return addr.hostAddress ?: "0.0.0.0"
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get IP: ${e.message}")
        }
        return "0.0.0.0"
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    // ==================== CLIENT CONNECTION CLASS ====================

    private inner class ClientConnection(
        val id: String,
        val socket: Socket,
        val onData: (String, String) -> Unit
    ) {
        private val output: OutputStream = socket.getOutputStream()
        private val input: java.io.InputStream = socket.getInputStream()

        @Synchronized
        fun send(data: String) {
            try {
                // Determine if data is raw bytes or string? 
                // For simplicity, we assume the JS sends us a STRING which is actually raw bytes in string form (bad) 
                // OR we assume JS sends us Base64? 
                // Current implementation in WebSocketServer.ts sends .toString('binary') which is a raw string.
                // It is safer if JS sends Base64, but let's stick to .toByteArary() for now if JS sends raw string, 
                // OR change JS to send Base64 too. 
                // Let's assume JS sends raw chars for now (native module takes String).
                output.write(data.toByteArray(Charsets.ISO_8859_1)) // Use Latin1 to preserve byte values 1-to-1 if passed as string
                output.flush()
            } catch (e: Exception) {
                Log.e(TAG, "Send error to $id: ${e.message}")
            }
        }

        fun startReading(onDisconnect: () -> Unit) {
            try {
                val buffer = ByteArray(4096)
                
                while (socket.isConnected && !socket.isClosed) {
                    val bytesRead = input.read(buffer)
                    if (bytesRead == -1) break
                    
                    if (bytesRead > 0) {
                        // Convert raw bytes to Base64 to safely transmit to JS
                        val base64Data = android.util.Base64.encodeToString(buffer, 0, bytesRead, android.util.Base64.NO_WRAP)
                        onData(id, base64Data)
                    }
                }
            } catch (e: Exception) {
                Log.d(TAG, "Client $id disconnected: ${e.message}")
            } finally {
                close()
                onDisconnect()
            }
        }

        fun close() {
            try {
                socket.close()
            } catch (e: Exception) {
                // Ignore
            }
        }
    }
}