# Remaining implementation checkpoints

September 9, 2026. Read-only specialist reviews informed these next steps. Nothing in this file claims deployment or changes the accepted Neighborhoods scope.

## Multiplayer transport

Five-slot admission, controller generations, 45-second membership leases, scene/proximity checks and durable projects already exist. The missing Stage A milestone is a deployed authoritative WebSocket coordinator. Current movement POSTs every 1.5 seconds and writes positions to D1.

Use one NeighborhoodRoom Durable Object per neighborhood. Keep permanent saves and economic settlement in the existing D1 authority. Authenticated admission issues a short-lived single-use ticket bound to player, room, realm, controller generation and expiry. The coordinator validates movement intentions, filters broadcasts by scene and enforces one controller and five occupants including visitors inside centers. Durable reconnect reservations must survive coordinator restarts; socket attachments alone cannot preserve disconnected occupants. Fence reward-affecting commands and keep unique durable intent IDs so retries cannot duplicate settlement.

Installed Vinext and Cloudflare tooling support a custom Worker entry and Durable Objects. The generated deployment currently contains no namespace, service binding or DO migration. Managed Sites provisioning of the namespace and its private proxy's WebSocket upgrade behavior remain unproven. Do not mistake local support for deployed support, or invent unsupported hosting manifest fields. A separate coordinator would require an owner-controlled host, endpoint, service authentication and operating budget; managed Sites ownership alone does not grant its underlying Cloudflare account credentials.

Smallest decisive proof: six simultaneous joins yield five occupants; tab takeover fences the old controller; entering an interior retains a slot; movement reaches peers; impossible movement and remote work fail; reconnect restores membership; restart around a committed action yields the same receipt once. Run through actual deployed staging, not only localhost. Cloudflare references: [WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [class migrations](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/), [service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/).

Follow-up evidence: the managed proof deployed, but reported no room binding and returned HTTP 500 for the raw authenticated socket upgrade. Normal HTTP worked. The probe was subsequently removed; [full evidence](transport-hosting-proof.md) and isolated reproduction are retained. An account/host connection question is pending. Do not repeat the same namespace experiment without a changed provisioning mechanism.

Authorization audit: `crew_presence` is checked inside facility, shared work, projects, chat and targeted-trade writes. Generations are random identifiers, not monotonic counters. `syncNow()` currently gates physical commands; a future socket barrier must await an authoritative durable checkpoint, or commands must be routed through one fenced coordinator. Facility travel writes a new position/sequence directly and must be reconciled before subsequent movement. Never broadcast whole personalized snapshots: membership credentials, claimed/pending/mine fields and private center details are recipient-specific. Earned project/crew claims and escrow cancellations must remain available after leaving a room.

## Recurring uses for neglected materials

Implemented in the recurring-materials increment; see [behavior and verification](recurring-materials-upgrade.md). Live balance and return-session validation remain required:

- New cooling-call terms consume one pump and pay 135 Compute. The NPC-replacement margin remains 44 under the reviewed costs.
- New field-stock terms replace the repair kit with a pump, keep the board and power cell, and pay 380 Compute, preserving the reviewed 135 replacement margin.
- Optional recovered-board fabrication consumes four scrap, two fiber and one core at the existing eight seconds per board. Keep ordinary boards unchanged. Require Core room and Engineering 2. The route costs 44 plus the player's core acquisition cost; versus 77 for the normal route its break-even is 33 per core. This creates a sourcing choice without making the bench faster.
- Keep core player-sourced; do not introduce a finished-equipment NPC bypass or resale-profit loop. Verify quiet-market self-sourcing and renewable demand.

Preserve old accepted and unaccepted quotes with a separate termsVersion on offers/runs; missing means original terms. New refills get new terms. Do not repurpose quoteVersion, which already controls idle reimbursement and batch accounting. Preserve template IDs, earned mastery and discoveries. An explicit dispatch replacement chooses new terms; cancel/reload must not rewrite an old offer. Optional craft variants must be server-whitelisted with frozen costs/output/time; missing variant retains ordinary crafting.

Preserve the bench constraint: the reviewed maxed Fast training batch consumed 30 boards per 168 seconds while ordinary fabrication made about 21; Stable consumed 24 per 240 seconds while the bench made 30. A faster alternate recipe would erase that choice. Nominal replacement margins do not prove currency neutrality when players self-gather; measure actual sources/sinks and return-session choices.

Implementation review found two UI traps to cover: JobsPanel must resolve saved terms for “Keep this offer” instead of substituting an identically named current-catalog option; and recovered-board ingredient help must retain the explicit recipe variant when nested under a client job's parts plan. Carry the variant through the per-wallet draft, GuideView and objective recipe resolution while preserving the parent job. Do not add a duplicate `board` recipe ID or change the output to a nonexistent item ID. Saved offer/run pairs must have equal normalized terms versions; unknown versions must fail validation. Recovered crafting needs a single server-side whitelist and a preserved ordinary path for old pending batches. No D1 schema migration is needed for these facility JSON fields.

## Acceptance still required

Independent human first-session and return-session playtests, real extension/mobile acceptance, hosted load/cost measurement, monitoring and alert owners, staffed moderation, hosted backup/restore, compatible rollback and dependency remediation remain open. Exact token chain/address/decimals/finality policy is required before holder access becomes real. No funded payout or NBIS integration is implied by repeatable play.
