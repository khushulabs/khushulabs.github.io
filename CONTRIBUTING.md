# Contributing

Thank you for helping with Khushu. Please read [docs/PLAN.md](docs/PLAN.md) and pick an open task from the [Khushu roadmap](https://github.com/orgs/khushulabs/projects/1). This repository is a pnpm monorepo; licences are described in [LICENSING.md](LICENSING.md). By taking part you also agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

- Node 22 LTS (see `.nvmrc`)
- pnpm 10, pinned in `package.json` as `packageManager`

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

## Sign-off (DCO)

Every commit must include a `Signed-off-by:` trailer, certifying the [Developer Certificate of Origin](https://developercertificate.org/). There is no CLA.

- On the command line, commit with `git commit -s`.
- Commits made through the GitHub website are signed off automatically.

A pull request whose commits are missing a sign-off will fail the DCO check.

## Pull requests

- Create your branch in this repository (you do not need to fork).
- Keep the pull request small and focused on one task.
- Link the Khushu issue in the description, for example `Closes #5` and `KH-007`.
- Every pull request needs one approval.
- Only the maintainer can merge into `main`.
