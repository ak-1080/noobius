# Character-first onboarding

## Delivered behavior
- First playable entry requires username before appearance selection.
- Large live Three.js character preview uses the exact same avatar builder as the game.
- Starter shirts and cap preview immediately and save before the first mission.
- Pointer dragging turns the preview; reduced-motion preference stops idle sway.
- Setup background is inert so keyboard focus cannot reach covered game controls.
- Three original game-prop images explain parts → kit → powered rack. Briefings reuse these visuals with short actionable instructions.
- Completing setup saves a per-player marker and guides the character directly to Margo.
- Regular locker supports outfit/accessory previews with explicit Save look. Unowned cosmetics remain price/reward gated.

## Evidence
- Browser walkthrough at 390×844: username Coral Crew → coral shirt and cap → pictured mission → Margo. All three choices appeared in the regular locker afterward.
- Desktop locker: free Cloud blue selection saved, retained the cap, changed ownership status, and showed success. A paid outfit preview required 180 more Compute; earned gold remained gated.
- Desktop and mobile render inspections completed; no browser console errors.
- 31 unit tests pass, including starter appearance, serialization and earned-cosmetic gates.
- Authenticated API test passes: name, shirt, cap and setup marker persist through a fresh wallet login.
- Typecheck and production build pass. Existing large-chunk warning remains.

## Scope
Guest practice is still temporary. Saved wallet profiles retain setup and appearance. This change does not activate token payouts or change public launch readiness.
