// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

package io.github.khushulabs.engine

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import kotlin.concurrent.thread

/**
 * Re-arms alarms after a reboot, an app update, or a change of the exact-alarm
 * permission. Restores sound if a silence ran out while the device was off.
 * Must never start a foreground service.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action !in HANDLED) return
    val pending = goAsync()
    val app = context.applicationContext
    thread(name = "khushu-boot") {
      try {
        SilenceController.get(app).rearm(action)
      } catch (t: Throwable) {
        Log.e("KhushuEngine", "re-arm failed", t)
      } finally {
        pending.finish()
      }
    }
  }

  private companion object {
    val HANDLED = setOf(
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED",
    )
  }
}
