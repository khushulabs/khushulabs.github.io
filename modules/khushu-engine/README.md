<!-- SPDX-License-Identifier: Apache-2.0 -->
# khushu-engine

A reusable engine for silencing and restoring a device around a place and a time window. It is application-agnostic: it only knows about places (geofences), time windows, silence and restore, and diagnostics. A host app maps its own schedules onto this engine.

This is an [Expo module](https://docs.expo.dev/modules/overview/) written in Kotlin (Android only for now). It is a skeleton: `ping()` returns the engine version and the other calls are typed stubs. See [docs/api.md](docs/api.md) for the API and what each call does today.

- `src/`: the typed TypeScript API. Its types (`Plan`, `Fence`, `Status`, `HistoryEvent`, `Diagnostics`, `PermissionState`) are defined here, never imported from a host app.
- `android/`: the Kotlin module and the boot receiver.
- `plugin/` and `app.plugin.js`: a config plugin that adds the engine's permissions and boot receiver to the host app's manifest during `expo prebuild`. Add `"khushu-engine"` to the app's `plugins`.
- `docs/`: engine documentation. Keep engine docs here so the boundary check covers them.

The engine must not contain words from any host app's domain, in code, docs, resources or file names. CI enforces this with `scripts/check-engine-boundary.mjs` (the `engine-boundary` job). Host apps pass their own wording (rule name, notice text, unmute label) through `setPlan()`.

Every source file carries an `SPDX-License-Identifier: Apache-2.0` header. See also `NOTICE`.

Copyright 2026 Khushu contributors.

Licensed under the Apache License, Version 2.0. See `LICENSE` in this directory.
