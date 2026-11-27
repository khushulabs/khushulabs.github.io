// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

package io.github.khushulabs.engine

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

internal data class WindowData(val id: String, val startsAt: Long, val endsAt: Long)

internal data class PlanData(
  val ruleName: String,
  val title: String,
  val body: String,
  val unmuteLabel: String,
  val windows: List<WindowData>,
)

/** A silence that is in force right now. `dndBefore` is the user's own filter before we started. */
internal data class ActiveSilence(
  val reason: String,
  val windowId: String?,
  val startedAt: Long,
  val until: Long,
  val dndBefore: Int,
)

/** Small persistent state, so alarms and receivers work after the app process is gone. */
internal class SilenceStore(context: Context) {
  private val prefs = context.getSharedPreferences("khushu_engine_state", Context.MODE_PRIVATE)

  var ruleId: String?
    get() = prefs.getString(KEY_RULE_ID, null)
    set(value) = prefs.edit().putString(KEY_RULE_ID, value).apply()

  var dismissedWindowId: String?
    get() = prefs.getString(KEY_DISMISSED, null)
    set(value) = prefs.edit().putString(KEY_DISMISSED, value).apply()

  /** Whether the last alarm was set as exact (null: nothing scheduled yet). Used to spot a revoke or grant. */
  var lastExact: Boolean?
    get() = if (prefs.contains(KEY_LAST_EXACT)) prefs.getBoolean(KEY_LAST_EXACT, false) else null
    set(value) = prefs.edit().apply { if (value == null) remove(KEY_LAST_EXACT) else putBoolean(KEY_LAST_EXACT, value) }.apply()

  /** Version of the rule policy last written to the system, so a new build refreshes it. */
  var policyVersion: Int
    get() = prefs.getInt(KEY_POLICY_VERSION, 0)
    set(value) = prefs.edit().putInt(KEY_POLICY_VERSION, value).apply()

  var lastAlarmAt: Long
    get() = prefs.getLong(KEY_LAST_ALARM, 0L)
    set(value) = prefs.edit().putLong(KEY_LAST_ALARM, value).apply()

  var plan: PlanData?
    get() = prefs.getString(KEY_PLAN, null)?.let { runCatching { planFromJson(JSONObject(it)) }.getOrNull() }
    set(value) = prefs.edit().putString(KEY_PLAN, value?.let { planToJson(it).toString() }).apply()

  var active: ActiveSilence?
    get() = prefs.getString(KEY_ACTIVE, null)?.let { runCatching { activeFromJson(JSONObject(it)) }.getOrNull() }
    set(value) = prefs.edit().putString(KEY_ACTIVE, value?.let { activeToJson(it).toString() }).apply()

  /** Alarm keys ("kind|id") currently scheduled, so they can be cancelled. */
  var alarmKeys: Set<String>
    get() = prefs.getStringSet(KEY_ALARMS, emptySet()) ?: emptySet()
    set(value) = prefs.edit().putStringSet(KEY_ALARMS, value).apply()

  @Synchronized
  fun addEvent(at: Long, type: String, windowId: String?, detail: String?) {
    val list = history().toMutableList()
    list.add(JSONObject().put("at", at).put("type", type).put("windowId", windowId ?: JSONObject.NULL).put("detail", detail ?: JSONObject.NULL))
    val trimmed = if (list.size > MAX_EVENTS) list.subList(list.size - MAX_EVENTS, list.size) else list
    prefs.edit().putString(KEY_HISTORY, JSONArray(trimmed).toString()).apply()
  }

  /** Oldest first. */
  fun historyMaps(): List<Map<String, Any?>> = history().map {
    mapOf(
      "at" to it.getLong("at").toDouble(),
      "type" to it.getString("type"),
      "windowId" to it.optString("windowId", "").ifEmpty { null },
      "detail" to it.optString("detail", "").ifEmpty { null },
    )
  }

  private fun history(): List<JSONObject> {
    val raw = prefs.getString(KEY_HISTORY, null) ?: return emptyList()
    return runCatching {
      val arr = JSONArray(raw)
      (0 until arr.length()).map { arr.getJSONObject(it) }
    }.getOrDefault(emptyList())
  }

  private fun planToJson(p: PlanData) = JSONObject()
    .put("ruleName", p.ruleName).put("title", p.title).put("body", p.body).put("unmuteLabel", p.unmuteLabel)
    .put(
      "windows",
      JSONArray(p.windows.map { JSONObject().put("id", it.id).put("startsAt", it.startsAt).put("endsAt", it.endsAt) }),
    )

  private fun planFromJson(o: JSONObject): PlanData {
    val arr = o.getJSONArray("windows")
    val windows = (0 until arr.length()).map {
      val w = arr.getJSONObject(it)
      WindowData(w.getString("id"), w.getLong("startsAt"), w.getLong("endsAt"))
    }
    return PlanData(o.getString("ruleName"), o.getString("title"), o.getString("body"), o.getString("unmuteLabel"), windows)
  }

  private fun activeToJson(a: ActiveSilence) = JSONObject()
    .put("reason", a.reason).put("windowId", a.windowId ?: JSONObject.NULL)
    .put("startedAt", a.startedAt).put("until", a.until).put("dndBefore", a.dndBefore)

  private fun activeFromJson(o: JSONObject) = ActiveSilence(
    o.getString("reason"),
    if (o.isNull("windowId")) null else o.getString("windowId"),
    o.getLong("startedAt"),
    o.getLong("until"),
    o.getInt("dndBefore"),
  )

  private companion object {
    const val KEY_RULE_ID = "ruleId"
    const val KEY_DISMISSED = "dismissedWindowId"
    const val KEY_LAST_ALARM = "lastAlarmAt"
    const val KEY_LAST_EXACT = "lastExact"
    const val KEY_POLICY_VERSION = "policyVersion"
    const val KEY_PLAN = "plan"
    const val KEY_ACTIVE = "active"
    const val KEY_ALARMS = "alarmKeys"
    const val KEY_HISTORY = "history"
    const val MAX_EVENTS = 300
  }
}
