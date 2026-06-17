package expo.modules.castlesusb

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import com.hoho.android.usbserial.driver.CdcAcmSerialDriver
import com.hoho.android.usbserial.driver.ProbeTable
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import com.hoho.android.usbserial.util.SerialInputOutputManager
import java.util.concurrent.Executors

private const val ACTION_USB_PERMISSION = "expo.modules.castlesusb.USB_PERMISSION"

/** Castles Technology Co., Ltd. USB vendor ID */
private const val CASTLES_VENDOR_ID = 0x0CA6

/** Known Saturn1000 product IDs — add more as discovered on LANDI/other devices */
private val CASTLES_PRODUCT_IDS = intArrayOf(0x0070)

/** Read buffer size — 16 KB handles large JSON payment responses */
private const val READ_BUFFER_SIZE = 16 * 1024

/**
 * Per-read timeout for the background read thread (ms). MUST be > 0.
 *
 * With the library default of 0 the read blocks indefinitely, so on a cable
 * detach the read thread never notices stop() and keeps occupying the single
 * ioExecutor thread. The next open()'s read manager then queues behind that
 * stuck thread and never runs — the port opens and writes succeed, but no
 * responses are ever read (return2Idle/getData time out → "Offline"), until
 * the OS eventually errors the dead read minutes later. A finite timeout makes
 * the read loop wake periodically, observe stop(), and exit promptly so a
 * replug reconnects immediately.
 */
private const val READ_TIMEOUT_MS = 200

class CastlesUsbModule : Module() {

  // ── State (guarded by `lock`) ──
  private val lock = Object()
  private var serialPort: UsbSerialPort? = null
  private var ioManager: SerialInputOutputManager? = null
  private val ioExecutor = Executors.newSingleThreadExecutor()
  private var permissionPromise: Promise? = null

  // ── Helpers ──
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context not available")

  private val usbManager: UsbManager
    get() = context.getSystemService(Context.USB_SERVICE) as UsbManager

  /**
   * Build a custom prober that includes Castles VID/PIDs mapped to CDC ACM,
   * in addition to all default drivers. This ensures Saturn1000 is detected
   * even on LANDI and other devices where the default prober's class-based
   * matching may not recognise the device.
   */
  private fun buildProber(): UsbSerialProber {
    val customTable = ProbeTable()
    for (pid in CASTLES_PRODUCT_IDS) {
      customTable.addProduct(CASTLES_VENDOR_ID, pid, CdcAcmSerialDriver::class.java)
    }
    return UsbSerialProber(customTable)
  }

  /**
   * Find drivers for a device, trying default prober first, then custom
   * Castles prober as fallback.
   */
  private fun findAllDrivers(): List<com.hoho.android.usbserial.driver.UsbSerialDriver> {
    val defaultDrivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager)
    if (defaultDrivers.isNotEmpty()) return defaultDrivers

