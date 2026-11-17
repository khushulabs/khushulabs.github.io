// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

package io.github.khushulabs.engine

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class NoticeRecord : Record {
  @Field var title: String = ""
  @Field var body: String = ""
}

class TimeWindowRecord : Record {
  @Field var id: String = ""
  @Field var startsAt: Double = 0.0
  @Field var endsAt: Double = 0.0
  @Field var fenceIds: List<String> = emptyList()
}

class PlanRecord : Record {
  @Field var ruleName: String = ""
  @Field var notice: NoticeRecord = NoticeRecord()
  @Field var unmuteLabel: String = ""
  @Field var windows: List<TimeWindowRecord> = emptyList()
}

class FenceRecord : Record {
  @Field var id: String = ""
  @Field var latitude: Double = 0.0
  @Field var longitude: Double = 0.0
  @Field var radiusMeters: Double = 0.0
}
