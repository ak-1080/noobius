# Neighborhood migration reconciliation

The deployed wallet release uses `0000` through `0004_odd_blackheart`. Preserve those files and journal entries unchanged.

The neighborhood branch independently created six local migrations, `0004_typical_puck` through `0009_sharp_malice`, before the wallet release was discovered. Their exact SQL, snapshots and journal from commit `4385554` are archived in `pre-reconciliation-4385554/`. They are historical inputs, **not an active migration chain**.

The active chain now continues the deployed wallet schema with `0005_tired_jocasta.sql`. It adds neighborhood, project, entitlement and social tables/columns/indexes without recreating player records or dropping presence rows. Public IDs retain their existing value; previously null IDs are assigned on account access. The generated table-rebuild SQL was corrected before any application because it selected columns absent from the live baseline.

`tests/migration-reconciliation.test.mjs` checks fresh initialization, populated live-schema upgrade, account/inventory/session/escrow preservation, constraints, local transactional failure/retry, and final schema equivalence to the archived chain. This does not certify the hosted runner's bookkeeping or a hosted backup restoration.

The existing development database already has the equivalent expanded schema from the archived local chain and has no migration tracking table. Do not replay the canonical full chain or `0005` over it. Fresh environments use the active journal. Hosted deployments continue from their recorded deployed `0004`; future changes must append another migration.

The next additive migration, `0006_handy_polaris`, adds review metadata and an index to `player_reports`. Its preservation test checks existing reports, account values, sessions and escrow. It does not replace or re-run `0005`. The archived-schema equivalence test remains explicitly scoped to the reconciliation through `0005`.
