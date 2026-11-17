// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

package io.github.khushulabs.engine

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Re-arms alarms and fences after a reboot or an app update.
 * Stub for now: it only logs. Must never start a foreground service.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED ->
        Log.i(TAG, "received ${intent.action}; re-arm is not implemented yet")
      else -> Unit
    }
  }

  private companion object {
    const val TAG = "KhushuEngine"
  }
}
