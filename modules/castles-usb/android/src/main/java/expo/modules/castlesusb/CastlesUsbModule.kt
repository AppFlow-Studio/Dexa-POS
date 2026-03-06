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
import com.hoho.android.usbserial.driver.UsbSerialDriver
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import com.hoho.android.usbserial.util.SerialInputOutputManager
import java.util.concurrent.Executors

private const val ACTION_USB_PERMISSION = "expo.modules.castlesusb.USB_PERMISSION"

class CastlesUsbModule : Module() {

  // ── State ──
  private var serialPort: UsbSerialPort? = null
  private var ioManager: SerialInputOutputManager? = null
  private val ioExecutor = Executors.newSingleThreadExecutor()
  private var permissionPromise: Promise? = null

  // ── Helpers ──
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context not available")

  private val usbManager: UsbManager
    get() = context.getSystemService(Context.USB_SERVICE) as UsbManager

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
        val currentDevice = serialPort?.device
        if (currentDevice != null && currentDevice.deviceId == deviceId) {
          closeInternal()
        }

        sendEvent("onCastlesUsbDetached", mapOf("deviceId" to deviceId))
      }
    }
  }

  private var receiversRegistered = false

  // ── Module definition ──
  override fun definition() = ModuleDefinition {
    Name("CastlesUsbModule")

    Events("onCastlesUsbData", "onCastlesUsbError", "onCastlesUsbDetached")

    OnCreate {
      registerReceivers()
    }

    OnDestroy {
      closeInternal()
      unregisterReceivers()
    }

    // ── listDevices() ──
    // Returns all USB serial devices discovered by the default prober.
    AsyncFunction("listDevices") {
      val prober = UsbSerialProber.getDefaultProber()
      val drivers = prober.findAllDrivers(usbManager)

      drivers.map { driver ->
        val device = driver.device
        mapOf(
          "deviceId" to device.deviceId,
          "vendorId" to device.vendorId,
          "productId" to device.productId,
          "productName" to (device.productName ?: ""),
          "manufacturerName" to (device.manufacturerName ?: ""),
          "serialNumber" to (device.serialNumber ?: ""),
          "driverName" to driver.javaClass.simpleName
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
    AsyncFunction("open") { deviceId: Int, baudRate: Int ->
      if (serialPort != null) {
        throw Exception("A port is already open. Call close() first.")
      }

      val prober = UsbSerialProber.getDefaultProber()
      val drivers = prober.findAllDrivers(usbManager)
      val driver = drivers.find { it.device.deviceId == deviceId }
        ?: throw Exception("No serial driver found for device $deviceId")

      val connection = usbManager.openDevice(driver.device)
        ?: throw Exception("Could not open USB device. Missing permission?")

      val port = driver.ports[0]
      port.open(connection)
      port.setParameters(baudRate, UsbSerialPort.DATABITS_8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)

      serialPort = port

      // Start background read thread
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
      ioManager = manager
      ioExecutor.submit(manager)
    }

    // ── write(data) ──
    // Sends a UTF-8 string to the open serial port.
    AsyncFunction("write") { data: String ->
      val port = serialPort ?: throw Exception("Port is not open")
      val bytes = data.toByteArray(Charsets.UTF_8)
      port.write(bytes, 2000) // 2s write timeout
    }

    // ── close() ──
    AsyncFunction("close") {
      closeInternal()
    }

    // ── isOpen() ──
    // Synchronous check — returns true if a port is currently open.
    Function("isOpen") {
      serialPort != null
    }
  }

  // ── Internal helpers ──

  private fun closeInternal() {
    try { ioManager?.stop() } catch (_: Exception) {}
    ioManager = null

    try { serialPort?.close() } catch (_: Exception) {}
    serialPort = null
  }

  private fun registerReceivers() {
    if (receiversRegistered) return

    val permFilter = IntentFilter(ACTION_USB_PERMISSION)
    val detachFilter = IntentFilter(UsbManager.ACTION_USB_DEVICE_DETACHED)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(permissionReceiver, permFilter, Context.RECEIVER_NOT_EXPORTED)
      context.registerReceiver(detachReceiver, detachFilter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(permissionReceiver, permFilter)
      context.registerReceiver(detachReceiver, detachFilter)
    }

    receiversRegistered = true
  }

  private fun unregisterReceivers() {
    if (!receiversRegistered) return
    try { context.unregisterReceiver(permissionReceiver) } catch (_: Exception) {}
    try { context.unregisterReceiver(detachReceiver) } catch (_: Exception) {}
    receiversRegistered = false
  }
}
