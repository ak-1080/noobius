# Readiness follow-up — September 28, 2026

This continues the [production-readiness audit](2026-09-28-production-readiness.md). It fixes a real hosted unattended-payment failure and makes returning-player capacity tests repeatable. It does not certify a Kintara-equivalent or real-value P2E launch.

## Hosted failure found and repaired

A generated staging buyer submitted one devnet test-token purchase, logged out and closed the test process. The transaction finalized successfully on Solana, but twelve recovery ticks left its game record submitted. Native Workers `fetch` was stored on the RPC object and invoked with that object as its receiver. Actual workerd reproduced `Illegal invocation` before a request could leave the Worker; the game's fetch wrapper had concealed the difference.

The RPC now binds its transport to `globalThis`, covering ordinary RPC requests and signature-history batches. Network, finality, exact-message verification and ledger settlement rules did not loosen. The isolated recovery Worker was repaired with its original token policy, D1 and existing secrets; no migration, game/room deployment, replacement payment or real funds were involved in that repair.

The next scheduled tick settled the original checkout at **23:02:21.713 UTC**, after client departure at **22:46:28.301 UTC**, and before any buyer status request. A separate verifier confirmed one test token transferred, 250 Compute delivered, fresh-login persistence and no duplicate delivery from repeated receipt checks. The initial failure is retained in the [redacted hosted evidence](2026-09-28-detached-checkout-recovery.json). This proves unattended settlement after client departure and the repair; it does not inject a hosted provider outage or Worker crash.

## Additional implementation

- **Signing keys are loaded only when needed for an existing checkout.** Recovery validates the original network/mint/program/precision and observes trusted chain evidence first. A finalized or fully authorized payment can settle or rebroadcast its exact durable bytes without parsing a malformed retired-key map. A pending buyer-only approval still requires its matching signing key; unavailable keys cannot authorize a payment or release its reservation. New offers and quotes retain strict key validation.
- **Actionable recovery errors.** Scheduled logs contain bounded stage/category counts, never exception objects, keys, RPC URLs or transaction bytes. A tick with counted errors now fails explicitly, so invocation-success metrics cannot silently conceal those errors. Configuring and verifying actual alert delivery is still required.
- **Saved QA cohorts.** The staging-only harness can save newly generated test identities privately and reuse their exact enrolled saves. Ordinary signup limits remain. Returning sign-in is opt-in, fully signed and tied to the matching saved public ID and existing earning enrollment; it cannot recreate a deleted save or change the original earning pool. Old Workers are rejected by a health capability check before authentication.
- **Correlated room evidence.** Safe numeric-actor transport events share a clock with observer roster-gap events. Observer measurements freeze before intentional teardown, preventing cleanup from inflating reported disappearance durations. No wallet, ticket, session, raw frame or RPC credential enters the timeline.
- **Schema health.** Health requires all fourteen migrations, including the current earning guard, before advertising returning sign-in. The isolated integration runner now records normal Wrangler migration metadata alongside its consolidated schema. An HTTP regression checks healthy → missing migration → unavailable → restored healthy.

See [capacity cohort operations](../capacity-cohort-operations.md) for commands, private-file handling and provisioning limits. A complete larger cohort must be provisioned gradually within normal rolling-day limits; the new tool is not a signup exemption or a claim of near-50-player capacity.

## Repeatable acceptance

- The real standalone Wrangler bundle runs its scheduled handler under workerd with local D1 and all outbound networking blocked. Generated-key fixtures cover exact-once finalized delivery without a signer, durable authorization before original-message broadcast, later finality, and bounded signature-history expiry without credit delivery.
- Controlled RPC outage and ambiguous-broadcast tests retain the buyer's recorded intent and seller's reservation, then settle the original transfer once after recovery. These are controlled local failures, separate from the hosted detached-client trial.
- Returning-auth/cohort tests cover wrong or deleted saves, missing earning enrollment, partial files, locks, malformed paths/keys, duplicate records, older-server capability checks and normal authentication throttles.
- The isolated HTTP earning suite checks actual signed returning login and current migration health against the Worker and fourteen-migration database. An initial health regression exposed missing migration metadata in the old local runner; that fixture mismatch was corrected and the fresh eight-test run passed. Neither API failures nor fixture startup errors were hidden with retries.

Run `npm test`, `npm run typecheck` and `npm run test:release-api`. Use Node 24.14 or newer for the isolated API runner. The native scheduled-runtime tests are part of `npm test`; no hosted credentials or funded wallets are required.

## Still required before release

1. Sustained near-capacity mixed gameplay with current code, correlated renewal/recovery traces and measured provider/Cloudflare cost. A smaller renewal trial does not establish fifty players or thousands.
2. Real desktop/mobile approval across Phantom, Solflare, Backpack and Jupiter, plus uncoached new-player and upgraded-player playtests.
3. Hosted provider/crash failure drills, in-flight application restore/cutover, compatible rollback/forward recovery, tested operational alerts and incident ownership.
4. Owner review and a separate production gameplay promotion. A GitHub main update does not deploy `play.noobius.io`; its older passive loop and disabled real-token trading remain separate from staging.
5. Mainnet mint/provider/key operation, real-value payment review and sustainable economy validation before any P2E launch. Browser-linked allowances bound simple extraction; they do not prove one unique human or eliminate scripts/new-wallet/VPN abuse.
