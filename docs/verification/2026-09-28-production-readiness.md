# Production-readiness engineering audit — September 28, 2026

The owner requested a code-level review and implementation toward a complete connected Noobius game. Kintara is a gameplay reference, not a measurable certification standard. The work below strengthens existing systems; it does not establish a fully ready real-money P2E release.

## Fixed in this candidate

- **Submitted checkout recovery:** a submitted transaction with missing receipt history could leave Compute reserved indefinitely. Recovery now attempts a bounded proof of non-execution using every finalized block signature in the transaction's lifetime. It anchors the chain to the exact quoted blockhash and verifies parent links and consecutive block heights. A missing receipt alone never releases a paid offer.
- **Concurrent checkout recovery:** an earlier buyer-only expiry observation could race with another request that durably authorizes the payment. Releasing that reservation now requires the database record to remain buyer-only at the exact update. Interleaving regressions verify that an authorized transaction retains its reservation and later delivers Compute once.
- **Stationary-player presence:** a live, stationary WebSocket player could be shown as briefly away because the UI used only the last movement timestamp. Presence now also checks the authenticated current controller's matching, unexpired writer grant and session. It does not turn connection upkeep into a movement/work receipt. Tests cover stale controller, scene, neighborhood, generation and revoked sessions.
- **Plain neighborhood invitations:** `commons:<code>` is a syntactically valid custom-scheme URL. Parsing it as a web link discarded its neighborhood identifier. The picker now recognizes valid plain codes first and rejects malformed or ambiguous links before issuing a travel command. Server admission and realm gates still apply.
- **Production release order:** production destination, account, D1, service bindings, network, safety flags and capacity are checked before work starts and after the build. Rule, type and isolated API tests run before a production migration. An unreadable or nonempty unsettled-payment ledger aborts before the first production mutation. The current path keeps token payments disabled and cannot raise the 50-player ceiling. Route overrides, alternate game environments and external room-class bindings are refused, preserving the separately managed game/room domains and coming-soon site.
- **Repeatable integration testing:** a new clean-clone runner creates an isolated fourteen-migration D1 database plus authenticated game and room servers. It excludes hosted credentials, intercepts only the explicitly recognized local fixture commands, and removes generated secrets/processes at exit. GitHub Actions now runs this integration job without deployment credentials. The old batch fixture was updated to current production rules and demand limits.

## Verification

- **522 rule and persistence tests passed**, with no skipped tests. TypeScript and the production Cloudflare build passed. Existing repository-wide lint findings are not represented as a clean lint result.
- [Isolated HTTP/D1/WebSocket report](2026-09-28-release-api.json) records **27 passing assertions across twelve suites**, including a full five-minute grant renewal. This combines selected runs: the initial eight-suite run passed its assertions but failed during macOS process cleanup; corrected cleanup passed later runs. A local D1 `SQLITE_BUSY` failure also occurred once and did not recur in two fresh facility runs. No API replay was added to mask it. The final QA CSS configuration excludes changing scratch logs from source scanning. GitHub CI must still establish a complete twelve-suite run and successful cleanup on the exact commit. Local tests are not hosted load tests.
- [Read-only Helius provider check](2026-09-28-payment-history-provider.json) passed against devnet: a synthetic, absent signature was classified expired only after the new finalized-history proof. No transaction was signed or submitted, and no game ledger or user wallet was involved. This check originated locally; the Cloudflare-origin probe remains a separate deployment prerequisite.
- Two independently rendered browser clients signed in with newly generated Solana test identities. Both showed `Connected · 2 here` in the same plaza, with actual peer avatars and walking. A visitor entered the other player's center while only the owner retained machine controls. The owner's free starter machine survived a full reload without a save button. The screenshot is an actual local network session at ignored `outputs/multiplayer/live-plaza-acceptance.png`, not the earlier single-client demonstration fixture.
- A full reload temporarily presented the existing `Continue here` controller safeguard because the new document receives a new client identifier while the previous membership lease is live. Resuming retained the saved machine. Improving this wording/flow without weakening concurrent-tab authority remains a small UX follow-up.
- A fresh private staging SQL export restored into a new local SQLite file with **14 migrations, 30 tables, valid integrity and zero foreign-key violations**. [Restore report](2026-09-28-staging-local-restore.json). The snapshot had zero unsettled payments; it does not test in-flight chain reconciliation, hosted failover or application cutover. The live production database was untouched.
- Two separate file-backup/reopen regressions cover pending buyer-recorded and authorized-submitted checkouts. A later exact signed receipt delivers 250 Compute once under concurrent/repeated recovery, with the seller's escrow intact and no authorization key supplied to the restored process. These use controlled RPC evidence, not live chain failover. The snapshot must retain the original quote and signature; recovery of payments missing entirely from an older backup is not established.
- **Guarded staging release passed:** game Worker `645596f5-7600-48b8-92e4-3346d318d13f`, recovery Worker `c1995b7a-7fff-4d62-b9c7-13304d3b9522`. Deployment rechecked the actual Cloudflare-origin RPC, devnet mint/finalized proof, empty payment ledger and current migrations. Production and the room Worker were not replaced.
- [Hosted normal-action acceptance](2026-09-28-readiness-staging-gameplay.json) passed in 195.5 seconds with three generated players: nine repairs, delayed work receipts, one finite batch, visitor privacy, competing item buyers, persistent client/earning limits, dropped-socket recovery and fresh-login saves. All memberships/sessions cleaned up. This is not a capacity test.
- [Hosted generated-account devnet checkout](2026-09-28-staging-checkout.json) transferred one valueless test token and delivered 250 Compute exactly once. The rerunnable checkout fixture retains earlier completed receipts and refuses to reset either test account with an unsettled obligation. It does not validate browser extensions or ordinary earning; those have separate checks.

