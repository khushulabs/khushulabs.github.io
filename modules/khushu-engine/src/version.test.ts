// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

it("ping() version in Kotlin matches package.json", () => {
  const pkg = JSON.parse(read("../package.json")) as { version: string };
  const kotlin = read("../android/src/main/java/io/github/khushulabs/engine/KhushuEngineModule.kt");
  expect(kotlin).toContain(`const val ENGINE_VERSION = "${pkg.version}"`);
});

it("build.gradle version matches package.json", () => {
  const pkg = JSON.parse(read("../package.json")) as { version: string };
  expect(read("../android/build.gradle")).toContain(`version = '${pkg.version}'`);
});
