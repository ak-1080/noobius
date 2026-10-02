# Recovery and player support

This is a runbook, not authority to restore a live database or deploy production. Use the exact target environment, database and compatible revision. Keep raw exports, restore bookmarks, player identifiers, cookies, signatures and Cloudflare logs in ignored private storage.

## Freeze before a restore

An admission pause alone does not stop existing players from writing saves. Set `NOOBIUS_MAINTENANCE=true` on **both the game Worker and payment-recovery Worker**, and wait for older in-flight invocations to drain before taking the snapshot or replacing data. The new game API rejects requests before housekeeping, rate-limit or checkpoint writes; the room-service ingress is fenced too. The scheduled recovery Worker exits without reading or settling payments. Health intentionally returns uncached HTTP 503 with `status: maintenance` and `Retry-After: 60`. Verify those signals on the intended environment. An already-running pre-maintenance invocation can still finish; the flag is not a distributed drain acknowledgment.

Record active game/room/recovery versions, migration count, a private D1 Time Travel bookmark and a private database export. Identify every pending and recently finalized payment. Disable new trade and admission during the recovery window. Do not delete quotes or release ambiguous reservations to make the queue look clean.

## Restore, reconcile, reopen

1. Reproduce the problem and rehearse the proposed compatible source/database recovery in a disposable environment. `npm run test:recovery-drill -- --rollback-ref <compatible-commit>` restores generated saves, reconciles a controlled finalized receipt once, runs the earlier source against the restored schema, saves a new change and returns to current source. It never broadcasts a transaction or restores hosted data.
2. Obtain an incident-specific decision before overwriting a live database. D1 Time Travel restore cancels queries and replaces current contents. Retain the pre-restore bookmark for recovery if the chosen point is wrong. A source rollback is separate from a database rollback.
3. Restore only after writes are drained. Check migrations, SQLite integrity/foreign keys, representative balances, inventory, skills, allowances, unfinished jobs, sessions and escrow. The October 2 private staging export imported successfully into isolated memory with all 15 migrations and no integrity or foreign-key error. That import is not a hosted restore.
4. Reconcile every payment newer than the restored snapshot against the exact persisted buyer quote, original transaction and finalized chain receipt. A database restore cannot undo a Solana payment. Never ask a buyer to pay again because a restored row is missing. Never construct a replacement transfer, infer payment from a balance, or release an ambiguous escrow. If newer receipts/quotes cannot be recovered, keep trading paused and investigate.
5. With admission and new trading still paused, clear maintenance on the recovery Worker for controlled reconciliation. Confirm repeated recovery cannot deliver Compute twice. Then restore the game write path, verify saved player progress and exact offers, and only reopen the controls approved for that environment. Restore the correct signer/network policy too. Inspect room leases after reconnect; stale checkpoints must not overwrite newer saves.

The synthetic drill supplies controlled chain evidence. It does not certify every possible historical snapshot against live Solana finality, a hosted cutover, or zero-downtime restoration.

## Support and moderation

For a failed purchase, record environment, approximate UTC time and the game's checkout/offer ID privately. The operator checks the saved quote and recovery status. Distinguish awaiting approval, recorded/submitted, settled, expired and failed. Never request seed phrases, private keys or RPC API keys. If settlement is ambiguous, preserve the reservation and escalate; do not manually credit both sides or instruct another payment.

For lost progress, first verify the same public Solana address, environment and confirmed save. Staging and production have separate saves. A disconnected room is not evidence that the durable save was deleted. Guest saves are browser-local and do not recover on another device. Preserve evidence before any correction; a blanket restore can undo unrelated players' later work.

The `/moderation` queue requires a server-configured `NOOBIUS_MODERATOR_WALLETS` account and signed session. Ordinary players cannot grant themselves reviewer access. Review notes and decisions are retained; a concurrent/replayed decision is rejected. Removing a reported message removes that message, not the player's account. The isolated integration suite tests access, races and replay behavior. No human reviewer access was added by this task. Account bans/mutes, appeals, retention policy, staffed coverage and a public support destination still need explicit operating decisions and implementation where applicable. This queue alone is not full live-service moderation.

## Alert delivery and ownership

Both owner-paused Codex automations remain paused. Do not use them as continuous uptime monitoring. Existing GitHub health probes and budget alerts are separate signals. On-call coverage and confirmed recipient delivery are not established by a passing HTTP request.

The current OAuth login received HTTP 403/code 10000 from Cloudflare notification policies. An account operator must inspect the actual configured recipients and perform a deliberately identified test notification, then confirm receipt. Do not invent an email address, send messages without authorization, or claim delivery from policy existence. Until then, alert delivery remains an open release gate. Cover database-backed health, room failures, stalled payment reconciliation and usage limits; a budget alert is not a spending cap.

Primary references: [D1 Time Travel behavior](https://developers.cloudflare.com/d1/reference/time-travel/) and [Cloudflare Notifications setup and permissions](https://developers.cloudflare.com/notifications/get-started/).
