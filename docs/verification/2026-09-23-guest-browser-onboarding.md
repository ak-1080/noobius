# Hosted guest onboarding check — 23 September 2026

Target: `https://play.noobius.io/`, ordinary Chrome browser UI. This is a manual browser check, not an API fixture or a real-wallet test.

- Loaded the landing page and opened the Solana wallet picker. The earlier open tab initially retained an old JavaScript bundle; a reload loaded the current Solana-only picker.
- This browser exposed no compatible Solana provider. Selecting Phantom opened the install/mobile-browser explanation. The picker now labels absent options **Get wallet** and detected options **Installed** before the player selects one. Verified on the deployed game Worker version `46933a5d-5c52-48c7-9703-de4696f0b1b4`.
- Started a fresh device-only guest, entered a name, saw the live character preview and appearance choices, and completed all five onboarding slides.
- Followed the first guided route to Margo's free starter machine. The route moved Noobius to the station and opened the build panel; building it changed production from zero to 24 Compute/minute.
- Opened Jobs from the machine, accepted a repair offer, used **Find missing parts**, arrived at scrap, and used the displayed E-key interaction. The UI added 5 Scrap and advanced the guide to the accepted job.
- Reloaded the site. **Continue guest game** appeared; resuming showed a return briefing with the accepted job, stored machine output and a Collect action. This verifies the tested guest save in this browser, not cross-device or wallet-backed persistence.

Still unverified here: actual Phantom/Solflare signing, physical-phone wallet handoff, simultaneous rendered multiplayer, endgame usability and real-token checkout. No wallet signature or blockchain transaction was approved in this check.
