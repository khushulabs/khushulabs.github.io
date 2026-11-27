// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

package io.github.khushulabs.engine

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import kotlin.concurrent.thread

/** Receives our scheduled alarms and the notification's "Unmute now" action. */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pending = goAsync()
    val app = context.applicationContext
    thread(name = "khushu-alarm") {
      try {
        val controller = SilenceController.get(app)
        when (intent.action) {
          SilenceController.ACTION_ALARM -> controller.onAlarm(
            kind = intent.getStringExtra(SilenceController.EXTRA_KIND).orEmpty(),
            id = intent.getStringExtra(SilenceController.EXTRA_ID).orEmpty(),
            scheduledAt = intent.getLongExtra(SilenceController.EXTRA_AT, 0L),
          )
          SilenceController.ACTION_UNMUTE -> controller.stopSilence("notification")
          SilenceController.ACTION_REPOST -> controller.repostNotice()
          else -> Unit
        }
      } catch (t: Throwable) {
        // Never let a background alarm crash the app.
        Log.e("KhushuEngine", "alarm receiver failed", t)
      } finally {
        pending.finish()
      }
    }
  }
}
