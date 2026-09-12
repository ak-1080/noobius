# Noobius coming-soon site

Published September 11, 2026 at https://noobius.io using the separate Cloudflare Worker `noobius-coming-soon`. Landing, story, stylesheet, script, and both videos were checked over HTTPS; game/API paths return 404. The existing game deployment was not modified.

Deployment configuration is in `wrangler.json`. The current token supports Workers Scripts Write but lacks zone-level Workers Routes access, so Wrangler uploaded the site successfully and its route-discovery step failed. The domain was then attached successfully through Cloudflare's documented account-level Workers Domains API (`PUT /accounts/{account_id}/workers/domains`). Future deploys with this token may need the same separation; do not treat a route-discovery failure as an upload failure and repeatedly upload. Credentials stay outside this repository.

A separate temporary static site intended for noobius.io. It contains the cinematic landing page and `/story/` only. It does not load the game, wallet libraries, API, or saved progress. The original app, its Sites hosting configuration, and its deployment are unchanged.

From the repository root:

```sh
node coming-soon/build.mjs
node coming-soon/preview.mjs
```

Preview: http://127.0.0.1:3001/

`dist/` is an ignored, self-contained deployment artifact. The build copies an explicit list of existing public media and the temporary site's own files; no game server, environment variables, or credentials are included. Only deploy this directory to a separate Cloudflare static site after the preview is accepted. Do not change `.openai/hosting.json` or deploy the game bundle for this placeholder.

The yellow Coming soon control is intentionally inactive. The story remains a separate page. The background is muted and looped, with mobile media, a pause control, reduced-motion support, and a still-image fallback. No release date or playable launch is claimed.

Fonts are the existing site's Latin subsets of Space Grotesk and IBM Plex Mono, from Google Fonts, licensed under the SIL Open Font License. Sources: https://github.com/google/fonts/tree/main/ofl/spacegrotesk and https://github.com/google/fonts/tree/main/ofl/ibmplexmono.
