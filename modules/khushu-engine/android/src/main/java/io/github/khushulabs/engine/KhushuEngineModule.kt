// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

package io.github.khushulabs.engine

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotImplementedException(what: String) :
  CodedException("NOT_IMPLEMENTED", "$what is not implemented yet", null)

/**
 * Skeleton of the engine. ping() is real; setPlan/setFences keep the input in
 * memory; the rest return safe defaults or reject with NOT_IMPLEMENTED.
 */
class KhushuEngineModule : Module() {
  // Written from AsyncFunctions, read from getDiagnostics. Moves into the engine store in KH-018.
  @Volatile private var plan: PlanRecord? = null
  @Volatile private var fences: List<FenceRecord> = emptyList()

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("KhushuEngine")

    Events(STATUS_CHANGED)

    Function("ping") {
      ENGINE_VERSION
    }

    AsyncFunction("setPlan") { next: PlanRecord ->
      plan = next
    }

    AsyncFunction("setFences") { next: List<FenceRecord> ->
      fences = next
    }

    AsyncFunction("getStatus") {
      idleStatus()
    }

    AsyncFunction("startManual") { _: Double ->
      notImplemented("startManual")
    }

    AsyncFunction("stopSilence") {
      // Nothing is ever silenced by the skeleton, so there is nothing to restore.
      Unit
    }

    AsyncFunction("getHistory") {
      emptyList<Map<String, Any?>>()
    }

    AsyncFunction("getDiagnostics") {
      mapOf(
        "engineVersion" to ENGINE_VERSION,
        "platformSdk" to Build.VERSION.SDK_INT,
        "windowCount" to (plan?.windows?.size ?: 0),
        "fenceCount" to fences.size,
        "lastFenceEventAt" to null,
        "lastAlarmAt" to null,
        "lastFixAt" to null,
        "permissions" to permissionState(),
      )
    }

    AsyncFunction("checkPermissions") {
      permissionState()
    }

    AsyncFunction("openPermissionSettings") { kind: String ->
      notImplemented("openPermissionSettings($kind)")
    }
  }

  // Declared as Unit so the AsyncFunction lambdas keep a concrete return type.
  private fun notImplemented(what: String): Unit = throw NotImplementedException(what)

  private fun idleStatus(): Map<String, Any?> = mapOf(
    "state" to "idle",
    "reason" to null,
    "activeWindowId" to null,
    "silencedUntil" to null,
    "updatedAt" to System.currentTimeMillis().toDouble(),
  )

  private fun runtime(permission: String): String =
    if (context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) GRANTED else DENIED

  private fun permissionState(): Map<String, String> {
    val notifications = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      runtime(Manifest.permission.POST_NOTIFICATIONS)
    } else {
      NOT_APPLICABLE
    }
    val nm = context.getSystemService(NotificationManager::class.java)
    val policy = if (nm?.isNotificationPolicyAccessGranted == true) GRANTED else DENIED
    val exactAlarm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val am = context.getSystemService(AlarmManager::class.java)
      if (am?.canScheduleExactAlarms() == true) GRANTED else DENIED
    } else {
      NOT_APPLICABLE
    }
    val background = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      runtime(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    } else {
      NOT_APPLICABLE
    }
    return mapOf(
      "notifications" to notifications,
      "notificationPolicy" to policy,
      "exactAlarm" to exactAlarm,
      "fineLocation" to runtime(Manifest.permission.ACCESS_FINE_LOCATION),
      "backgroundLocation" to background,
    )
  }

  companion object {
    /** Keep in sync with package.json "version" (checked by src/version.test.ts). */
    const val ENGINE_VERSION = "0.1.0"
    const val STATUS_CHANGED = "statusChanged"
    private const val GRANTED = "granted"
    private const val DENIED = "denied"
    private const val NOT_APPLICABLE = "not_applicable"
  }
}
