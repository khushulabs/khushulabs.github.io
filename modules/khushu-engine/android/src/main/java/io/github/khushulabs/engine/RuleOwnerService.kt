// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

package io.github.khushulabs.engine

import android.service.notification.ConditionProviderService

/**
 * Placeholder owner for our AutomaticZenRule. Android needs a condition provider
 * component on the rule; we switch the rule state directly, so nothing happens here.
 */
class RuleOwnerService : ConditionProviderService() {
  override fun onConnected() = Unit

  override fun onSubscribe(conditionId: android.net.Uri?) = Unit

  override fun onUnsubscribe(conditionId: android.net.Uri?) = Unit
}
