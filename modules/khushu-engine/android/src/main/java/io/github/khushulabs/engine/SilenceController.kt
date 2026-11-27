// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

package io.github.khushulabs.engine

import android.app.AlarmManager
import android.app.AutomaticZenRule
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.service.notification.Condition
import android.service.notification.ZenPolicy
import android.text.format.DateFormat
import android.util.Log
import expo.modules.kotlin.exception.CodedException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class PolicyAccessDeniedException :
  CodedException("POLICY_ACCESS_DENIED", "Do Not Disturb access is not granted to this app", null)

class UnsupportedSdkException :
  CodedException("UNSUPPORTED_SDK", "Silencing needs Android 11 (API 30) or newer", null)

/**
 * Silences the phone with our own AutomaticZenRule, never with the user's global
 * Do Not Disturb setting, and always restores. All state lives in [SilenceStore],
 * so alarms and the boot receiver work without the app process.
 */
internal class SilenceController private constructor(private val context: Context) {
  private val store = SilenceStore(context)
  private val nm: NotificationManager = context.getSystemService(NotificationManager::class.java)
  private val am: AlarmManager = context.getSystemService(AlarmManager::class.java)

  /** Set by the module while the JS side is listening. */
  @Volatile var listener: ((Map<String, Any?>) -> Unit)? = null

  // ---- public API (used by the module and the receivers) -------------------------------------

  @Synchronized
  fun setPlan(next: PlanData) {
    store.plan = next
    // Keep an "Unmute now" on a window that is still in the new plan, so re-sending the plan does not re-silence.
    if (store.dismissedWindowId !in next.windows.map { it.id }) store.dismissedWindowId = null
    armWindows()
    reconcile()
    emit()
  }

  @Synchronized
  fun startManual(minutes: Double) {
    val now = System.currentTimeMillis()
    log("manual_start", null, "minutes=$minutes")
    activate("manual", null, now + (minutes * 60_000).toLong())
  }

  @Synchronized
  fun stopSilence(source: String = "app") {
    val cur = store.active
    if (cur?.reason == "window") store.dismissedWindowId = cur.windowId
    log("manual_stop", cur?.windowId, "source=$source")
    deactivate()
  }

  @Synchronized
  fun status(): Map<String, Any?> {
    syncExactMode()
    reconcile()
    return status0()
  }

  fun history(): List<Map<String, Any?>> = store.historyMaps()

  fun lastAlarmAt(): Long? = store.lastAlarmAt.takeIf { it > 0 }

  fun windowCount(): Int = store.plan?.windows?.size ?: 0

  @Synchronized
  fun onAlarm(kind: String, id: String, scheduledAt: Long) {
    val now = System.currentTimeMillis()
    store.lastAlarmAt = now
    val delta = now - scheduledAt
    val mode = alarmMode()
    syncExactMode()
    when (kind) {
      KIND_OPEN, KIND_OPEN_BACKUP -> {
        val window = store.plan?.windows?.firstOrNull { it.id == id }
        if (kind == KIND_OPEN_BACKUP && (window == null || now >= window.endsAt || store.active?.windowId == id || store.dismissedWindowId == id)) {
          return // the window alarm already did the job
        }
        log("window_open", id, "delta_ms=$delta mode=${if (kind == KIND_OPEN_BACKUP) "window-backup" else mode}")
        if (window == null) {
          log("error", id, "window not in plan")
        } else if (now >= window.endsAt) {
          log("error", id, "window already over when the alarm fired")
        } else {
          runCatching { activate("window", id, window.endsAt) }
            .onFailure { log("error", id, "activate failed: ${it.message}") }
        }
      }
      KIND_END, KIND_END_SAFE -> {
        val cur = store.active
        if (cur != null && cur.until > now + END_SLACK_MS) {
          scheduleAlarm(KIND_END, KIND_END_ID, cur.until) // extended meanwhile
        } else if (cur == null) {
          cancelAlarm(KIND_END, KIND_END_ID) // already restored; drop the spare alarm
        } else {
          if (cur?.reason == "window") log("window_close", cur.windowId, "delta_ms=$delta mode=$mode")
          deactivate()
        }
      }
    }
  }

