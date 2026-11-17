// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

// Config plugin: adds the engine's Android permissions and boot receiver to the
// host app's AndroidManifest.xml during `expo prebuild`. Plain CommonJS so it
// needs no build step.

const { AndroidConfig, createRunOncePlugin, withAndroidManifest } = require("expo/config-plugins");

const pkg = require("../package.json");

const RECEIVER_NAME = "io.github.khushulabs.engine.BootReceiver";

/**
 * Permissions the engine needs. SCHEDULE_EXACT_ALARM only: the engine never
 * uses USE_EXACT_ALARM and falls back to inexact windows when it is denied.
 */
const PERMISSIONS = [
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.ACCESS_NOTIFICATION_POLICY",
  "android.permission.SCHEDULE_EXACT_ALARM",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_BACKGROUND_LOCATION",
];

/**
 * Never allowed in the host app, even if a dependency merges them in (D16:
 * SCHEDULE_EXACT_ALARM only). Written as tools:node="remove" in the manifest.
 */
const BLOCKED_PERMISSIONS = ["android.permission.USE_EXACT_ALARM"];

const BOOT_ACTIONS = ["android.intent.action.BOOT_COMPLETED", "android.intent.action.MY_PACKAGE_REPLACED"];

/**
 * @param {AndroidConfig.Manifest.AndroidManifest} manifest
 * @returns {AndroidConfig.Manifest.AndroidManifest}
 */
function addBootReceiver(manifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const receivers = (app.receiver ??= []);
  const others = receivers.filter((r) => r.$?.["android:name"] !== RECEIVER_NAME);
  others.push({
    $: { "android:name": RECEIVER_NAME, "android:exported": "false" },
    "intent-filter": [{ action: BOOT_ACTIONS.map((name) => ({ $: { "android:name": name } })) }],
  });
  app.receiver = others;
  return manifest;
}

/** @type {import("expo/config-plugins").ConfigPlugin<void>} */
const withKhushuEngine = (config) => {
  config = AndroidConfig.Permissions.withPermissions(config, PERMISSIONS);
  config = AndroidConfig.Permissions.withBlockedPermissions(config, BLOCKED_PERMISSIONS);
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = addBootReceiver(cfg.modResults);
    return cfg;
  });
};

module.exports = createRunOncePlugin(withKhushuEngine, pkg.name, pkg.version);
module.exports.PERMISSIONS = PERMISSIONS;
module.exports.BLOCKED_PERMISSIONS = BLOCKED_PERMISSIONS;
module.exports.addBootReceiver = addBootReceiver;
