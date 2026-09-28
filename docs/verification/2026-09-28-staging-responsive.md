# Staging responsive checks — September 28, 2026

Checked the hosted staging build `a3456c62-a1e6-4dd5-b5a8-cf31aade0f7e` in Chrome with temporary viewport overrides. The override was reset and the temporary tab closed after inspection. No wallet was connected, signature requested, purchase approved, or existing save modified.

| Viewport | Verified |
| --- | --- |
| 390 × 844 | Guide entry and repair section are readable; repair SVG loads; page scroll width is 390, with no horizontal page overflow. |
| 360 × 800 | Realm guide SVG loads and fits; page scroll width is 360. Wallet picker fits at x=16 to x=344, its two image icons load, and its close/guest controls are visible. |
| 768 × 1024 | Wallet picker fits, icons render, and page scroll width is 768. |

The guide's initially unloaded off-screen images are lazy-loaded, not missing assets. The final batch and realm guide links now use `/assets/guide/batch.svg` and `/assets/guide/realms.svg`; the first-machine text describes finite supplied work.

This is responsive **layout** evidence from desktop Chrome. It does not verify mobile Safari/Android behavior, physical touch controls, low-end-device frame rates, gameplay pickup latency, or wallet-app switching and signing. Those checks remain open.