    // Fallback: try custom prober with explicit Castles VID/PID → CDC ACM mapping
    return buildProber().findAllDrivers(usbManager)
  }

  // ── Broadcast receivers ──
  private val permissionReceiver = object : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
      if (intent.action == ACTION_USB_PERMISSION) {
        val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
        permissionPromise?.resolve(granted)
        permissionPromise = null
      }
    }
  }

  private val detachReceiver = object : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
      if (intent.action == UsbManager.ACTION_USB_DEVICE_DETACHED) {
        val device = intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE)
        val deviceId = device?.deviceId ?: -1

        // If the detached device is the one we have open, clean up
        synchronized(lock) {
          val currentDevice = serialPort?.device
          if (currentDevice != null && currentDevice.deviceId == deviceId) {
            closeInternal()
          }
        }

        sendEvent("onCastlesUsbDetached", mapOf("deviceId" to deviceId))
      }
    }
  }

  private val attachReceiver = object : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
      if (intent.action == UsbManager.ACTION_USB_DEVICE_ATTACHED) {
        val device = intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE) ?: return
        // Emit for every attach; the JS coordinator filters by Castles VID and
        // decides whether to auto-connect. Keeping the native side dumb avoids
        // baking connection policy into the driver.
        sendEvent(
          "onCastlesUsbAttached",
          mapOf(
            "deviceId" to device.deviceId,
            "vendorId" to device.vendorId,
            "productId" to device.productId
          )
        )
      }
    }
  }

  private var receiversRegistered = false

  // ── Module definition ──
  override fun definition() = ModuleDefinition {
    Name("CastlesUsbModule")

    Events("onCastlesUsbData", "onCastlesUsbError", "onCastlesUsbDetached", "onCastlesUsbAttached")

    OnCreate {
      registerReceivers()
    }

    OnDestroy {
      closeInternal()
      unregisterReceivers()
    }

    // ── listDevices() ──
    // Returns all USB devices visible to the host, with a best-effort
    // mapping to usb-serial drivers. Never throws SecurityException:
    // if permission is missing, we still return the device with
    // hasPermission = false and an empty driverName.
    AsyncFunction("listDevices") {
      // Enumerate raw USB devices (this is allowed without permission).
      val devices = usbManager.deviceList.values.toList()

      // Best-effort driver lookup using default + custom prober;
      // tolerate SecurityException on newer Android / LANDI firmware.
      val driverNamesById = mutableMapOf<Int, String>()
      try {
        val drivers = findAllDrivers()
        drivers.forEach { driver ->
          val d = driver.device
          driverNamesById[d.deviceId] = driver.javaClass.simpleName
        }
      } catch (_: SecurityException) {
        // Ignore — we'll return devices without driverName in this case.
      }

      devices.map { device ->
        val hasPermission = usbManager.hasPermission(device)

        // These getters can throw SecurityException on Android 10+ without permission
        val productName = try { device.productName ?: "" } catch (_: SecurityException) { "" }
        val manufacturerName = try { device.manufacturerName ?: "" } catch (_: SecurityException) { "" }
        val serialNumber = try { device.serialNumber ?: "" } catch (_: SecurityException) { "" }

        mapOf(
          "deviceId" to device.deviceId,
          "vendorId" to device.vendorId,
          "productId" to device.productId,
          "productName" to productName,
          "manufacturerName" to manufacturerName,
          "serialNumber" to serialNumber,
          "driverName" to (driverNamesById[device.deviceId] ?: ""),
          "hasPermission" to hasPermission
        )
      }
    }

    // ── requestPermission(deviceId) ──
    // Triggers the Android USB permission dialog. Resolves true/false.
    AsyncFunction("requestPermission") { deviceId: Int, promise: Promise ->
      val device = usbManager.deviceList.values.find { it.deviceId == deviceId }
      if (device == null) {
        promise.reject("ERR_DEVICE_NOT_FOUND", "No USB device with id $deviceId", null)
        return@AsyncFunction
      }

      if (usbManager.hasPermission(device)) {
        promise.resolve(true)
        return@AsyncFunction
      }

      permissionPromise = promise
      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }
      val pendingIntent = PendingIntent.getBroadcast(context, 0, Intent(ACTION_USB_PERMISSION), flags)
      usbManager.requestPermission(device, pendingIntent)
    }

    // ── open(deviceId, baudRate) ──
    // Opens a USB serial connection and starts background read thread.
    // Sets DTR + RTS to signal terminal readiness (required by CDC ACM devices).
    AsyncFunction("open") { deviceId: Int, baudRate: Int ->
      synchronized(lock) {
        // Defensive: if a port is still registered (e.g. a stale handle that
        // survived a cable yank where the detach broadcast was missed), recycle
        // it cleanly instead of failing the reconnect. Reopening on a fresh
        // cable insertion must never be blocked by leftover state.
        if (serialPort != null) {
          android.util.Log.w("CastlesUsbModule", "open(): a port was still registered — recycling before reopen")
          closeInternal()
        }

        val drivers = findAllDrivers()
        val driver = drivers.find { it.device.deviceId == deviceId }
          ?: throw Exception("No serial driver found for device $deviceId. " +
            "Ensure the terminal is connected and powered on.")

        val connection = usbManager.openDevice(driver.device)
          ?: throw Exception("Could not open USB device. Missing permission?")

        val port = driver.ports[0]
        port.open(connection)

        try {
          port.setParameters(baudRate, UsbSerialPort.DATABITS_8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)
        } catch (e: Exception) {
          // Some drivers (especially on LANDI) don't support all parameter combos.
          // Log but don't fail — the port may still work with defaults.
          android.util.Log.w("CastlesUsbModule", "setParameters failed (non-fatal): ${e.message}")
        }

        // Assert DTR (Data Terminal Ready) and RTS (Request To Send).
        // Critical for CDC ACM devices — without these, the terminal
        // won't transmit data even though the port appears "open".
        try { port.dtr = true } catch (e: Exception) {
          android.util.Log.w("CastlesUsbModule", "Failed to set DTR (non-fatal): ${e.message}")
        }
        try { port.rts = true } catch (e: Exception) {
          android.util.Log.w("CastlesUsbModule", "Failed to set RTS (non-fatal): ${e.message}")
        }

        serialPort = port

        // Start background read thread with larger buffer for JSON payloads
        val manager = SerialInputOutputManager(port, object : SerialInputOutputManager.Listener {
          override fun onNewData(data: ByteArray) {
            val str = String(data, Charsets.UTF_8)
            sendEvent("onCastlesUsbData", mapOf("data" to str))
          }

          override fun onRunError(e: Exception) {
            sendEvent("onCastlesUsbError", mapOf("message" to (e.message ?: "Unknown read error")))
            closeInternal()
          }
        })
        manager.readBufferSize = READ_BUFFER_SIZE
        // Finite read timeout so the loop wakes periodically and exits promptly
        // on stop() — without this a cable detach leaves the read thread blocked
        // forever, starving the next connection's reads (see READ_TIMEOUT_MS).
        manager.readTimeout = READ_TIMEOUT_MS
        ioManager = manager
        ioExecutor.submit(manager)
      }
      Unit
    }

    // ── write(data) ──
    // Sends a UTF-8 string to the open serial port.
    AsyncFunction("write") { data: String ->
      synchronized(lock) {
        val port = serialPort ?: throw Exception("Port is not open")
        val bytes = data.toByteArray(Charsets.UTF_8)
        port.write(bytes, 5000) // 5s write timeout (LANDI USB can be slower)
      }
      Unit
    }

    // ── close() ──
    AsyncFunction("close") {
      closeInternal()
    }

    // ── diagnoseUsb() ──
    // Returns diagnostic info about USB host support and device state.
    // Useful when listDevices() returns empty — helps distinguish between
    // hardware issues (no USB host), cable issues, and driver issues.
    AsyncFunction("diagnoseUsb") {
      val pm = context.packageManager
      mapOf(
        "hasUsbHostFeature" to pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_USB_HOST),
        "hasUsbAccessoryFeature" to pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_USB_ACCESSORY),
        "usbManagerAvailable" to (context.getSystemService(Context.USB_SERVICE) != null),
        "rawDeviceCount" to usbManager.deviceList.size,
        "manufacturer" to Build.MANUFACTURER,
        "model" to Build.MODEL,
        "androidSdk" to Build.VERSION.SDK_INT,
        "deviceNames" to usbManager.deviceList.values.map { it.deviceName }
      )
    }

    // ── isOpen() ──
    // Synchronous check — returns true if a port is currently open.
    Function("isOpen") {
      synchronized(lock) { serialPort != null }
    }
  }

  // ── Internal helpers ──

  private fun closeInternal() {
    synchronized(lock) {
      try { ioManager?.stop() } catch (_: Exception) {}
      ioManager = null

      try {
        // De-assert DTR/RTS before closing to signal disconnect cleanly
        serialPort?.dtr = false
        serialPort?.rts = false
      } catch (_: Exception) {}

      try { serialPort?.close() } catch (_: Exception) {}
      serialPort = null
    }
  }

  private fun registerReceivers() {
    if (receiversRegistered) return

    val permFilter = IntentFilter(ACTION_USB_PERMISSION)
    val detachFilter = IntentFilter(UsbManager.ACTION_USB_DEVICE_DETACHED)
    val attachFilter = IntentFilter(UsbManager.ACTION_USB_DEVICE_ATTACHED)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      // Permission receiver: app-internal broadcast via PendingIntent → NOT_EXPORTED
      context.registerReceiver(permissionReceiver, permFilter, Context.RECEIVER_NOT_EXPORTED)
      // Attach/detach receivers: system broadcasts → EXPORTED (required to receive
      // USB_DEVICE_ATTACHED/DETACHED on LANDI/Android 13+)
      context.registerReceiver(detachReceiver, detachFilter, Context.RECEIVER_EXPORTED)
      context.registerReceiver(attachReceiver, attachFilter, Context.RECEIVER_EXPORTED)
    } else {
      context.registerReceiver(permissionReceiver, permFilter)
      context.registerReceiver(detachReceiver, detachFilter)
      context.registerReceiver(attachReceiver, attachFilter)
    }

    receiversRegistered = true
  }

  private fun unregisterReceivers() {
    if (!receiversRegistered) return
    try { context.unregisterReceiver(permissionReceiver) } catch (_: Exception) {}
    try { context.unregisterReceiver(detachReceiver) } catch (_: Exception) {}
    try { context.unregisterReceiver(attachReceiver) } catch (_: Exception) {}
    receiversRegistered = false
  }
}
