# Ops checklist (KH-071)

Org: [khushulabs](https://github.com/khushulabs). Repo: `khushulabs/khushulabs.github.io`. Owner account: `mdopeace`.

- [x] Org requires two-factor authentication for all members
- [x] Public repo created (GPL-3.0 at the root; engine and packages get their own licences per D13)
- [x] `main` protected by the `protect-main` ruleset: PR required, no force pushes, no deletion, linear history
- [x] Dependency graph, Dependabot alerts and security updates on
- [x] Secret scanning and push protection on
- [x] Pages source set to GitHub Actions (no custom domain)
- [x] `prod` environment, deployable from `main` only
- [x] Actions: workflow token is read-only by default; actions pinned to full commit SHAs
- [x] CI `security` workflow: gitleaks (checksum-verified binary) plus a grep that fails on `service_role` and server secrets
- [x] Dependabot keeps pinned GitHub Actions up to date
- [x] A planted fake key fails CI (test PR #3, closed without merging)

Rules: never commit a Supabase service_role key or any server secret. Secrets live only in GitHub Environment secrets.