## Payment proof limits and operation

The exceptional non-execution scan is capped at 192 historical blocks, sequential batches of at most 16 `getBlock` operations and an eight-second proof deadline. It begins near the quote's historical context, so a days-long outage does not require scanning from the current chain tip. Attempts for the same signature are backed off for one minute inside each Worker isolate; isolate restart may cause another bounded attempt. Batching reduces HTTP calls, not RPC-provider billing operations. The successful provider probe used 201 RPC operations overall, including its setup reads.

The provider must retain the needed finalized blocks and signatures. Missing, pruned, malformed, unanchored or incomplete history, a deadline, or the payment's presence in any block leaves the reservation pending. A fallback endpoint is genesis-checked. Preserve the original quote, signature, RPC and authorization configuration; do not issue a replacement transfer or refund Compute on an ambiguous response. Operators still need a reviewed support path for reservations whose historical proof cannot be obtained. This is a proof under the trusted configured RPC's responses, not independent consensus verification.

Primary protocol references: [Solana getBlock](https://solana.com/docs/rpc/http/getblock), [getBlocksWithLimit](https://solana.com/docs/rpc/http/getblockswithlimit), and [transaction expiration and confirmation](https://solana.com/developers/guides/advanced/confirmation).

## Required before declaring the technical beta complete

1. **Hosted failure-path acceptance:** ordinary gameplay, item races, saves and generated-account devnet checkout passed on this candidate. Still exercise interrupted token checkout/recovery, provider outage and new-build human wallet approval on staging. GitHub merging alone does not update staging or production.
2. **Sustained multiplayer:** classify and resolve the historical near-50-player mixed-workload failure, repeat beyond the full renewal interval with jobs and trades, and record cost and recovery/peer-gap thresholds. A two-browser meetup or isolated five-minute check does not prove 50 concurrent players, much less thousands. Each current neighborhood has five total places; larger shared hubs require deliberate architecture work.
3. **Wallet/device acceptance:** test Phantom, Solflare, Backpack and Jupiter on real desktop/mobile devices. Generated signatures and the earlier human Phantom sale do not validate all four current adapters.
4. **Recovery and release:** perform an isolated restore of the latest schema, including in-flight payment reconciliation, application cutover and a compatible rollback/forward recovery. Existing older export/import drills did not test all these cases. Confirm alert delivery, incident ownership and moderation operation.
5. **Production gameplay review:** review the changed active earning loop and realm/interface pass before the separate production promotion. Production currently remains on the older passive machine loop; latest gameplay/caps/wallet policy are on isolated staging.

## Separate mainnet release gates

There is no production NOOBIUS mint configured. Mainnet token policy, mint/program/extension checks, actual provider capacity, secure authorization-key operation and retention, real-value payment acceptance and independent security review remain separate requirements. Browser-linked daily earning limits constrain repeated extraction; they do not identify a unique human or stop every new-wallet/VPN/bot strategy. Long-term economy balance and upgraded-player playtests also remain open. Keep production token checkout disabled.

## Reproduce on another computer

```sh
npm ci
npm test
npm run typecheck
npm run test:release-api
npm run build:cloudflare
```

Use Node 24 (`.nvmrc`); the supported minimum is Node 22.18. The isolated integration command needs no hosted secrets or existing local save. Individual legacy API commands assume their documented local fixture setup and must never target production. Read `PROJECT_HANDOFF.md` before deployment, and retain ignored backups/secrets on authorized machines only.
