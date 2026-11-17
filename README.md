# khushulabs.github.io

Khushu: a free, open-source app that silences your phone at the masjid during jamat.

This is the Khushu monorepo. The roadmap lives in [docs/PLAN.md](docs/PLAN.md).

## Develop

- Node 22 LTS (see `.nvmrc`) and [pnpm](https://pnpm.io) 10
- `pnpm install`
- `pnpm typecheck`, `pnpm lint` and `pnpm test`
- `pnpm check:boundary`: the D42 check that keeps `modules/khushu-engine` app-agnostic
- Android app: see [apps/mobile/README.md](apps/mobile/README.md) (JDK 17 and the Android SDK; development build, no Expo Go)

See [CONTRIBUTING.md](CONTRIBUTING.md) for the pull request flow and sign-off rules, and [LICENSING.md](LICENSING.md) for how licences apply in this repository.
