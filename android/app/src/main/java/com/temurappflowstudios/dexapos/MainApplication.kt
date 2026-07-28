package com.temurappflowstudios.dexapos

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

import com.temurappflowstudios.dexapos.tcpserver.TcpServerPackage
import com.temurappflowstudios.dexapos.secondarydisplay.SecondaryDisplayPackage
import com.temurappflowstudios.dexapos.hardware.HardwareDetectionPackage
import com.temurappflowstudios.dexapos.printer.LandiPrinterPackage
import com.temurappflowstudios.dexapos.nsd.NsdPublisherPackage
import com.temurappflowstudios.dexapos.nsd.NsdDiscoveryPackage
import com.temurappflowstudios.dexapos.atom.AtomBridgePackage

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  // Autolinked packages + our custom (non-autolinked) native ReactPackages.
  // Shared by the legacy reactNativeHost and the bridgeless reactHost below.
  private val reactPackages: List<ReactPackage>
    get() = PackageList(this).packages.toMutableList().apply {
      add(TcpServerPackage())
      add(SecondaryDisplayPackage())
      add(HardwareDetectionPackage())
      add(LandiPrinterPackage())
      add(NsdPublisherPackage())
      add(NsdDiscoveryPackage())
      add(AtomBridgePackage())
    }

  override val reactNativeHost: ReactNativeHost =
        object : DefaultReactNativeHost(this) {
          override fun getPackages(): List<ReactPackage> = reactPackages

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
          override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  // SDK 57: build the bridgeless ReactHost via Expo's factory (NOT RN's plain
  // DefaultReactHost.getDefaultReactHost) so the expo-updates + expo-dev-launcher
  // host handlers are installed. The plain RN factory skips that integration,
  // which leaves UpdatesController uninitialized and breaks the dev launcher.
  override val reactHost: ReactHost
    get() = ExpoReactHostFactory.getDefaultReactHost(applicationContext, reactPackages)

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, OpenSourceMergedSoMapping)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
