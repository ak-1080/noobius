# September 29 hosted acceptance on the current gameplay candidate

This is bounded acceptance evidence for source `320a9ed` on isolated Solana devnet staging. It is not a production deployment, a real-value payment review, or a 50-player certification. Production remains on its existing Worker, with a 50-player admission cap and token payments disabled.

## Release and recovery copy

- The exact `main` source passed [GitHub checks](https://github.com/ak-1080/noobius/actions/runs/36620553757). The guarded payment-enabled staging deploy ran its hosted Cloudflare-origin Helius RPC/genesis/mint/history probe, mint policy preflight, TypeScript check, staging build, zero-unsettled-payment gate, migration check, and login/save/market smoke. Staging game Worker: `468665a6-e4c6-4108-9d68-80cdbf4890f9`; recovery Worker: `0e02af47-3991-4969-a19d-62d39c1e2186`. The room Worker was not redeployed.
- Before deploying, a private staging SQL export was saved under ignored `.wrangler/staging-backups/pre-prod-readiness-2026-09-29.sql` with owner-only permissions. Import into a separate local SQLite file passed `PRAGMA integrity_check` and returned no foreign-key violations. The copy has 15 migrations, 31 tables, and zero unsettled Compute payments. This is a verified snapshot, not an application cutover or in-flight payment restore drill.
- Public health passed after staging deployment; no production Worker was changed.

## Hosted game and payment results

- The first three-player gameplay run reached the old parts-market assertion and failed because the product now deliberately closes that market. The harness was updated to assert that old listing/purchase calls return 403 and leave balances and inventory unchanged. The [rerun](2026-09-29-staging-gameplay.json) passed three players × three repairs, exact-once finite-batch collection, visitor privacy, closed parts-market behavior, dropped-socket recovery, fresh signed-login persistence, and cleanup.
- The first checkout run correctly refused a generated seller holding only five test tokens under the new 1,000-token seller rule. The fixture now checks the devnet genesis, exact generated mint, token program, six decimals, generated mint authority and payer before minting only the deficit to the generated seller. It never imports a browser or owner wallet. The [rerun](2026-09-29-staging-checkout.json) passed: one valueless devnet test token transferred, 250 Compute delivered once, duplicate delivery prevented, and generated sessions logged out.
- A [six-minute returning-cohort room trial](2026-09-29-staging-five-returning.json) passed on the current staging game Worker: five generated returning players in one neighborhood, five planned renewals, zero unexpected interruptions, 561 ms maximum renewal recovery and sampled peer gap, no unresolved peer gap, 11,409/11,420 accepted moves, exact durable final positions, and no cleanup errors. This is one-location synthetic movement/profile traffic with no rendered devices, jobs, trades or cost measurement.

## Still required before a technical beta release

1. Complete and record a sustained near-50-player mixed workload on the current build, including room renewals, ordinary jobs/trades, peer visibility, final saves and actual Cloudflare usage. A five-player renewal run alone cannot certify the 50-player cap.
2. Have humans use Phantom, Solflare, Backpack and Jupiter on desktop and mobile against staging. Verify the new progression, trade eligibility, error messages, and full gameplay loop without coaching.
3. Run hosted RPC/Worker interruption and isolated restore/cutover/rollback drills with an unsettled test checkout; prove alerts reach an operator. A readable backup and local payment tests are narrower evidence.
4. Review economy and multiple-wallet abuse at realistic volume, then review the final production gameplay candidate. Mainnet mint, real-fund checkout, key custody, independent security and legal review are separate launch gates. Do not promote the devnet fixture or its keys to production.
