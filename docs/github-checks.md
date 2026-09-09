# GitHub verification

September 9, 2026. Workflow: [Noobius checks](https://github.com/ak-1080/noobius/actions/workflows/checks.yml).

The public repository previously had no registered workflows. The new pipeline runs on clean Ubuntu 24.04 GitHub-hosted runners with Node 22 and 24. It installs the committed package lock with `npm ci`, runs all default game/persistence tests, TypeScript and tooling compatibility tests, builds the production game, and checks that tracked source remains unchanged.

## First verified run

[Run 34346702743](https://github.com/ak-1080/noobius/actions/runs/34346702743) completed successfully for source `15766861f01d90a968399311faae14b2d1ee05bd`. Both Node matrix jobs passed. It was manually dispatched after workflow registration; main-push and pull-request triggers are configured, while documentation-only main pushes are skipped. Branch protection has not been changed or claimed to require these checks.

This supplies independent clean-install/build evidence beyond the development Mac. It does not launch the real wallet extensions, hosted multiplayer, five rendered browser sessions or human playtests. API/load mutation suites are deliberately excluded from this workflow because they require explicitly isolated fixture servers. Existing repository-wide lint issues and the two affected parser packages are still unresolved; passing this workflow is not a clean security audit.

## Permissions and reproducibility

The workflow uses read-only repository permissions, disables persisted checkout credentials and contains no production secrets or deployment steps. The checkout and setup-node actions are pinned to commit SHAs resolved from the official v7.0.1/v7.0.0 release tags. Concurrent runs for the same event/ref cancel obsolete runs; each matrix job has a 15-minute ceiling. See the official [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node) documentation.

`.nvmrc` selects Node 24. The package minimum is corrected to 22.18 because the test suite imports TypeScript without an extra loader flag; [Node 22.18 enabled that behavior by default](https://nodejs.org/en/blog/release/v22.18.0). Only the root package's engine metadata changed; dependency versions and their own engine metadata remain intact.

This increment changes repository verification and setup documentation, not gameplay, database schema, hosted settings or access. The private game remains Site version 45.

The next application push triggered [run 34348692471](https://github.com/ak-1080/noobius/actions/runs/34348692471) automatically for source `95447354912b8a31d8d537e6dac3e54bcc4b32ab`. Both Node 22 and 24 jobs passed 314 tests, the three tooling checks, type checking and builds on September 9, 2026. This confirms the push trigger in addition to the initial manual run.
