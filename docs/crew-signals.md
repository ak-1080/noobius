# Crew on the floor

The compact crew control opens without leaving the game. It shows up to five reserved neighborhood places, each player's name, career level and current location. Interiors count toward the same neighborhood capacity; temporarily absent players are identified as reconnecting. Guests get a clear route to connect, and a quiet neighborhood points players toward their own work or finding a friend.

Four existing presets — hello, meet at Margo, spare parts and thanks — now appear in the crew control and above a currently visible sender. Project and parts requests offer explicit navigation to their existing panels. The wave animation is brief and respects reduced motion. Signals neither move a player nor perform work, spend currency or award rewards.

## Delivery and authority

Signals ride the existing authenticated neighborhood metadata response. No extra fast chat poll or new socket authority is introduced. A successful local send requests one additional metadata refresh for feedback. Ordinary socket metadata can take about six seconds, so these are lightweight crew signals rather than instantaneous chat.

`sendCrewMessage` validates the preset, wallet/controller/scene, realm write permission and existing five-second cooldown. Nullable `ping` and `signal_scene` columns in migration `0011_curly_chameleon` distinguish explicit presets from ordinary chat. The server records the actual send scene. Existing chat and reports continue using the same message ID. Historical chat receives null metadata and cannot become an emote.

The bounded metadata query returns only the last 20 seconds, at most 20 messages, with viewer mute and bidirectional block filtering. The client shows one newest signal per author and at most five. Fixed expiry accounts conservatively for request time, so repeated or delayed packets cannot extend it. Scope changes and foreground return establish a fresh baseline. A local moderation change hides presentation until a metadata request begun after that change completes. Removed or suppressed IDs remain consumed until expiry.

## Verification

- Default suite: 314 tests, including nine server/model/migration cases and two hook lifecycle cases.
- Separate isolated real-API test: three generated authenticated clients; room isolation, preset/controller/account rejection, spam limit, recorded scene after travel, mute/unmute and reverse block. Run with `NOOBIUS_TEST_ORIGIN=http://127.0.0.1:3003 npm run test:crew-signals-api` against the isolated QA database, with canonical migrations through 0011. The test refuses the ordinary player database.
- Browser check: existing guest save retained 20,267 spendable and 206,640 stored Compute; opened the crew control without spending or collecting. A temporary component fixture showed the five-place roster, distinct locations and a signal above the sender. The fixture and temporary QA configuration were removed before building.
- Type checking, production build and focused lint of the new signal/widget/test files pass. Repository-wide lint still has existing unrelated findings; this is not an all-lint-clean claim.

This verifies the bounded feature, not five independent rendered multiplayer clients, real devices or player retention. Hosted coordinator activation and the broader neighborhoods completion gates remain open.
