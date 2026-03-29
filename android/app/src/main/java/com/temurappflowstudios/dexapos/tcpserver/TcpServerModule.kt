// android/app/src/main/java/com/temurappflowstudios/dexapos/tcpserver/TcpServerModule.kt
package com.temurappflowstudios.dexapos.tcpserver

import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.*

class TcpServerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile private var serverSocket: ServerSocket? = null
    private var isRunning = false
    private val clients = ConcurrentHashMap<String, ClientConnection>()

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

        scope.launch {
            try {
                val socket = ServerSocket()
                socket.reuseAddress = true // Crucial for "Address already in use" fix
                socket.bind(InetSocketAddress(InetAddress.getByName("0.0.0.0"), port))

                serverSocket = socket
                isRunning = true

                val ip = getLocalIpAddress()
                Log.d(TAG, "Server started on $ip:$port")

                // Start foreground service to keep process alive when screen dims (Android 8+ requirement)
                val serviceIntent = Intent(reactApplicationContext, CfdForegroundService::class.java)
                    .setAction(CfdForegroundService.ACTION_START)
                reactApplicationContext.startForegroundService(serviceIntent)

                promise.resolve(Arguments.createMap().apply {
                    putString("ip", ip)
                    putInt("port", port)
                })

                // Accept loop — isActive tracks coroutine cancellation from scope.cancel()
                while (isActive) {
                    try {
                        val clientSocket = socket.accept()
                        launch { handleClient(clientSocket) }  // supervised child — one crash doesn't kill the server
                    } catch (e: Exception) {
                        if (isActive) {
                            Log.e(TAG, "Accept error: ${e.message}")
                        }
                    }
                }
            } catch (e: CancellationException) {
                throw e  // must re-throw for structured cancellation to propagate correctly
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
        // Stop foreground service
        try {
            val serviceIntent = Intent(reactApplicationContext, CfdForegroundService::class.java)
                .setAction(CfdForegroundService.ACTION_STOP)
            reactApplicationContext.startService(serviceIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping foreground service: ${e.message}")
        }
    }

    @ReactMethod
    fun stopServer(promise: Promise) {
        stopServerInternal()
        promise.resolve(true)
    }

    override fun invalidate() {
        super.invalidate()
        scope.cancel()                              // cancels ALL child coroutines, propagates CancellationException
        runCatching { clients.values.forEach { it.close() } }  // unblocks blocked read() on each client
        clients.clear()
        runCatching { serverSocket?.close() }       // unblocks the accept() call
        serverSocket = null
        isRunning = false
        // Stop foreground service
        try {
            val serviceIntent = Intent(reactApplicationContext, CfdForegroundService::class.java)
                .setAction(CfdForegroundService.ACTION_STOP)
            reactApplicationContext.startService(serviceIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping foreground service on invalidate: ${e.message}")
        }
    }

    // ==================== CLIENT MANAGEMENT ====================

    private suspend fun handleClient(socket: Socket) {
        // Socket options — set immediately after accept(), before any I/O
        socket.tcpNoDelay = true    // disable Nagle — critical for low-latency WebSocket frames (avoids 40ms batching delay)
        socket.keepAlive  = true    // OS-level dead peer detection (backs up WS heartbeat)
        socket.soTimeout  = 30_000  // unblock read() after 30s; prevents zombie threads on silent disconnects

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

        try {
            connection.startReading {
                // On disconnect
                clients.remove(clientId)
                sendEvent("onClientDisconnect", Arguments.createMap().apply {
                    putString("clientId", clientId)
                })
            }
        } catch (e: CancellationException) {
            connection.close()
            throw e
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
                // JS sends Base64-encoded bytes (symmetric with the receive path).
                // Base64 is safe through the JSI bridge — no null bytes, all ASCII < 128.
                output.write(android.util.Base64.decode(data, android.util.Base64.NO_WRAP))
                output.flush()
            } catch (e: Exception) {
                Log.e(TAG, "Send error to $id: ${e.message}")
            }
        }

        fun startReading(onDisconnect: () -> Unit) {
            try {
                val buffer = ByteArray(32_768)  // 32KB — fewer syscalls on WiFi bursts (was 4096)

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
