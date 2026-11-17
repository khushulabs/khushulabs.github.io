# Khushu: Final Plan v2 (solo, Android-first)

> v2, 5 Nov 2026. Replaces v1 (saved as `FINAL-PLAN-v1.md`).
> Amended 6 Nov 2026: added D45 (QR posters only at registered masjids with an approved admin).
> Built from expert reviews (architecture, mobile, product, security, hosting/cost, licensing) and the owner's decisions.
> Progress is tracked on the public [Khushu roadmap](https://github.com/orgs/khushulabs/projects/1); each KH task is an issue in this repo.

**How to use this:** work through §7 from top to bottom. Every task names its milestone, dependencies, size and a "done when" check.

**Size unit:** 1 *evening* (ev) ≈ 2–3 focused hours. A weekend day ≈ 2 ev.

---

## 0. The pitch (two minutes)

- **Problem:** at every masjid, jamat starts and someone's phone rings. People forget to silence it, and the ones who remember often forget to turn the sound back on.
- **Idea:** Khushu is a free Android app that does it for you. At your masjid during jamat time the phone goes silent by itself, and the sound comes back when jamat ends or you leave. Set it up once.
- **How it knows:** each masjid's admin enters jamat times on a simple web page; the app knows where the masjid is and when jamat starts, so it never asks at the moment.
- **Why it's different:** fully open source and free, no ads, no tracking, ₹0 to run. English, Bengali, Hindi and Urdu.
- **Bigger picture:** the silencing part is a separate prayer-agnostic engine (Apache-2.0) that others can later use for offices, conferences or gatherings, like Chrome on Chromium. Khushu proves it at one masjid first.
- **Next:** pilot at Md's masjid with 16–20 testers, then the Play Store.
- **One line:** "Khushu silences your phone automatically when you're at the masjid for jamat, and turns the sound back on after. Free and open source."

## 1. What v1 is

**One job, done well:** *my Android phone goes silent at my masjid's official jamat time, and comes back on afterwards.*

- **Who builds it:** Md alone, in evenings and at weekends. Fully open source.
- **Platform:** Android only. iOS comes later (the Apple fee is deferred).
- **Distribution:** Google Play is the main channel ($25, one time). The same APK goes on GitHub Releases. F-Droid may come later.
- **Silencing:** a Play Services geofence plus an alarm-based location check as backup (hybrid, see D2). It uses our own Do Not Disturb rule (AZR). Starred contacts and repeat callers still ring.
- **Masjid data:** the masjid's own admins publish its times. Where a masjid hasn't joined, the app falls back to calculated times.
- **Admin:** a mobile-first web app (PWA). Imams open it from **Manage your masjid** in the app.
- **Hosting, ₹0:**
  - GitHub Pages on a free org origin (`khushulabs.github.io`).
  - Supabase Free, used for admin data only.
  - The user app reads only static JSON that a GitHub Action publishes.
- **Languages at launch:** English, Bengali, Hindi and Urdu (RTL). More come later through community translation.
- **Users need no account, and the app has no analytics.** The Play label is "No data collected".

**Why Khushu is different:** official jamat times from the masjid (HushSalat and others only calculate them), open code and open data, an India-first, phone-first admin flow in 4 languages, and QR posters.

---

## 2. Architecture (short)

```
Imam's phone (PWA /admin/)
  └─ Supabase Free (Auth + Postgres + RLS)  ← drafts, masjids, audit
        ▲ read-only "publisher" role
GitHub Action (every 30 min + manual run)
  ├─ validate (fail closed) → build JSON → sign manifest
  ├─ commit JSON to `data` branch → deploy Pages
  ├─ keep Supabase awake
  └─ nightly encrypted backup → private repo
GitHub Pages: khushulabs.github.io
  /                 Astro landing + privacy page
  /admin/           React PWA (hash routes, PKCE)
  /m/{slug}/        QR landing pages (App Links)
  /v1/manifest.json + .sig, /v1/tiles/{gh5}.json, /v1/masjids/{id}.json
  /.well-known/assetlinks.json
User's Android phone (no account, no keys)
  JS: UI, sync (ETag), SQLite cache, @khushu/schedule → 30-day plan
  Kotlin engine: geofence + alarms + one-shot fix → AZR on/off
```

Rules:

- **Location never leaves the phone.** The app sends no coordinates anywhere. It fetches a geohash-5 tile and the 8 tiles around it.
- **The app holds no Supabase key.** The admin bundle holds only the anon key; RLS is the security boundary.
- **The admin origin hosts nothing else, ever.** The org root repo is the only one with Pages turned on.
- **Repo:** one monorepo at `khushulabs/khushulabs.github.io`, using pnpm workspaces.
  - Apps: `apps/mobile`, `apps/admin` and `apps/landing`.
  - Packages: `modules/khushu-engine` (Kotlin), `packages/schedule` and `packages/contracts`.
  - Other: `supabase/` (migrations and pgTAP tests) and `.github/workflows/`.

**Data model changes from v1:**

- `masjids.status` takes the values `pending`, `verified` or `suspended`. A trigger inserts every new row as `pending`, sets `created_by` to the user, and sets the status back to `pending` after any location or radius edit.
- `verification_requests` is reduced to geo-proof (pin plus accuracy) and an optional photo. The poster-code method is deferred.
- `schedule_snapshots` is written when an admin presses **Mark ready**. The Action publishes the latest ready snapshot.
- New tables: `publish_runs` (the Action's result per masjid, shown in the PWA) and `site_flags` (the global `published` kill switch).
- `jamat_rules`, `jamat_overrides`, `masjid_admins`, `admin_invites` and `audit_events` stay as in v1 §3.2.

---

## 3. Decisions log (v2)

**Status key:** **K** = kept from v1 · **C** = changed in v2 · **N** = new in v2.

| # | Topic | Decision (v2) | St. |
|---|---|---|---|
| D1 | Silencing | Turn our own `AutomaticZenRule` on and off. Never touch the user's global DND. | K |
| D2 | Triggers | **Hybrid**, as in review 06. A geofence enter or exit means presence. An alarm at window open checks location once and silences if inside. Recheck alarms every 3–5 min during the window. Boot re-arms everything. All of these feed one reducer. No permanent foreground service. *Supersedes the v1 "geofence primary, alarm if spike fails" approach.* | C |
| D3 | Stack | Expo dev builds + local Expo Module (Kotlin) + Supabase + Vite/React admin + Astro landing + pnpm. **No Edge Functions; no EAS needed.** | C |
| D4 | Admin sign-in | **Pilot: Google sign-in only** (PKCE). **Decided (owner).** Email magic link through free SMTP (e.g. Brevo) is v1.1 (D38). No Apple, no phone OTP. TOTP is **required for Md (maintainer)** and optional for masjid owners. | C |
| D5 | Radius | 30–150 m, enforced by the DB. Default 100 m, which KH-002 confirms. | K |
| D6 | Verification | Every new masjid is `pending`. **Md approves each one by hand:** geo-proof ≤50 m plus a phone call. **Nothing pending is published, not even by direct link.** The poster-code method comes in v1.5. | C |
| D7 | Change safety | A location or radius edit sends the masjid back to `pending`, and the old data stays live meanwhile. Impossible times are rejected. A shift over 30 min needs a confirm. Co-admin email alerts are deferred. | C |
| D8 | User read path | Static JSON on GitHub Pages under `/v1/`, with an **Ed25519-signed manifest**. There is no API that accepts coordinates. | C |
| D9 | Admin | Mobile-first **PWA at `/admin/`**, opened from **Manage your masjid**. The app has no auth SDK. In-app quick edit comes in v1.5. | C |
| D10 | Publish | The admin taps **Mark ready**, which validates and saves a snapshot. The **Action publishes it within about 30–60 min**. Undo restores the previous snapshot. | C |
| D11 | Sync | Pull only: on app open, on geofence entry, daily, and before Friday. Snapshots carry 60 days of overrides. Push comes in v2. | K |
| D12 | Seasonal | Gregorian date ranges with priority, plus relative rules (adhan + N). | K |
| D13 | Licence | **GPL-3.0** for the Khushu app and admin. **Apache-2.0** for `modules/khushu-engine` (and any later renamed reusable engine). **MIT** for other `packages/*`. **ODbL** for the data. **DCO sign-off only, no CLA, no AGPL.** Engine licence is fixed before any outside engine contribution. Panel 11 (5 Nov 2026). **Decided (owner).** | C |
| D14 | BLE mesh | Cut. | K |
| D15 | iOS | **Deferred.** When it comes, it will offer reminders only and never claim auto-silence. | C |
| D16 | Exact alarms | Use `SCHEDULE_EXACT_ALARM`, with `setWindow` as the fallback. Never use `USE_EXACT_ALARM`. | K |
| D17 | Languages | **Launch in English, Bengali, Hindi and Urdu. Urdu RTL must work at launch.** **Decided (owner).** English and Bengali are required. Fonts: Noto Sans Bengali, Noto Sans Devanagari, Noto Nastaliq Urdu (Noto Naskh Arabic as fallback). Prayer and adhan names are translated, not transliterated from English. Further languages come in v1.1 through Weblate/Crowdin. | C |
| D18 | Directory | Follow by QR or find nearby masjids (tiles). Private masjids live under Settings → Advanced. | C |
| D19 | Calc defaults | India uses Karachi + Hanafi. These live under Advanced. | K |
| D20 | DND exceptions | Starred contacts and repeat callers are on by default. | K |
| D21 | Guardrails | Max window 45 min (90 for Jumu'ah). Always restore. If the user toggles DND during a session, we don't overwrite it. **The "Use my own times" override is cut from v1.** | C |
| D22 | Staleness | "Updated N days ago" badge. Fall back to calculated times after 60 days. | K |
| D23 | Analytics | None. No crash SDK. | K |
| D24 | No background location | Reminder mode: time-only notifications. | K |
| D25 | Mawaqit | Never scrape. Outreach is deferred to v1.1+. | C |
| D26 | Announcements | v2. | K |
| D27 | Hosting | **GitHub Pages + Actions (public repo) + 2 Supabase Free projects.** No Cloudflare and no Supabase Pro. A Supabase pause blocks only the admin; users never notice. | C |
| D28 | Spikes | Run in the real repo's `modules/khushu-engine` on a spike branch, not in a throwaway app. | C |
| D29 | Distribution | Play first. A GitHub Releases APK **signed with the same key** (upload your own app-signing key to Play App Signing). F-Droid needs a separate GMS-free build (KH-073, later). | N |
| D30 | Origin | Free GitHub org `khushulabs` with org 2FA required. Only the root site repo has Pages turned on. | N |
| D31 | Supabase | `khushu-dev` + `khushu-prod`. Localhost redirects only on dev. Prod redirect allow-list is the exact admin URL. Region: Mumbai. | N |
| D32 | Publish integrity | Signed manifest. The app rejects bad data and keeps its last good cache. A diff tripwire stops the Action if more than 20% of masjids change or any masjid moves more than 50 m. A global `published=false` kill switch makes the app fall back to calculated times. | N |
| D33 | Backups | Nightly `pg_dump` using a read-only `backup` role, encrypted with `age`, stored in a **private** repo. Keep 30 daily and 12 monthly copies. Run a restore drill every quarter. Never store it in the public repo or on Releases. | N |
| D34 | Abuse caps | 3 claims a day and 30 writes an hour per account (RPC checks). Supabase auth CAPTCHA (Turnstile, free). No separate Turnstile on claims. | N |
| D35 | Builds | Gradle builds in GitHub Actions, unlimited and free. EAS Free is optional. **No OTA updates in v1.** | N |
| D36 | Closed test | Recruit 16–20 testers so at least 12 stay opted in for 14 days. The exit criteria are in M4. | N |
| D37 | Admin web hardening | Hash routing, PKCE, a CSP meta tag as the first element in `<head>`, a frame-buster, and a re-confirm for destructive actions. No third-party scripts. Self-hosted fonts. | N |
| D38 | Email | Supabase's built-in email reaches only project team members, 2 per hour. So the pilot uses Google sign-in only. Magic link through a free SMTP provider (e.g. Brevo) is **v1.1**. **Decided (owner).** | N |
| D39 | Play account | **Md's personal Play account. Decided (owner).** Md's name shows as the developer, and the 12-tester, 14-day closed test applies. | N |
| D40 | Test phones | **Md's own phone is the daily driver. A borrowed Xiaomi/Redmi from a tester** is the OEM phone (the most aggressive common OEM). **Decided (owner).** | N |
| D41 | Org name | **`khushulabs`** (`khushulabs.github.io`). Md renamed the org from `khushu-org` to `khushulabs` on GitHub (noted 17 Nov 2026), superseding the 5 Nov pick of `khushu-org` (which had beaten `khushuhq` and `khushu-labs`). Org was still empty, so nothing broke. App name stays "Khushu". No paid custom domain (₹0 principle). **Decided.** | C |
| D42 | Engine boundary | `modules/khushu-engine` is **prayer-agnostic**: it only knows places (fences), time windows, silence/restore and diagnostics. No prayer, masjid, jamat or adhan words in its API, code or docs; Khushu maps prayer schedules onto it. Goal: publish it later as a standalone engine other apps (workplaces, conferences, gatherings) can build on, like Chromium under Chrome. Prove Khushu at the pilot masjid first. **Decided (owner).** | N |
| D43 | Look-alike orgs | **Dropped (5 Nov 2026).** Reserving empty `khushuorg` / `khushulabs` orgs was considered, but GitHub's Username Policy bans holding names inactively for future use (accounts can be removed without notice), which could put Md's account at risk. GitHub publishes no fixed limit on free orgs; the limit was not the reason. Rely on QR codes and the in-app address instead. Update 17 Nov 2026: `khushulabs` is now the real, active org (D41), so this no longer applies to it; still do not hold `khushu-org` or other look-alikes. | N |
| D44 | Silence UX | Silence directly, never ask at the moment. Consent is given once at setup. While silenced, show a quiet ongoing notice, e.g. "Silenced for Zuhr jamat, back on at 1:45", with an **Unmute now** action. Always restore. An optional heads-up a few minutes before is v1.1 and off by default. **Decided (owner).** | N |
| D45 | QR posters | **QR posters are printed only for registered masjids that have an approved admin**, so a scan never leads nowhere. Unregistered masjids still get fallback (calculated) timing. **Decided (owner), 6 Nov 2026.** | N |

---

## 4. Where the experts disagreed

| Topic | Positions | Chosen |
|---|---|---|
| Trigger | **05 and 07:** alarm first, with the geofence only as an assist. **06 and the owner:** hybrid, with the geofence for presence. | **Hybrid.** Alarm-only misses people who arrive mid-window or leave early unless it polls all day. The alarm-only approach is kept for the later F-Droid build. |
| Languages | **v1:** 4 languages. **07:** English + Hindi, then Urdu. | **Owner decided: English, Bengali, Hindi and Urdu at launch, with Urdu RTL working** (D17). This overrides 07's cut, and the solo effort estimate goes up to cover it (§10). |
| Claim CAPTCHA | **07:** cut Turnstile. **08:** Turnstile on claims plus auth CAPTCHA. | Auth CAPTCHA only (a config switch). Claims are limited by RPC caps and Md's approval. Claim Turnstile comes in v1.5. |
| Backup storage | **05:** a Release asset is fine. **08:** never anything public. | **Private repo.** Even encrypted, a dump in public history stays there forever. |
| Publish | **v1:** Edge Function on click. **08:** scheduled Action with a narrow role. | **Action.** It keeps the service key off Supabase functions and adds signing and tripwires. Cost: up to about 1 h before changes go live; Md can trigger a run by hand. |
| Pending masjids | **v1:** served by direct link. **07/08:** nothing until Md approves. | **Nothing published until approved.** At pilot scale, approval happens the same day. |
| Licence | **v1:** GPL + AGPL + CLA-like grant. **08:** GPL app, MIT packages, ODbL, DCO; MIT for everything is also acceptable. | **08's main option**, confirmed by the owner (D13). |
| When the 14-day test starts | **06:** as soon as silence works. **07:** with real masjid times from day 0. | **Start when official times are live (M4).** Testers drop out if they see no value. The Play declaration goes in early to get any policy feedback early. |
| Branch protection vs Action commits | **08:** PRs required on `main`. **Owner:** the Action commits each publish. | **The Action commits to a `data` branch**, which is unprotected and only the Action pushes to it. `main` stays protected. |
| Magic link | **Owner, 07 and 08:** Google + magic link. | **Google only for the pilot; magic link in v1.1** (owner confirmed). No reviewer noticed that Supabase's built-in email can't reach real users (D38). |

---

## 5. Phase 0 spikes (solo, 2 phones)

**Devices (D40):** Md's own phone (the daily driver) plus a **Xiaomi/Redmi borrowed from a tester**. No iOS.

**Output:** `docs/spikes/<name>.md` with logs and a short screen video.

**S-A · KH-001: AZR + exact alarm** (absorbs KH-003)

- **Proves:** DND access works. Our rule turns on and off. Starred contacts ring through. The exact-alarm grant, revoke and `setWindow` fallback all behave.
- **GO:**
  - The rule activates in under 2 s on both phones.
  - Turning our rule off leaves the user's own DND **unchanged**.
  - A starred caller rings.
  - Exact alarms fire within ±1 min, 20 of 20 times. The fallback fires within ±3 min.
  - The manifest has no `USE_EXACT_ALARM`.
- **NO-GO:** fall back to `setInterruptionFilter` on that OEM, or ship reminder mode only on that OEM.

**S-B · KH-002: hybrid trigger** (rescoped; absorbs KH-006)

- **Proves:** three things.
  1. Walking in while the window is open silences the phone through the geofence.
  2. With the geofence turned off, the window-open alarm plus a one-shot fix still silences the phone if you're inside.
  3. A recheck or exit restores the phone after you leave.
- **Also tested:** swiping the app away and rebooting during a window. Every walk is logged at **100 m and 150 m** at your masjid.
- **GO:**
  - Daily driver: 10 of 10.
  - Xiaomi/Redmi, after battery whitelisting and autostart are turned on: **≥8 of 10** silence within 3 min of entry or window open, and restore within 3 min of exit or window end.
  - Recovers from a reboot during a window.
- **NO-GO:**
  - Lower the recheck interval to 2 min.
  - If the one-shot fix returns null on the OEM, allow a **short, typed location foreground service** ("Checking if you're at the masjid…") that stops after the fix. Never start it from boot.
- **Also decides:** the default radius (D5).

**Gate (after about 2–3 weekends):** if S-A and S-B are GO, build the engine (KH-016…019, KH-068). Backend, admin and UI work don't wait for the gate.

**Dropped from Phase 0:** KH-004 and KH-005 (iOS) and any GMS-free build.

---

## 6. Milestones

| M | Name | Exit criteria | Effort |
|---|---|---|---|
| **M0** | Foundations + Phase 0 | Org and repo hardened. CI green. Spikes S-A and S-B GO. Pilot masjid chosen. Xiaomi/Redmi borrowed. Bengali, Hindi and Urdu reviewers found. | 14 ev |
| **M1** | Engine + schedule | A dev build on both phones silences and restores from a plan built by `@khushu/schedule`, through both the geofence and the alarm paths. | 21 ev |
| **M2** | User app, internal alpha | The full app runs on the internal Play track with a private masjid and calculated times. No backend needed. Used by Md and family for a week. All 4 languages reviewed, with Urdu RTL checked. | 30 ev |
| **M3** | Admin + publishing | Md creates the pilot masjid on his phone and approves it. Signed JSON goes live within 1 h. The app follows it and silences at the official time. Backup restored into dev once. | 35.5 ev |
| **M4** | Closed test (pilot) | Play closed test passes **review 07's pilot exit criteria** (below). | 14 ev + 14 days |
| **M5** | Production | Production access granted. Staged rollout to 100%. v1.0.0 APK on GitHub Releases. | 1.5 ev |

**M4 pilot exit criteria (review 07):**

- **≥12 testers still opted in on day 14.** Recruit 16–20.
  - Include about 4 elders (55+), at least 2 Xiaomi/Vivo/Oppo users, at least 2 Samsung users, and the masjid admin.
- **≥90% of reported sessions both silenced and restored.**
- **No stuck-DND reports.**
- **The masjid admin edited the times without Md's help.**
  - Covers at least one one-off change (e.g. an Isha shift) and one Jumu'ah.
- Results go in `docs/beta-report.md`. Play's production form asks about the test.

---

## 7. v1 tasks (41), in order

**Legend:** **(C)** = changed from v1 · **(N)** = new · "absorbs" = old IDs merged into this task.

### M0 · Foundations + Phase 0

#### KH-071 (N) · GitHub org and repo hardening

- **Size:** 1 ev · **Deps:** none
- **What:**
  - Org `khushulabs` exists (created 5 Nov 2026 as `getkhushu`, then renamed); require 2FA.
  - Create the `khushulabs.github.io` repo with Pages from Actions. Pages stays off on every other repo.
  - Protect `main`: PRs required, no force pushes.
  - Set up a `prod` Environment for secrets.
  - Turn on gitleaks and Dependabot. Pin all actions to full SHAs.
  - Add a CI grep for `service_role`, `sb_secret_` and JWT patterns in `dist/` and the APK (switch it on once builds exist).
- **Done when:**
  - The checklist in `docs/ops.md` is ticked.
  - A planted fake key fails CI.

#### KH-007 (C) · Monorepo scaffold, CI and licences (absorbs KH-010)

- **Size:** 2 ev · **Deps:** KH-071
- **What:**
  - pnpm workspaces using the §2 layout.
  - CI runs typecheck, lint and vitest.
  - Licence files per D13, `DATA-LICENSE` (ODbL), the DCO check, `CONTRIBUTING`, `SECURITY.md` and `CODE_OF_CONDUCT`.
- **Done when:**
  - A blank PR goes green in under 5 min.
  - A commit without a DCO sign-off fails.

#### KH-063 (C) · Pilot masjid, reviewers and test phone

- **Size:** 1 ev · **Deps:** none · Owner task.
- **What:**
  - Find 1 pilot masjid (2 if easy) and a committee contact.
  - Find **one native reviewer each for Bengali, Hindi and Urdu**.
  - Borrow a Xiaomi/Redmi from a tester.
- **Done when:** `docs/pilot.md` lists the contact and their consent, the 3 reviewers, and the borrowed phone, **by the end of week 1**.

#### KH-008 (C) · Expo app shell and engine skeleton (absorbs KH-015)

- **Size:** 2 ev · **Deps:** KH-007
- **What:**
  - `apps/mobile` on Expo with CNG and an Android dev build. No Expo Go.
  - `modules/khushu-engine` as a Kotlin Expo Module with a config plugin for the manifest and boot receiver.
  - Typed API stubs: `setPlan`, `setFences`, `getStatus`, `startManual`, `stopSilence`, `getHistory`, `getDiagnostics`, `checkPermissions`, `openPermissionSettings`, plus a `statusChanged` event.
- **Done when:**
  - Prebuild is clean.
  - `ping()` returns the version on both phones.
  - The engine has its own Apache-2.0 `LICENSE` and a CI grep fails on prayer/masjid/jamat/adhan words inside `modules/khushu-engine` (D42).

#### KH-001 (C) · Spike S-A: AZR + exact alarm (absorbs KH-003)

- **Size:** 3 ev · **Deps:** KH-008
- **What:** see §5.
- **Done when:** the S-A GO criteria are recorded in `docs/spikes/azr.md` with a video.

#### KH-002 (C) · Spike S-B: hybrid trigger + radius (absorbs KH-006)

- **Size:** 5 ev · **Deps:** KH-001
- **What:** see §5. Includes the boot receiver and one-shot fix code that KH-018, KH-019 and KH-068 reuse.
- **Done when:** the S-B results are recorded per phone, and the default radius is decided.

### M1 · Engine + schedule

#### KH-011 (C) · `packages/contracts`

- **Size:** 2 ev · **Deps:** KH-007
- **What:**
  - zod schemas for tiles, masjid snapshots, **the manifest (file hashes, the `published` flag, generated time)**, the engine window plan and history events.
  - JSON Schema export (`masjid.v1`).
- **Done when:** 3 sample masjids, 1 tile and 1 manifest validate in CI, and the schema is in `docs/schema/`.

#### KH-012 (C) · `packages/schedule` resolver (absorbs KH-014)

- **Size:** 4 ev · **Deps:** KH-011
- **What:**
  - Turns rules, overrides, `adhan` and the IANA timezone into concrete windows.
  - Handles seasonal priority, adhan + N, 1–2 Jumu'ah slots, cancellations, the 60-day staleness fallback and the 45/90-min clamps.
  - Country defaults: India → Karachi + Hanafi. Unknown countries → MWL plus a "check your method" flag.
- **Done when:**
  - Golden tests pass for:
    - fixed Dhuhr
    - Maghrib adhan + 7
    - Ramadan priority
    - 2× Jumu'ah
    - a cancelled override
    - Asia/Kolkata and a DST zone
    - the 60-day fallback
    - a 120-min window clamped to 45
  - No React Native dependencies.

#### KH-013 (C) · Silence state machine (spec + TS reference)

- **Size:** 3 ev · **Deps:** KH-007
- **What:**
  - Inputs: geofence enter/exit, window-open, recheck and window-close alarms, one-shot fix results, boot, user DND toggle and manual session.
  - Persisted state: `inside`, `lastFenceAt`, merged windows and `session`.
  - A fresh exit beats a stale "inside".
  - Exit hysteresis of 2 min.
- **Done when:**
  - `docs/engine-state-machine.md` has a transition table.
  - 100% branch coverage.
  - JSON fixtures are shared with Kotlin.

#### KH-016 · Android AZR manager

- **Size:** 2 ev · **Deps:** KH-001, KH-008
- **What:**
  - Upsert, activate and deactivate the "Khushu – Jamat" rule.
  - ZenPolicy lets starred contacts and repeat callers through.
  - Check DND access and open the settings intent.
- **Done when:**
  - Deactivating leaves a user DND that was already on untouched (instrumented test).
  - Revoking access reports `needsDndAccess` without crashing.

#### KH-017 · Plan store, Kotlin reducer and history

- **Size:** 3 ev · **Deps:** KH-013, KH-016
- **What:**
  - Store the 30-day plan and the session on disk.
  - Port the reducer to Kotlin.
  - Keep the last 30 history events and diagnostics (last fence event, last alarm, last fix, permission states).
- **Done when:**
  - Kotlin tests pass on the TS fixtures.
  - State survives process death.

#### KH-018 (C) · Geofence receiver

- **Size:** 2 ev · **Deps:** KH-017, KH-002
- **What:**
  - `GeofencingClient` with a PendingIntent receiver.
  - Fences for the nearest ≤100 masjids, re-ranked when the plan changes.
  - **Persists `inside` and `lastFenceAt`.**
- **Done when:** with the app force-stopped, walking in silences the phone inside the window and does nothing outside it, on both phones.

#### KH-019 (C) · Alarms, boot and manual silence (absorbs KH-020)

- **Size:** 3 ev · **Deps:** KH-017
- **What:**
  - Alarms for window open and window close, plus **recheck alarms every 3–5 min during a window**.
  - Re-arm on `BOOT_COMPLETED` and `MY_PACKAGE_REPLACED`, never starting a foreground service from boot.
  - Manual silence for 15/30/60 min, restored by an alarm.
- **Done when:**
  - After a reboot inside a window, the phone is silenced again within 3 min.
  - With exact alarms denied, the window still opens within ±3 min.
  - A manual 15-min session restores at 15 ±1 min, even after a reboot.

#### KH-068 (N) · AlarmLocationChecker

- **Size:** 2 ev · **Deps:** KH-019
- **What:**
  - On window-open and recheck alarms, take a one-shot `getCurrentLocation` fix and feed it to the reducer.
  - Handle a null or timed-out fix by keeping the last known state.
  - Add the short location foreground service **only if** S-B proved it's needed.
- **Done when:** with geofences disabled in a test flag, the alarm path alone silences and restores at S-B rates.

### M2 · User app (internal alpha)

#### KH-044 (C) · UI foundation (absorbs KH-022, KH-043)

- **Size:** 5.5 ev · **Deps:** KH-008
- **What:**
  - 3 tabs: Home, Masjids and Settings.
  - expo-sqlite schema with migrations.
  - Design tokens:
    - text at least 18 sp
    - tap targets at least 56 dp
    - AA contrast
  - Components: Button, Card, ListRow, PermissionCard, Badge.
  - Shared i18n package (used by the app and the admin): EN, BN, HI, UR, switchable at runtime.
  - **Urdu RTL at launch:** `I18nManager` mirroring (an app reload when switching into or out of RTL is acceptable), and directional icons flip.
  - Lint: logical properties only (no `left`/`right`) and no hard-coded strings.
  - Bundled fonts: **Noto Sans Bengali, Noto Sans Devanagari, Noto Nastaliq Urdu** (Noto Naskh Arabic as fallback if Nastaliq clips or is slow), with taller line height for Nastaliq.
  - Times are shown unambiguously in every locale.
- **Done when:**
  - Switching between all 4 languages works.
  - In Urdu every screen is mirrored, with no clipped Nastaliq text.
  - **Bengali, Hindi and Urdu shaping is checked on both phones** (conjuncts and joins are correct, no tofu boxes).
  - A manual 200% font pass in each language shows no clipping (long Hindi and Bengali strings included).
  - The lint catches a hard-coded string.

#### KH-023 (C) · Sync service

- **Size:** 3 ev · **Deps:** KH-011, KH-012, KH-044
- **What:**
  - Fetch the tile plus its 8 neighbours and the snapshots from `khushulabs.github.io/v1/`, using ETag.
  - Cache in SQLite.
  - Refresh on app open, on geofence entry, daily and before Friday.
  - Resolve 30 days and call `setPlan`.
  - Until KH-069 lands, test against local fixture JSON.
- **Done when:**
  - The 304 path and airplane mode are tested.
  - The network log shows no coordinates.

#### KH-024 (C) · Onboarding

- **Size:** 2 ev · **Deps:** KH-044, KH-023
- **What:** language picker (4 large buttons: English, বাংলা, हिन्दी, اردو) → one "How it works" card → **[Scan masjid QR]** (primary) or [Search nearby] (foreground location only).
- **Done when:**
  - From install to following a masjid takes 3 screens or fewer.
  - If the app is killed mid-flow, it resumes where it stopped.

#### KH-025 (C) · Permissions, OEM guides and reminder mode

- **Size:** 4 ev · **Deps:** KH-024, KH-016, KH-019
- **What:**
  - One explainer before each OS prompt, in this order: notifications → DND access (auto-detected) → exact alarm → "Allow all the time" location → battery/OEM steps (Xiaomi, Samsung, Vivo, Oppo).
  - Play prominent-disclosure text.
  - If background location is denied, switch to reminder mode.
- **Done when:**
  - Each prompt comes after its explainer.
  - The DND grant is detected without a refresh.
  - With background location denied, reminders still work.
  - The OEM steps can be completed on both phones.

#### KH-027 (C) · Home (absorbs KH-030)

- **Size:** 3 ev · **Deps:** KH-023
- **What:**
  - Status line: "Protected", or "1 step needed" with a fix.
  - Next jamat and its window.
  - [Silence now 30 min ▾] and [Restore now].
  - While silenced, an ongoing notification: "Silenced for {prayer} jamat, back on at {time}" with **Unmute now** (D44).
  - A **Recent** list (last 10 sessions).
  - **"Didn't work?"**: diagnostics plus a feedback template with no location in it.
- **Done when:**
  - Status updates within 1 min.
  - Every fix link works.
  - The diagnostics text contains no coordinates (test).

#### KH-028 (C) · Masjids list and detail

- **Size:** 2 ev · **Deps:** KH-023
- **What:**
  - List with Verified and Calculated badges, "Updated N days ago" and a ★ on the primary masjid.
  - Detail page: today's times, Jumu'ah, seasonal note, Unfollow.
  - **"Report wrong times"** opens a prefilled email or GitHub issue.
  - The local override is cut.
- **Done when:**
  - Follow and unfollow re-plan the silencing.
  - It works offline.

#### KH-031 (C) · Settings (absorbs KH-029)

- **Size:** 3.5 ev · **Deps:** KH-044, KH-012
- **What:**
  - Language, starred/repeat callers, permissions health, and **Manage your masjid ↗** (opens `/admin/` in a Custom Tab).
  - Advanced: calculation method and madhab, window lengths, and **add a private masjid** (map pin, "I'm here now" with accuracy shown, 30–150 m radius, calculated times, no backend).
- **Done when:**
  - Changes re-plan within 1 min.
  - A private masjid works in airplane mode.
  - The radius is clamped.

#### KH-046 (C) · Glossary and translations: BN, HI, UR (absorbs KH-045)

- **Size:** 5 ev · **Deps:** KH-044, KH-063
- **What:**
  - Glossary in Bengali, Hindi and Urdu: **prayer and adhan names** (Fajr, Dhuhr, Asr, Maghrib, Isha, Jumu'ah, Taraweeh) and terms such as jamat, iqama and khutbah, with the preferred spellings.
  - Translate all strings: app, admin PWA, poster, store listing and the OEM guides.
  - A native speaker reviews each language. No unreviewed machine translation.
  - Admin PWA strings are done in the same pass (shared i18n package).
- **Done when:**
  - CI shows 100% key coverage for all 4 languages, in both the app and the admin.
  - Each reviewer's sign-off is in the PR.
  - Prayer names appear in the native script on the Home screen, the masjid detail page and notifications.

#### KH-009 (C) · Release pipeline

- **Size:** 2 ev · **Deps:** KH-008
- **What:**
  - **Pay the $25 Play fee here.**
  - A GitHub Actions Gradle build of the AAB and APK.
  - Upload key in the `prod` Environment.
  - Play App Signing using **your own uploaded app-signing key**, so the GitHub APK and the Play build share a signature.
  - A tag uploads to the internal track and creates a draft GitHub Release with SHA-256 checksums.
- **Done when:**
  - Tag `v0.x` produces a Play internal build and a draft Release.
  - The APK and the Play build verify against the same certificate.

### M3 · Admin + publishing

#### KH-033 (C) · Schema and two Supabase projects

- **Size:** 2.5 ev · **Deps:** KH-007
- **What:**
  - `khushu-dev` and `khushu-prod` in Mumbai.
  - Migrations per §2, with PostGIS in `extensions`.
  - `publisher` and `backup` DB roles.
  - CI runs `supabase start`, `db reset` and pgTAP.
- **Done when:**
  - Reset is clean in CI.
  - The radius check rejects 20 m and 200 m.

#### KH-035 (C) · RLS, audit and pgTAP (absorbs KH-038)

- **Size:** 3.5 ev · **Deps:** KH-033
- **What:** the review 08 §2 rules:
  - `is_masjid_admin()` is security definer with a pinned search path.
  - Inserts are pending only and set `created_by`.
  - Only the maintainer, at `aal2`, sets the status.
  - A location edit sends the masjid back to pending.
  - Nobody writes to a suspended masjid.
  - `anon` reads nothing.
  - Audit rows are written by a trigger, and UPDATE/DELETE/TRUNCATE are revoked.
  - A CI check fails if any `public` table has RLS off, and `supabase db lint` runs in CI.
- **Done when:** every rule has a positive and a negative pgTAP test, and CI is green.

#### KH-036 (C) · Admin RPCs (absorbs the backend parts of KH-054 and the caps from KH-056)

- **Size:** 3 ev · **Deps:** KH-035
- **What:**
  - `claim_masjid` (→ pending + geo-proof), `invite_admin` (hashed token, 48 h), `accept_invite`, `remove_admin`.
  - Maintainer-only `approve`, `reject` and `suspend`.
  - Caps: 3 claims a day and 30 writes an hour.
- **Done when:** pgTAP shows that:
  - an expired invite fails
  - an editor can't invite
  - the last owner can't be removed
  - the 4th claim of the day is rejected
  - approve without `aal2` fails

#### KH-047 (C) · Pages site: landing and admin shell (absorbs KH-034, KH-040 and KH-042, plus 07's PWA task)

- **Size:** 5 ev · **Deps:** KH-071, KH-033, KH-044
- **What:**
  - One workflow builds and deploys:
    - Astro landing at `/`: an honest Android-only promise, the Play badge and APK link, and the **privacy policy page**.
    - The React admin at `/admin/`.
    - `/.well-known/assetlinks.json`.
  - Admin:
    - Hash routes and PKCE, with the callback on a real path.
    - Google sign-in and auth CAPTCHA.
    - The CSP meta tag first in `<head>`, plus a frame-buster.
    - A PWA manifest and an "Add to home screen" hint.
    - The "My masjids" list.
    - **The same 4 languages as the app.** Urdu is RTL (`dir="rtl"`, logical CSS). The Noto fonts are self-hosted and subset.
  - Prod redirect allow-list is the exact URL.
- **Done when:**
  - Sign-in works on a 360 px phone in all 4 languages, and Urdu is mirrored.
  - The PWA installs from Chrome on Android.
  - Merging to `main` deploys.
  - The landing page scores ≥90 for accessibility in Lighthouse.
  - No PR preview uses prod keys.

#### KH-048 (C) · Claim / create masjid on site

- **Size:** 2.5 ev · **Deps:** KH-047, KH-036
- **What:**
  - "Stand inside the main hall" → [Use my location] with a live accuracy bar; **the admin can't continue until accuracy is ≤50 m**.
  - MapLibre (OSM tiles) radius circle, default 100 m.
  - Name, area and city.
  - Optional notice-board photo.
- **Done when:**
  - A claim stores the geo-proof and shows "Pending review".
  - The radius stays within its caps.

#### KH-049 (C) · Schedule editor (single page)

- **Size:** 4 ev · **Deps:** KH-047, KH-012
- **What:**
  - Daily: 5 rows, each Fixed or Adhan + N.
  - Jumu'ah: 1–2 slots, each with a khutbah time and a salah time.
  - Seasonal: date ranges; overlaps are blocked.
  - One-off: change or cancel a single prayer, with a reason.
  - Saves as a draft.
- **Done when:**
  - Every rule type round-trips to the DB.
  - It works one-handed at 360 px with the system font at 130%.

#### KH-050 (C) · Preview, mark ready and undo (absorbs KH-037)

- **Size:** 2.5 ev · **Deps:** KH-049
- **What:**
  - A 7-day preview from `@khushu/schedule`.
  - Plain-word validation (Fajr between dawn and sunrise, Isha after Maghrib, windows within limits).
  - A shift over 30 min needs a re-confirm.
  - **Mark ready** runs an RPC that re-validates and writes the snapshot.
  - **Undo** restores the previous snapshot.
  - Shows "Live in about 1 h", then the `publish_runs` result.
- **Done when:**
  - The preview matches the mobile resolver (shared fixture).
  - Invalid times are blocked with a readable message.
  - Undo works.

#### KH-051 (C) · Co-admins and account deletion (absorbs KH-039)

- **Size:** 2 ev · **Deps:** KH-047, KH-036
- **What:**
  - Invite by link or QR (48 h), list admins, remove an admin.
  - **Delete my account:** personal data is removed within 30 days, and the actor is pseudonymised in the audit log.
  - Ownership transfer is done by Md by hand.
- **Done when:**
  - An editor sees no admin controls.
  - An expired link says "expired".
  - After deletion, the email is gone and the masjid still works.

#### KH-053 (C) · Md's moderation view (absorbs 07's KH-053a and the UI of KH-054)

- **Size:** 2 ev · **Deps:** KH-047, KH-036
- **What:**
  - `/admin/#/moderate`, maintainer only, with TOTP at `aal2`.
  - Pending list with pin map, accuracy, photo and contact.
  - Approve or reject (with a reason), suspend.
  - **Target: under 10 min per masjid, including a phone call.**
- **Done when:**
  - Approving publishes the masjid on the next Action run.
  - Non-maintainers are blocked.
  - Every action is audited.

#### KH-041 (C) · Publisher Action

- **Size:** 4 ev · **Deps:** KH-011, KH-012, KH-035, KH-050
- **What:**
  - Runs every 30 min and on manual dispatch, **never on `pull_request_target`**, in the `prod` Environment with minimal permissions.
  - Connects as the `publisher` role and reads ready snapshots.
  - **Validates and fails closed:**
    - zod schema
    - time rules
    - radius
    - inside India's bounding box
    - only verified masjids
  - Writes `/v1/masjids`, `/v1/tiles` and `/m/{slug}/` pages.
  - Commits to the `data` branch, then deploys Pages.
  - Writes `publish_runs` back.
  - The query also keeps Supabase awake.
  - A failed run opens a GitHub issue.
- **Done when:**
  - The output validates.
  - A pending masjid never appears.
  - A rebuild produces identical bytes.
  - A forced failure opens an issue.
  - **Check:** do bot commits on `data` reset the 60-day inactivity timer for scheduled workflows? If not, add a monthly reminder to make one manual commit.

#### KH-069 (N) · Signed manifest, kill switch and tripwire (absorbs 08's KH-072)

- **Size:** 3 ev · **Deps:** KH-041, KH-023
- **What:**
  - The Action writes `manifest.json` (SHA-256 of every file plus the `published` flag) and an Ed25519 signature. The private key lives in a separate Environment secret.
  - The app pins the public key, **rejects unsigned or tampered data, and keeps its last good cache**.
  - `published=false` makes the app fall back to calculated times.
  - Diff tripwire: if more than 20% of masjids change, or any masjid moves more than 50 m, the job fails and opens an issue.
- **Done when:**
  - A tampered tile is rejected in a test.
  - The kill switch works on the test phone.
  - The tripwire fires on a fixture.
  - Key rotation is documented.

#### KH-070 (N) · Encrypted backup and restore drill

- **Size:** 1.5 ev · **Deps:** KH-033, KH-071
- **What:**
  - Nightly `pg_dump` (using the `backup` role) → `age` encryption to a public key (the private key stays offline with Md, plus a paper copy) → pushed to the **private** repo `khushulabs/backups`.
  - Keep 30 daily and 12 monthly copies.
- **Done when:** the first restore into `khushu-dev` is documented and timed in `docs/ops.md`.

### M4 · Closed test (pilot)

#### KH-032 (C) · QR and App Links follow

- **Size:** 2 ev · **Deps:** KH-028, KH-041, KH-047
- **What:**
  - `https://khushulabs.github.io/m/{slug}` works as a verified App Link.
  - If the app isn't installed, the page shows the Play badge and the APK link, and the Play Install Referrer gives a deferred follow.
  - Printed QRs and `/m/{slug}` pages are issued only for registered masjids that have an approved admin (D45), so a scan never leads nowhere.
- **Done when:**
  - Scanning a printed QR with the app installed follows the masjid.
  - On a fresh install, the masjid is followed after the first open.

#### KH-064 (C) · Poster and share kit (absorbs 07's tester recruitment kit)

- **Size:** 3 ev · **Deps:** KH-032, KH-046
- **What:**
  - A printable HTML A4 poster (browser → Print) with a QR code, **in English, Bengali, Hindi and Urdu** (one per language, or a 4-language version).
  - Posters are generated and printed only for registered masjids that have an approved admin (D45), so a scan never leads nowhere. Unregistered masjids still get fallback (calculated) timing.
  - A 30 s imam script in all 4 languages.
  - A half-page install card for helping elders.
  - Tester kit: a Google Form that collects Gmail addresses with consent, a WhatsApp message, and the Google Group for the closed track.
- **Done when:**
  - The QR scans from 2 m.
  - Native speakers have reviewed the text in each language, and the Bengali and Urdu text prints with correct shaping.
  - **At least 16 tester sign-ups before day 0.**

#### KH-059 (C) · Play Console pack (absorbs KH-058 and the store listing from KH-061)

- **Size:** 4 ev · **Deps:** KH-025, KH-047, KH-046
- **What:**
  - Privacy policy (on the landing page).
  - Data safety:
    - users: "No data collected"
    - admins: email/name for account management, collected on the web only
  - DPDP grievance contact and a breach runbook.
  - Background-location declaration and a 30 s video showing silencing **both on entry and when already inside at window open**.
  - DND and exact-alarm justifications.
  - Store listing in **English, Bengali, Hindi and Urdu** (Play locales `en-IN`, `bn-BD`, `hi-IN`, `ur`), with screenshots from the real build.
- **Done when:** the pack is in `docs/store/play/`, the closed-track build passes Play review, and the declarations are accepted.

#### KH-057 (C) · Pre-test security checklist

- **Size:** 1 ev · **Deps:** KH-035, KH-041, KH-069
- **What:** a one-page `docs/threat-model.md` covering a fake masjid pin, admin takeover, schedule vandalism and privacy leaks. Run the checklist over RLS, the RPCs, the Action, the app's network calls and `pnpm audit`.
- **Done when:** no high-severity items are open before day 0.

#### KH-062 (C) · Play closed test run (07's KH-070)

- **Size:** 4 ev of fixes, plus 14+ days · **Deps:** KH-009, KH-032, KH-064, KH-059, KH-057
- **What:**
  - **Day 0:** the admin publishes the real times through the PWA, and Md runs a 15-min install help desk after Jumu'ah.
  - **Days 1–14:** WhatsApp reminders to keep testers opted in, a weekly 3-question form, one one-off change and one Jumu'ah.
- **Done when:** the M4 exit criteria (§6) are met, and `docs/beta-report.md` is merged.

### M5 · Production

#### KH-061 (C) · Production release

- **Size:** 1.5 ev · **Deps:** KH-062
- **What:**
  - Apply for production, using the beta report.
  - Staged rollout: 20% → 100%.
  - Publish v1.0.0 on GitHub Releases with the APK and checksums.
  - Update the landing page.
  - **Check Google's 2026 developer-verification rules for sideloaded APKs.**
- **Done when:** the app is live on Play and the Release is public.

---

## 8. Deferred tasks (nothing lost)

**iOS phase (needs the $99/yr Apple account):**

- KH-004 and KH-005 (iOS spikes)
- KH-021 (iOS region reminders)
- KH-026 (iOS permissions and Focus guide)
- KH-060 (iOS review notes)
- The iOS parts of KH-009, KH-032 and KH-061
- Apple sign-in

**v1.1:**

- **KH-072 (N)** Weblate/Crowdin setup and a contributor guide (07's KH-068).
- Further languages (Arabic, Malay, Turkish and others) through KH-072 community translation.
- KH-052: audit timeline UI. The server already writes the rows.
- Ownership transfer UI (from KH-036/051).
- KH-065: "Help an elder" guide. The KH-064 install card covers it for now.
- KH-066: prior-art deep dive.
- KH-067: Mawaqit outreach.
- Silent/vibrate mode choice.
- "Use my own times" override (from KH-028).
- 200% snapshot test suite (from KH-044).
- Magic-link sign-in through free SMTP, e.g. Brevo (D4, D38), and co-admin email alerts, which need the same SMTP.
- PR previews on the dev project.

**v1.5:**

- **KH-073 (N)** FOSS build flavour (alarm-first, no GMS) and F-Droid submission (from reviews 05 and 06).
- KH-054: poster-code verification.
- KH-055: Overpass hospital/school checks.
- KH-056: per-IP limits and claim Turnstile.
- Owner TOTP made required.
- CSV/ICS import, NFC tag, in-app quick edit, city offline packs, vouching, optional phone OTP.

**v2:** push, announcements, BLE beacons, widgets/Wear OS, Arabic/Malay/Turkish, aggregate follower counts, events calendar.

**Old IDs merged into v1 tasks:**

| Old | Now in |
|---|---|
| KH-003 | KH-001 |
| KH-006 | KH-002 |
| KH-010 | KH-007 |
| KH-014 | KH-012 |
| KH-015 | KH-008 |
| KH-020 | KH-019 |
| KH-022, KH-043 | KH-044 |
| KH-029 | KH-031 |
| KH-030 | KH-027 |
| KH-034, KH-040, KH-042 | KH-047 (KH-040 replaced by Pages; `/m/` pages come from KH-041) |
| KH-037 | KH-050 (validation repeated in KH-041) |
| KH-038 | KH-035 |
| KH-039 | KH-051 |
| KH-045 | KH-046 |
| KH-054 | KH-036 + KH-053 (the poster-code part is deferred) |
| KH-056 caps | KH-036 |
| KH-058 | KH-059 |

---

## 9. New task ID mapping

| Review proposal | Final ID | Note |
|---|---|---|
| 06 KH-019a AlarmLocationChecker | **KH-068** | Separate task |
| 08 KH-068 Signed manifest | **KH-069** | |
| 08 KH-072 Kill switch + tripwire | **KH-069** | Merged into the signed manifest task |
| 08 KH-069 Backup + restore drill | **KH-070** | |
| 08 KH-071 Org hardening | **KH-071** | |
| 08 KH-070 Secret-leak/supply-chain CI | **KH-071** | Merged with org hardening |
| 07 KH-068 Weblate/Crowdin | **KH-072** | Deferred to v1.1 |
| 05/06 FOSS flavour + F-Droid (no ID) | **KH-073** | Deferred to v1.5 |
| 07 KH-069 PWA install + phone UX pass | → KH-047 / KH-049 | Merged; no new ID |
| 07 KH-070 Play closed test run | → **KH-062** (C) | Reuses the old beta ID |
| 07 KH-071 Tester recruitment kit | → KH-064 | Merged; no new ID |
| 07 KH-053a Md-only moderation | → **KH-053** (C) | Reuses the old ID |

---

## 10. Effort and cost

**Effort:**

| | Evenings |
|---|---|
| M0 | 14 |
| M1 | 21 |
| M2 | 30 |
| M3 | 35.5 |
| M4 | 14 |
| M5 | 1.5 |
| **Total** | **116** |
| **+25% buffer** | **about 145** |

At **4–5 evenings a week, that's about 29–36 weeks (7–8 months)** to production. Launching in 4 languages, with Urdu RTL, adds about 8 ev (KH-044, 046, 047, 059, 063, 064). The 14-day closed test and Play review fall inside that time. If you work weekends harder (about 6 sessions a week), it's about 6 months.

**The fastest way to the first useful result:** M0 + M1 (about 9 weeks) gives a phone that silences itself.

**Cost:**

| Item | Cost |
|---|---|
| Google Play developer account | **$25 once (~₹2.2k)**, paid at KH-009 |
| GitHub org, Pages, Actions (public repo), private backup repo | ₹0 |
| Supabase Free × 2 (dev + prod) | ₹0. Free projects can pause; we keep ours awake and back it up ourselves. |
| Builds (Gradle in Actions; EAS Free optional) | ₹0 |
| Domain (`*.github.io`) | ₹0 |
| Turnstile, Google OAuth, OSM tiles (light use), Weblate for open source | ₹0 |
| **Ongoing total** | **₹0 a month** |

**Optional costs:**

- A Redmi (~₹5–8k used) only if borrowing falls through.
- Printing posters (about ₹100–300).
- A free SMTP account (Brevo, ₹0) for magic links in v1.1.
- Apple's $99/yr, only for the iOS phase.

---

## 11. Top risks

| Risk | Mitigation |
|---|---|
| Play rejects the background-location or DND use | KH-059 pack. Reminder mode. Submit the closed build early, and expect 1–2 rounds of review. |
| OEMs kill background work | The hybrid design (alarm backup), OEM guides, help desk at the masjid, diagnostics. |
| Testers drop below 12 | Recruit 16–20, send WhatsApp reminders, and start the test only when real times are live. |
| Scheduled Action is silently disabled after 60 days | Data-branch commits, a failure issue, and the KH-041 check. |
| Repo or Action takeover publishes bad data | Signed manifest, tripwire, kill switch, org 2FA, SHA-pinned actions. |
| Bengali, Hindi or Urdu render wrongly, or a reviewer is slow | Bundled Noto fonts, a shaping check on both phones, and reviewers found in week 1 (KH-063). A language can be held back from the store listing without blocking the other three. |
| Solo burnout or bus factor | A small v1, everything open and documented, and co-maintainers can be added to the org later. |

---

## 12. Open questions

None. The owner's round-3 answers are recorded as D4, D13, D17 and D38–D44. D45 (QR posters only at registered masjids with an approved admin) was added on 6 Nov 2026.
