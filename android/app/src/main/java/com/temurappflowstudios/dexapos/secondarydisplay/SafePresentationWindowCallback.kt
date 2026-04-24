package com.temurappflowstudios.dexapos.secondarydisplay

import android.app.Presentation
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.ActionMode
import android.view.KeyEvent
import android.view.Menu
import android.view.MenuItem
import android.view.MotionEvent
import android.view.SearchEvent
import android.view.View
import android.view.Window
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent

/**
 * Window.Callback wrapper for the CFD Presentation window.
 *
 * Delegates all methods to the original callback but wraps event dispatch
 * methods in try-catch. If a JavascriptException (or any RuntimeException)
 * escapes during event dispatch, the Presentation is dismissed silently
 * instead of letting Android show the system crash dialog.
 */
class SafePresentationWindowCallback(
    private val delegate: Window.Callback,
    private val presentation: Presentation
) : Window.Callback {

    companion object {
        private const val TAG = "SecondaryDisplay"
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var dismissScheduled = false

    private fun handleException(method: String, e: Exception) {
        Log.e(TAG, "Exception in Presentation.$method — dismissing CFD silently", e)
        if (!dismissScheduled) {
            dismissScheduled = true
            mainHandler.post {
                try {
                    presentation.dismiss()
                } catch (ex: Exception) {
                    Log.w(TAG, "Failed to dismiss Presentation after $method error", ex)
                }
            }
        }
    }

    // ==================== EVENT DISPATCH (guarded) ====================

    override fun dispatchKeyEvent(event: KeyEvent?): Boolean {
        return try {
            delegate.dispatchKeyEvent(event)
        } catch (e: Exception) {
            handleException("dispatchKeyEvent", e)
            false
        }
    }

    override fun dispatchKeyShortcutEvent(event: KeyEvent?): Boolean {
        return try {
            delegate.dispatchKeyShortcutEvent(event)
        } catch (e: Exception) {
            handleException("dispatchKeyShortcutEvent", e)
            false
        }
    }

    override fun dispatchTouchEvent(event: MotionEvent?): Boolean {
        return try {
            delegate.dispatchTouchEvent(event)
        } catch (e: Exception) {
            handleException("dispatchTouchEvent", e)
            false
        }
    }

    override fun dispatchTrackballEvent(event: MotionEvent?): Boolean {
        return try {
            delegate.dispatchTrackballEvent(event)
        } catch (e: Exception) {
            handleException("dispatchTrackballEvent", e)
            false
        }
    }

    override fun dispatchGenericMotionEvent(event: MotionEvent?): Boolean {
        return try {
            delegate.dispatchGenericMotionEvent(event)
        } catch (e: Exception) {
            handleException("dispatchGenericMotionEvent", e)
            false
        }
    }

    override fun dispatchPopulateAccessibilityEvent(event: AccessibilityEvent?): Boolean {
        return try {
            delegate.dispatchPopulateAccessibilityEvent(event)
        } catch (e: Exception) {
            handleException("dispatchPopulateAccessibilityEvent", e)
            false
        }
    }

    // ==================== REMAINING METHODS (direct delegation) ====================

    override fun onCreatePanelView(featureId: Int): View? = delegate.onCreatePanelView(featureId)
    override fun onCreatePanelMenu(featureId: Int, menu: Menu): Boolean = delegate.onCreatePanelMenu(featureId, menu)
    override fun onPreparePanel(featureId: Int, view: View?, menu: Menu): Boolean = delegate.onPreparePanel(featureId, view, menu)
    override fun onMenuOpened(featureId: Int, menu: Menu): Boolean = delegate.onMenuOpened(featureId, menu)
    override fun onMenuItemSelected(featureId: Int, item: MenuItem): Boolean = delegate.onMenuItemSelected(featureId, item)
    override fun onWindowAttributesChanged(attrs: WindowManager.LayoutParams?) = delegate.onWindowAttributesChanged(attrs)
    override fun onContentChanged() = delegate.onContentChanged()
    override fun onWindowFocusChanged(hasFocus: Boolean) = delegate.onWindowFocusChanged(hasFocus)
    override fun onAttachedToWindow() = delegate.onAttachedToWindow()
    override fun onDetachedFromWindow() = delegate.onDetachedFromWindow()
    override fun onPanelClosed(featureId: Int, menu: Menu) = delegate.onPanelClosed(featureId, menu)
    override fun onSearchRequested(): Boolean = delegate.onSearchRequested()
    override fun onSearchRequested(searchEvent: SearchEvent?): Boolean = delegate.onSearchRequested(searchEvent)
    override fun onWindowStartingActionMode(callback: ActionMode.Callback?): ActionMode? = delegate.onWindowStartingActionMode(callback)
    override fun onWindowStartingActionMode(callback: ActionMode.Callback?, type: Int): ActionMode? = delegate.onWindowStartingActionMode(callback, type)
    override fun onActionModeStarted(mode: ActionMode?) = delegate.onActionModeStarted(mode)
    override fun onActionModeFinished(mode: ActionMode?) = delegate.onActionModeFinished(mode)
}
