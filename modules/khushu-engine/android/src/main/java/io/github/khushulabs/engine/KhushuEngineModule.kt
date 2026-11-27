// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

package io.github.khushulabs.engine

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The engine's Android side. setPlan, startManual, stopSilence, getStatus,
 * getHistory, checkPermissions and openPermissionSettings are real (spike S-A);
 * setFences keeps its input in memory until the geofence work.
 */
class KhushuEngineModule : Module() {
  // Written from AsyncFunctions, read from getDiagnostics. Moves into the engine store in KH-018.
  @Volatile private var fences: List<FenceRecord> = emptyList()

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val controller: SilenceController
    get() = SilenceController.get(context)

  override fun definition() = ModuleDefinition {
    Name("KhushuEngine")

    Events(STATUS_CHANGED)

    OnCreate {
      SilenceController.get(context).listener = { status -> sendEvent(STATUS_CHANGED, status) }
    }

    OnDestroy {
      runCatching { SilenceController.get(context).listener = null }
    }

    Function("ping") {
      ENGINE_VERSION
    }

    Function("formatTime") { at: Double, withSeconds: Boolean ->
      controller.formatTime(at.toLong(), withSeconds)
    }

    AsyncFunction("setPlan") { next: PlanRecord ->
      controller.setPlan(
        PlanData(
          ruleName = next.ruleName,
          title = next.notice.title,
          body = next.notice.body,
          unmuteLabel = next.unmuteLabel,
          windows = next.windows.map { WindowData(it.id, it.startsAt.toLong(), it.endsAt.toLong()) },
        ),
      )
    }

    AsyncFunction("setFences") { next: List<FenceRecord> ->
      fences = next
    }

    AsyncFunction("getStatus") {
      controller.status()
    }

    AsyncFunction("startManual") { minutes: Double ->
      controller.startManual(minutes)
    }

    AsyncFunction("stopSilence") {
      controller.stopSilence()
    }

    AsyncFunction("getHistory") {
      controller.history()
    }

    AsyncFunction("getDiagnostics") {
      mapOf(
        "engineVersion" to ENGINE_VERSION,
        "platformSdk" to Build.VERSION.SDK_INT,
        "windowCount" to controller.windowCount(),
        "fenceCount" to fences.size,
        "lastFenceEventAt" to null,
        "lastAlarmAt" to controller.lastAlarmAt()?.toDouble(),
        "lastFixAt" to null,
        "permissions" to permissionState(),
      )
    }

    AsyncFunction("checkPermissions") {
      permissionState()
    }

    AsyncFunction("openPermissionSettings") { kind: String ->
      context.startActivity(controller.settingsIntent(kind))
    }
  }

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
