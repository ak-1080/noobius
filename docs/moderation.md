# Reviewing neighborhood reports

The `/moderation` page uses the game's existing signed wallet session. No public player rank, Operator license or token holding grants access. `NOOBIUS_MODERATOR_WALLETS` is a server-only, comma-separated allowlist of EVM addresses or `solana:<address>` account keys. Empty or malformed configuration denies every account. Solana keys retain their case; EVM addresses are normalized. No moderator is configured by this source change.

## Operator setup

1. Choose the actual reviewer and have them connect their wallet normally. Confirm its exact account and ecosystem with them. Never ask for a private key or seed phrase. The public fixture key in the local API test must never be a hosted moderator.
2. Set the allowlist through the supported hosting environment workflow. Keep it server-side and publish through the normal private release process. Removing an account from the deployed allowlist denies subsequent report reads and decisions.
3. Have the reviewer open `/moderation` on the same origin. Verify authorized access and a separate ordinary account's denial. Actual wallet/browser acceptance is still required; generated-key API tests do not substitute for it.
4. Assign report-review coverage, a user support/contact route, escalation responsibility and a retention policy before public chat opens. This software does not staff those functions or deliver report notifications.

## Review flow

Open **Needs review**, select a report, read the saved message and reason, then enter a review note. Names shown are the accounts' current names. Opaque player IDs identify the reporter and author; other users' wallet addresses, inventory and balances are not exposed by the queue.

- **Dismiss report** leaves the chat message unchanged.
- **Remove message** removes exactly that message from chat. The report retains its message snapshot, decision, note, reviewer ID and review time.

Both decisions are final in this interface. They do not ban, mute or alter the reported account, its inventory, center, listings or currency. Reports about the same message remain separate; a report may refer to a message already removed or expired. Decide each saved report on its evidence.

Reviewed reports are available under **Dismissed** and **Removed**. Pages contain at most 25 records. Two reviewers acting on one report cannot both save a decision; the losing view refreshes. A network timeout can occur after a decision commits: refresh and check history before retrying. Replays cannot remove an unrelated message or overwrite an earlier decision.

The page clears report content when hidden and revalidates on return/focus. Failed access clears loaded records. Requests have a 20-second deadline; a failed request does not silently close a report. Message and note text is rendered as text, without HTML or link expansion.

## Storage and tests

Migration `0006_handy_polaris` adds nullable review metadata and a queue index to the existing report table. It does not rewrite player or economy records. The default tests cover authorization, malformed config, case-sensitive identity, tied-timestamp pagination, privacy, decisions, races, rollback and preservation of existing records.

`tests/moderation-api.test.mjs` additionally exercises the real local Worker endpoints, session cookies, Origin, `expectedWallet`, expiry, cache headers and replay. It deliberately refuses non-loopback origins or ports other than 3002. It requires the full canonical schema in `.wrangler/qa-moderation` and a local preview explicitly configured with the test's fixture account. Never run its fixture configuration against a hosted environment.

Reports currently have no automated retention deletion, appeal/reopen workflow, global account sanctions or notification service. Public moderation readiness still depends on those operational decisions and real reviewer acceptance.
