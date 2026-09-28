# Four approved Solana wallets — September 28, 2026

Owner policy: Phantom, Solflare, Backpack and Jupiter only.

## Changes

- A single catalog governs the four picker rows, Wallet Standard discovery, connection entry, message-signing adapter and transaction-signing adapter.
- Product names match complete names rather than arbitrary substrings. Jupiter, Jupiter Wallet and Jupiter Mobile share the Jupiter row. Product metadata is a discovery convention, not cryptographic brand attestation; server verification still proves Solana account ownership.
- No arbitrary "other installed wallets" list, EVM injected-provider discovery/helper, compatibility flags or MetaMask registration remains in the browser. Removed both MetaMask SDK dependencies and five unused non-approved wallet icons.
- Every row has a local product icon and official installation link. Jupiter's link is its [official wallet page](https://jup.ag/wallet). Its [official developer guide](https://developers.jup.ag/docs/tool-kits/wallet-kit/jupiter-wallet-extension) describes discovery through Wallet Standard and the unified adapter.
- Unsupported products fail before connection or signing. A product becoming unsupported invalidates adapter reads and account listeners; an identity/account/network change during approval prevents submission. Existing signed-message checks, exact transaction checks and server co-signing are preserved.
- Saves continue to use Solana public addresses, independently of which approved product controls the address. Changing the catalog alone deletes no player data. The owner's separate deletion targeted only three corroborated human staging test saves.
- Historical server EVM identity/signature compatibility and related regression fixtures remain. Solana signatures do not contain wallet-brand identity, so a server cannot prove or enforce the browser product name from a signature alone.

## Verification

- 501 core tests passed, including 26 wallet/checkout tests. Generated-key test adapters exercised all four allowed products, cancellation, signature/account mutation, unsupported products and direct checkout guardrails. No actual browser wallet was connected or funded.
- TypeScript and the standard build passed. Focused wallet modules/picker lint and all three tooling checks also passed. The main game hook has pre-existing React compiler/hook lint findings; a repository-wide clean lint run is not claimed.
- Human testing of each current wallet release, especially Jupiter/devnet and mobile browsers, remains an acceptance gate. Mock adapter compatibility is not evidence of a real device checkout.

## Hosted/source status

The guarded devnet staging deployment passed the RPC/mint/proof/payment-drain checks and generated-account page, database, login, persistence and market smoke. Game Worker: `ea548fe5-4af2-400d-bf20-12590a8307f9`; recovery Worker: `1e622a87-2dc3-4989-bd24-d98ee4bfeb7e`. It made no blockchain transfer.

A Chrome inspection of the actual local and hosted staging pickers showed exactly four product rows and no other-wallet section; all four hosted logo files loaded successfully. No real wallet connection or signing prompt was invoked. This is desktop presentation evidence, not real device signing acceptance.

[Pull request #5](https://github.com/ak-1080/noobius/pull/5) passed the Node 22/24 test/build checks and was merged to `ak-1080/noobius` main as `71d3b27e4f7c6a9c0ae5b44cd5f06c6fb72c1234`. Production remains unchanged; a main-branch push does not deploy it. The wallet changes do not ship the staging economy to production.

The targeted three-account cleanup was rehearsed privately on a local copy of the staging export with foreign keys enabled. Exactly three candidate saves were removed and every other player's complete save remained identical. Funding recipients corroborated both owner addresses; the settled buyer/seller pair identified the friend's account. The owner's request authorized removal of those human test accounts, not a global staging wipe.

The live cleanup then removed the three saves, two Compute offers, nine settled/expired checkout records, sessions and associated game records. A live preflight confirmed zero unsettled target payments; post-deletion queries checked all wallet-bearing tables, confirmed zero target records, the expected three-save reduction and valid foreign keys. [Redacted receipt](2026-09-28-test-account-cleanup.json). SQL and the private pre-cleanup recovery export remain ignored under `.wrangler/`. Normal recovery backups and immutable devnet history still exist; no token transfer, wallet deletion, production change or deletion of other testers occurred. A read-only public health check passed afterward.

Wrangler's file-import mode returns an import receipt rather than individual SELECT results. The first local receipt parse failed on its progress prefix; no deletion was retried. Verification used the read-only `--command` query path to obtain actual row counts and foreign-key results.
