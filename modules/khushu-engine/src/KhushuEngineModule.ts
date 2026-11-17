// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

import { NativeModule, requireNativeModule } from "expo";

import type {
  Diagnostics,
  Fence,
  HistoryEvent,
  KhushuEngineEvents,
  PermissionKind,
  PermissionState,
  Plan,
  Status,
} from "./KhushuEngine.types";

declare class KhushuEngineNativeModule extends NativeModule<KhushuEngineEvents> {
  ping(): string;
  setPlan(plan: Plan): Promise<void>;
  setFences(fences: Fence[]): Promise<void>;
  getStatus(): Promise<Status>;
  startManual(durationMinutes: number): Promise<void>;
  stopSilence(): Promise<void>;
  getHistory(): Promise<HistoryEvent[]>;
  getDiagnostics(): Promise<Diagnostics>;
  checkPermissions(): Promise<PermissionState>;
  openPermissionSettings(kind: PermissionKind): Promise<void>;
}

export default requireNativeModule<KhushuEngineNativeModule>("KhushuEngine");
