# Shared campus alpha — September 7, 2026

This pass follows the decision to simplify toward a public release. Personal data centers retain existing progression. Three shared campus instances connect named, customized players. Visitors inspect another player's rack layout without receiving that player's inventory, balance or mutation authority. Locker shirts and accessories are cosmetic. New account and practice balances start at zero.

## Economy

Compute is now the single spendable currency. The existing players.credits SQL column is retained as its canonical balance to keep trading atomic. Existing saves are migrated lazily on the server: old credits plus old collected Compute become the new balance, with a version-guarded economyVersion marker preventing duplicate grants. Stored output stays uncollected. The facility.compute field is a projection of the canonical balance; API operations do not trust a client balance. Repairs pay 40 Compute plus 20 XP; completing all three adds 25 Compute plus 40 XP. Market listings trade existing items for Compute. The fixed-rate demo token exchange is closed; no real token payout is implemented.

## Rooms and cooperative job

Presence is scoped to campus-1/2/3 or a personal room ID, with a 30-player admission limit and ten-second presence expiry. Clients send positions and fetch snapshots every 1.5 seconds, suspend while hidden, avoid overlapping refreshes and interpolate remote avatars. This uses the current Sites/D1 hosting: it is polling, not a WebSocket server. It is suitable for evaluating the slow-paced social game, not evidence of large-scale production capacity. Joining fails visibly if a room is full.

Every ten minutes each campus offers one three-station emergency: power, cooling and network. Server-timed six-second repair leases last thirty seconds, require a recent presence near the station, and only the lease owner can finish. A completed station pays 20 Compute/10 XP once. After all three stations are complete, each contributor can claim 30 Compute/20 XP once. The database arbitrates competing repairs and claims. Position checks are not proof of human play; clients remain automatable. No token entitlement follows these rewards.

## Intentional scope

Read-only visits; no visitor spending or building, facility-help rewards, crew-owned property, PvP, resource theft or cash redemption. Shared scenes reuse the existing compact commons and supporting characters. Personal facilities retain the already-tested crafting and expansion loop. Practice remains solo and temporary; signed wallet accounts save progress.

## Verification and remaining release gates

Rules tests cover unified-balance debits, timed production, blocked token exchange, cosmetics and replay protection. API tests cover wallet isolation, concurrent market sales, batch payouts, shared room visibility, visitor data isolation, contested repair leases, premature completion, duplicate completion and duplicate bonus claims. Browser checks cover solo onboarding, the locker name form, accessory equip state, and rendering the named character with the cap.

Before public access: multi-device wallet acceptance; two-browser movement and reconnect soak; mobile touch/viewport tests for shared gameplay; hosted concurrency, latency and D1 cost measurements; monitoring, backup/restore rehearsal and moderation/support ownership. Thirty players is an admission cap, not a verified hosted performance claim. Real token settlement requires its own funded, tested deployment and actual asset/network configuration. Current site sharing remains owner-private.
