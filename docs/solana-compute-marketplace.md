# Compute marketplace: Solana settlement protocol

This records the implemented server protocol and remaining launch checks. Token checkout is not live. Players buy each other's earned Compute with a chosen SPL mint. No guaranteed redemption, new Compute token, deposited wallet balance or custom DEX is required.

## The reservation problem

A simple expiring listing plus an unsigned direct-transfer transaction is insufficient: a buyer could broadcast after the app thinks checkout was abandoned. Releasing the seller's Compute on a timer could leave a paid buyer without goods. The backend must know the exact possible transaction before it becomes broadcastable.

Use a standard SPL transfer transaction with an additional signed Memo instruction. The Memo requires the buyer and a dedicated application authorization signer. The buyer signs first. The server checks that the transaction message exactly matches its durable quote, validates the buyer's signature, durably saves the buyer transaction/signature and submission intent, then adds the application signature. Only after persistence may the complete transaction leave the server. A buyer cannot independently broadcast the original incomplete quote without the application signature. This signer holds no player tokens and grants no spending authority: the buyer still signs the exact transfer amounts, asset, destinations, blockhash and memo. Compromise still permits unwanted authorization, so store/rotate it as a production secret and never expose it to client code.

References: [Solana Memo signer checks](https://www.solana-program.com/docs/memo), [transaction signatures and atomic instructions](https://solana.com/docs/core/transactions).

## Required state transitions

- Seller lists a bounded integer amount of earned, server-authoritative Compute at a token-denominated price. Atomically debit available Compute into a dedicated reservation ledger with an immutable listing ID and request receipt. Guest/local saves cannot enter this ledger.
- One buyer reserves an open listing. Bind exact buyer/seller wallet, mint, network genesis, decimals, amount, fee split, authorization signer, recent blockhash, last-valid block height and exact serialized message to a durable quote. Repeated calls return the same quote. Self-trades, wrong ecosystem and simultaneous buyers are rejected.
- Buyer reviews the quote and signs through `solana:signTransaction`. A login signature is never a payment approval. Unsupported signing capabilities get an explicit error, not a fallback that changes settlement semantics.
- On signed submission, verify byte-for-byte message identity, all required buyer signatures, zero unexpected signers/instructions and the immutable quote identity. Persist the exact buyer signature/submission intent **before** adding the app signature or broadcasting.
- Retry only the identical serialized transaction. Never refresh its blockhash or issue a new payment while a prior signature may settle. Different signatures or messages for a reserved quote are conflicts.
- On trusted RPC finalized success, verify the exact on-chain transaction, mint/amount/participants and recorded signature. Atomically consume the seller reservation, credit the buyer exactly once and write a settlement receipt. Concurrent retries must converge.
- An unsubmitted quote may expire safely only if no server authorization was issued. Submitted/uncertain payments retain the reservation. On a finalized failure, or verified expiry beyond the recorded last-valid block height with the known signature unlanded, release through a deduplicated recovery transition. RPC outages or ambiguous results never trigger release by wall-clock alone.
- Reconcile pending submissions independently of the buyer's browser. Before any database restore, freeze settlement and reconcile against Solana; database time travel does not unwind token transfers.

## Initial bounds

Use the original SPL Token Program for the first payment release; reject unsupported Token-2022 transfer fees/hooks rather than assuming the buyer's debit equals the seller's receipt. The holder verifier can recognize Token-2022 holdings independently. Quote fixed token amounts rather than an unverified USD oracle. No platform fee until a real treasury destination and fee policy are configured. Buyer pays visible SOL network/rent costs. Limit open listings, pending quotes per wallet, amount per trade and submission retries.

## Acceptance evidence still needed

Two wallet buyers racing for one listing; insufficient balance; wrong mint/network/recipient/decimals; altered memo/amount/instructions; invalid or replayed signatures; quote expiry before signing; crash before/after saving submission intent; ambiguous broadcast result; retry after successful payment; receipt delivery failure; cancellation racing checkout; RPC unavailable; frontend reload during pending payment; finalized failed payment; recovery job retries; old configuration/key rotation; restore reconciliation. Exercise actual test-token transactions and real wallet UI before enabling mainnet.

## Implementation checkpoint — September 22, 2026

Implemented server modules: `compute-market.ts` (transactional reservation/delivery), `solana-payment.ts` (exact transaction and signature verification), `compute-payment-rpc.ts` (configured-network RPC boundary), `compute-payment-recovery.ts` (retry/reconciliation), and `compute-market-api.ts` (wallet-scoped handlers and configuration). Migration 0012 adds only two empty payment tables; existing game data is retained.

Authenticated POST actions under `/api/noobius/`: `compute-listing-create`, `compute-listing-cancel`, `compute-payment-quote`, `compute-payment-submit`, and `compute-payment-status`. They use the existing session, same-origin, expected-wallet and request-size checks, plus wallet rate limits. GET `compute-market` returns availability, bounded listings and the connected buyer's pending receipts. Signing keys, RPC credentials and complete authorized transactions are not returned. New listings/quotes require trading qualification and `NOOBIUS_PAYMENTS_ENABLED=true`; cancellations and pending recovery remain available during a trading pause.

The separate `noobius-payment-recovery` Worker runs every minute and processes at most ten due payments, rotating failures rather than starving later records. Provision the same exact network/mint/precision, RPC configuration and `NOOBIUS_PAYMENT_KEYS` secret on the game and recovery services. Keys are a JSON map of public signer addresses to base64 64-byte keypairs; `NOOBIUS_PAYMENT_SIGNER` chooses the active key for new quotes. Old signer entries must remain until pending payments settle. **Do not change network/mint/decimals with pending payments:** cross-asset policy recovery is not implemented; the service deliberately retains those reservations rather than guessing a replacement asset.

Expired signed payments are released only after a trusted configured RPC proves finalized block height beyond the stored lifetime, invalid blockhash, retained ledger covering the quote slot, and absent historical signature at a non-stale context. Any known signature stays reserved until its exact finalized transaction can be verified. Pruned history, RPC failure or uncertainty retains the reservation. Successful chain execution and SQL delivery are not a single distributed transaction: the durable signature and idempotent recovery bridge that gap.

Automated tests exercise competing buyers, concurrent retries, insufficient Compute, altered signatures/messages, wrong network/mint, cancellation, signed/unsigned expiration, database failures before authorization and during delivery, ambiguous send responses, exact rebroadcast, finalized failure, and recovery after browser departure. These use real SQLite transactions and cryptographic signing with controlled RPC responses. They are not proof of real devnet transfers or browser-wallet compatibility. The wallet transaction adapter, checkout interface, actual test-token transfers, human wallet/mobile checks and restore-to-chain reconciliation drill remain required before enabling real payments.