  /** After reboot, app update or exact-alarm permission change. */
  @Synchronized
  fun rearm(action: String) {
    log("boot", null, "action=${action.substringAfterLast('.')} exact=${canExact()}")
    armWindows()
    val cur = store.active
    if (cur != null && cur.until > System.currentTimeMillis()) {
      // Still inside the silence: make sure the rule, notice and end alarm are in place.
      runCatching { setRuleState(true) }.onFailure { log("error", cur.windowId, "rearm rule: ${it.message}") }
      postNotice(cur.until)
      scheduleAlarm(KIND_END, KIND_END_ID, cur.until)
    }
    reconcile()
    emit()
  }

  // ---- silence on / off ------------------------------------------------------------------------

  private fun activate(reason: String, windowId: String?, until: Long) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) throw UnsupportedSdkException()
    if (!nm.isNotificationPolicyAccessGranted) {
      log("error", windowId, "cannot silence: Do Not Disturb access is off")
      throw PolicyAccessDeniedException()
    }
    val cur = store.active
    val dndBefore = cur?.dndBefore ?: nm.currentInterruptionFilter
    val newUntil = maxOf(until, cur?.until ?: 0L)
    val next = ActiveSilence(cur?.reason ?: reason, cur?.windowId ?: windowId, cur?.startedAt ?: System.currentTimeMillis(), newUntil, dndBefore)
    // Persist and arm the end alarm first, so a crash after the rule is on still ends in a restore.
    store.active = next
    scheduleAlarm(KIND_END, KIND_END_ID, newUntil)
    val t0 = SystemClock.elapsedRealtime()
    try {
      postNotice(newUntil)
      setRuleState(true)
    } catch (t: Throwable) {
      store.active = cur
      if (cur == null) {
        cancelAlarm(KIND_END, KIND_END_ID)
        nm.cancel(NOTICE_ID)
      } else {
        scheduleAlarm(KIND_END, KIND_END_ID, cur.until)
      }
      log("error", windowId, "silence failed: ${t.message}")
      throw t
    }
    val observed = cur != null || waitForFilter { it != dndBefore }
    val ms = SystemClock.elapsedRealtime() - t0
    log(
      "silenced",
      windowId,
      "activation_ms=$ms observed=$observed dnd_before=${filterName(dndBefore)} dnd_now=${filterName(nm.currentInterruptionFilter)} until=${clock(newUntil)}",
    )
    emit()
  }

  private fun deactivate() {
    cancelAlarm(KIND_END, KIND_END_ID)
    val cur = store.active
    if (cur == null) {
      runCatching { setRuleState(false) }
      emit()
      return
    }
    runCatching { setRuleState(false) }.onFailure { log("error", cur.windowId, "restore failed: ${it.message}") }
    val back = waitForFilter { it == cur.dndBefore }
    val after = nm.currentInterruptionFilter
    store.active = null
    nm.cancel(NOTICE_ID)
    log(
      "restored",
      cur.windowId,
      "dnd_before=${filterName(cur.dndBefore)} dnd_after=${filterName(after)} unchanged=${after == cur.dndBefore} settled=$back",
    )
    emit()
  }

  /** Restores if a silence has run out, and starts one if a window is open right now. */
  private fun reconcile() {
    val now = System.currentTimeMillis()
    val cur = store.active
    if (cur != null && cur.until <= now) {
      deactivate()
    } else if (cur == null) {
      val open = store.plan?.windows?.firstOrNull { it.startsAt <= now && now < it.endsAt && it.id != store.dismissedWindowId }
      if (open != null) {
        log("window_open", open.id, "delta_ms=${now - open.startsAt} mode=already_open")
        runCatching { activate("window", open.id, open.endsAt) }
      } else if (nm.isNotificationPolicyAccessGranted && store.ruleId != null) {
        runCatching { setRuleState(false) } // idle: make sure our rule is off
      }
    }
  }

  // ---- the AutomaticZenRule ------------------------------------------------------------------

  private fun buildRule(name: String): AutomaticZenRule {
    val owner = ComponentName(context, RuleOwnerService::class.java)
    val policy = ZenPolicy.Builder()
      .allowCalls(ZenPolicy.PEOPLE_TYPE_STARRED)
      .allowRepeatCallers(true)
      .allowAlarms(true)
      .allowMessages(ZenPolicy.PEOPLE_TYPE_NONE)
      .allowConversations(ZenPolicy.CONVERSATION_SENDERS_NONE)
      .allowReminders(false)
      .allowEvents(false)
      .allowMedia(false)
      .allowSystem(false)
      .build()
    return AutomaticZenRule(name, owner, null, CONDITION_ID, policy, NotificationManager.INTERRUPTION_FILTER_PRIORITY, true)
  }

  private fun ensureRule(): String {
    val name = store.plan?.ruleName ?: context.getString(R.string.khushu_engine_rule_name)
    val id = store.ruleId
    val existing = id?.let { nm.getAutomaticZenRule(it) }
    if (id != null && existing != null) {
      // Refresh when the user switched our rule off, the name changed, or a new build changed the policy.
      // Not on every call: updating a rule that is on could reset its state.
      val disabled = !existing.isEnabled
      if (disabled || existing.name != name || store.policyVersion != POLICY_VERSION) {
        if (disabled) log("error", null, "rule was disabled in settings, re-enabled")
        nm.updateAutomaticZenRule(id, buildRule(name))
        store.policyVersion = POLICY_VERSION
      }
      return id
    }
    val newId = nm.addAutomaticZenRule(buildRule(name))
    store.ruleId = newId
    store.policyVersion = POLICY_VERSION
    return newId
  }

  private fun setRuleState(on: Boolean) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) throw UnsupportedSdkException()
    if (!nm.isNotificationPolicyAccessGranted) throw PolicyAccessDeniedException()
    val id = if (on) ensureRule() else (store.ruleId ?: return)
    if (!on && nm.getAutomaticZenRule(id) == null) return
    val state = if (on) Condition.STATE_TRUE else Condition.STATE_FALSE
    nm.setAutomaticZenRuleState(id, Condition(CONDITION_ID, if (on) "On" else "Off", state))
  }

  private fun waitForFilter(test: (Int) -> Boolean): Boolean {
    val end = SystemClock.elapsedRealtime() + OBSERVE_MS
    while (SystemClock.elapsedRealtime() < end) {
      if (test(nm.currentInterruptionFilter)) return true
      Thread.sleep(25)
    }
    return test(nm.currentInterruptionFilter)
  }

  // ---- alarms ------------------------------------------------------------------------------

  private fun canExact(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()

  private fun alarmMode() = if (canExact()) "exact" else "window"

  /**
   * Android drops every exact alarm when the user revokes "Alarms & reminders" and only
   * broadcasts on a grant. So when the mode differs from the one we last scheduled with
   * (seen the next time the app runs), schedule everything again.
   */
  private fun syncExactMode() {
    val last = store.lastExact ?: return
    if (last == canExact()) return
    log("armed", null, "exact alarms ${if (canExact()) "granted" else "revoked"}: re-arming")
    armWindows()
    store.active?.let { if (it.until > System.currentTimeMillis()) scheduleAlarm(KIND_END, KIND_END_ID, it.until) }
  }

  private fun armWindows() {
    store.alarmKeys.filter { it.startsWith("$KIND_OPEN|") }.forEach {
      cancelAlarm(KIND_OPEN, it.substringAfter('|'))
    }
    val now = System.currentTimeMillis()
    val windows = store.plan?.windows.orEmpty().filter { it.startsAt > now }
    for (w in windows) scheduleAlarm(KIND_OPEN, w.id, w.startsAt)
    if (windows.isNotEmpty()) {
      log("armed", null, "windows=${windows.size} first=${clock(windows.minOf { it.startsAt })} mode=${alarmMode()}")
    }
  }

  private fun alarmIntent(kind: String, id: String, at: Long, flags: Int): PendingIntent? {
    val intent = Intent(context, AlarmReceiver::class.java)
      .setAction(ACTION_ALARM)
      .setData(Uri.parse("khushu-engine://alarm/$kind/${Uri.encode(id)}"))
      .putExtra(EXTRA_KIND, kind)
      .putExtra(EXTRA_ID, id)
      .putExtra(EXTRA_AT, at)
    return PendingIntent.getBroadcast(context, 0, intent, flags or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun scheduleAlarm(kind: String, id: String, at: Long) {
    var exact = canExact()
    if (exact) {
      try {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarmIntent(kind, id, at, PendingIntent.FLAG_UPDATE_CURRENT)!!)
      } catch (e: SecurityException) {
        exact = false // permission was revoked a moment ago
      }
    }
    var keys = store.alarmKeys + "$kind|$id"
    if (!exact) {
      val pi = alarmIntent(kind, id, at, PendingIntent.FLAG_UPDATE_CURRENT)!!
      if (kind == KIND_OPEN) {
        // D16 fallback: setWindow. It is not allowed in Doze, so a Doze-exempt backup follows
        // 30 s after the window ends; whichever comes first silences, the other is ignored.
        am.setWindow(AlarmManager.RTC_WAKEUP, at, FALLBACK_WINDOW_MS, pi)
        am.setAndAllowWhileIdle(
          AlarmManager.RTC_WAKEUP,
          at + FALLBACK_WINDOW_MS + SAFETY_DELAY_MS,
          alarmIntent(KIND_OPEN_BACKUP, id, at, PendingIntent.FLAG_UPDATE_CURRENT)!!,
        )
        keys = keys + "$KIND_OPEN_BACKUP|$id"
      } else {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi) // restore as early as the system allows
      }
    }
    if (kind == KIND_END) {
      // Safety net that survives a revoke of exact alarms (which cancels the exact one): restore 30 s later at most.
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at + SAFETY_DELAY_MS, alarmIntent(KIND_END_SAFE, id, at, PendingIntent.FLAG_UPDATE_CURRENT)!!)
      keys = keys + "$KIND_END_SAFE|$id"
    }
    store.alarmKeys = keys
    store.lastExact = exact
  }

  private fun cancelAlarm(kind: String, id: String) {
    cancelOne(kind, id)
    if (kind == KIND_END) cancelOne(KIND_END_SAFE, id)
    if (kind == KIND_OPEN) cancelOne(KIND_OPEN_BACKUP, id)
  }

  private fun cancelOne(kind: String, id: String) {
    // NO_CREATE: only touch an alarm that exists.
    alarmIntent(kind, id, 0L, PendingIntent.FLAG_NO_CREATE)?.let {
      am.cancel(it)
      it.cancel()
    }
    store.alarmKeys = store.alarmKeys - "$kind|$id"
  }

  // ---- notification --------------------------------------------------------------------------

  private fun postNotice(until: Long) {
    val plan = store.plan
    val channel = NotificationChannel(
      CHANNEL_ID,
      context.getString(R.string.khushu_engine_channel_name),
      NotificationManager.IMPORTANCE_LOW,
    )
    nm.createNotificationChannel(channel)
    val blocked = !nm.areNotificationsEnabled() ||
      nm.getNotificationChannel(CHANNEL_ID)?.importance == NotificationManager.IMPORTANCE_NONE
    if (blocked) log("error", null, "notice_blocked: notifications are off, so there is no Unmute now button; use the app")
    val title = plan?.title ?: context.getString(R.string.khushu_engine_notice_title)
    val body = (plan?.body ?: context.getString(R.string.khushu_engine_notice_body)).replace("{until}", formatTime(until))
    val label = plan?.unmuteLabel ?: context.getString(R.string.khushu_engine_unmute_now)
    val unmute = PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, AlarmReceiver::class.java).setAction(ACTION_UNMUTE),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val repost = PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, AlarmReceiver::class.java).setAction(ACTION_REPOST),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    @Suppress("DEPRECATION")
    val action = Notification.Action.Builder(android.R.drawable.ic_lock_silent_mode, label, unmute).build()
    val notification = Notification.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_silent_mode)
      .setContentTitle(title)
      .setContentText(body)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_STATUS)
      .setContentIntent(open)
      .setDeleteIntent(repost) // swiped away while still silenced: show it again
      .addAction(action)
      .build()
    nm.notify(NOTICE_ID, notification)
  }

  /** Shows the notice again if the user swiped it away while we are still silenced. */
  @Synchronized
  fun repostNotice() {
    val cur = store.active ?: return
    if (cur.until > System.currentTimeMillis()) postNotice(cur.until)
  }

  // ---- helpers -------------------------------------------------------------------------------

  private fun emit() {
    listener?.invoke(status0())
  }

  /** Status without reconcile, so emit() cannot recurse. */
  private fun status0(): Map<String, Any?> {
    val now = System.currentTimeMillis()
    val cur = store.active
    val armed = store.plan?.windows?.any { it.endsAt > now } == true
    return mapOf(
      "state" to if (cur != null) "silenced" else if (armed) "armed" else "idle",
      "reason" to cur?.reason,
      "activeWindowId" to cur?.windowId,
      "silencedUntil" to cur?.until?.toDouble(),
      "updatedAt" to now.toDouble(),
    )
  }

  private fun log(type: String, windowId: String?, detail: String?) {
    Log.i(TAG, "$type ${windowId.orEmpty()} ${detail.orEmpty()}")
    store.addEvent(System.currentTimeMillis(), type, windowId, detail)
  }

  /** Diagnostics only: always 24-hour, so log lines are stable. */
  private fun clock(at: Long): String = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(at))

  /** For people: follows the phone's 12/24-hour setting and locale. */
  fun formatTime(at: Long, withSeconds: Boolean = false): String {
    if (!withSeconds) return DateFormat.getTimeFormat(context).format(Date(at))
    val locale = context.resources.configuration.locales[0]
    val skeleton = if (DateFormat.is24HourFormat(context)) "Hms" else "hms"
    return SimpleDateFormat(DateFormat.getBestDateTimePattern(locale, skeleton), locale).format(Date(at))
  }

  private fun filterName(filter: Int): String = when (filter) {
    NotificationManager.INTERRUPTION_FILTER_ALL -> "ALL"
    NotificationManager.INTERRUPTION_FILTER_PRIORITY -> "PRIORITY"
    NotificationManager.INTERRUPTION_FILTER_NONE -> "NONE"
    NotificationManager.INTERRUPTION_FILTER_ALARMS -> "ALARMS"
    else -> "UNKNOWN($filter)"
  }

  /** Opens the system screen where the user grants [kind]. */
  fun settingsIntent(kind: String): Intent {
    val pkg = Uri.parse("package:${context.packageName}")
    val intent = when (kind) {
      "notificationPolicy" -> Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
      "exactAlarm" ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg)
        else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
      "notifications" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
    }
    return intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  }

  companion object {
    const val ACTION_ALARM = "io.github.khushulabs.engine.ALARM"
    const val ACTION_UNMUTE = "io.github.khushulabs.engine.UNMUTE"
    const val ACTION_REPOST = "io.github.khushulabs.engine.REPOST"
    const val EXTRA_KIND = "kind"
    const val EXTRA_ID = "id"
    const val EXTRA_AT = "at"
    private const val KIND_OPEN = "open"
    private const val KIND_END = "end"
    private const val KIND_OPEN_BACKUP = "open-backup"
    private const val FALLBACK_WINDOW_MS = 2 * 60_000L
    private const val KIND_END_SAFE = "end-safe"
    private const val KIND_END_ID = "active"
    private const val SAFETY_DELAY_MS = 30_000L
    private const val POLICY_VERSION = 1
    private const val CHANNEL_ID = "khushu_silence"
    private const val NOTICE_ID = 4101
    private const val OBSERVE_MS = 2_500L
    private const val END_SLACK_MS = 2_000L
    private const val TAG = "KhushuEngine"
    private val CONDITION_ID: Uri = Uri.parse("khushu-engine://rule/silence")

    @Volatile private var instance: SilenceController? = null

    fun get(context: Context): SilenceController =
      instance ?: synchronized(this) {
        instance ?: SilenceController(context.applicationContext).also { instance = it }
      }
  }
}
