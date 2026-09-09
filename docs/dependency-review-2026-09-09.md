# Dependency patch review — September 9, 2026

Applied the smallest compatible first patch: Vite `8.0.13 → 8.0.16`, with overrides selecting `ws 8.21.0` and `undici 7.29.1`. Vinext, Wrangler, Miniflare and workerd versions are preserved. These address the applicable [Vite advisory](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff), [WebSocket fragmentation advisory](https://github.com/websockets/ws/security/advisories/GHSA-96hv-2xvq-fx4p) and affected Undici ranges in the audit.

The resulting npm audit reports **10 affected packages: 4 moderate and 6 high**, down from 13 (6 moderate, 7 high). This is not a clean audit. Remaining affected package names include the transitive parents as well as the underlying packages: `@cloudflare/vite-plugin`, `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, `drizzle-kit`, `esbuild`, `image-size`, `miniflare`, `sharp`, `vinext`, and `wrangler`.

The previous statement that every affected path was tooling-only was too broad. A vulnerable `ws` copy was reachable in the dependency graph via `viem → isows`, although the application does not configure Viem WebSocket transports. That copy is now overridden. Neither a dependency tree nor the lack of an observed call is whole-program reachability proof.

## Follow-up boundaries

- Wrangler and the Drizzle loader retain older esbuild versions. Scoped overrides need preview/build and migration-generation checks because they cross pre-1.0 minor releases. Do not accept npm audit's suggested Drizzle downgrade as an automatic fix.
- Miniflare's local Images binding retains `sharp 0.34.5`; the proposed `0.35.4` crosses a release with [breaking changes](https://github.com/lovell/sharp/releases/tag/v0.35.0). This binding is not the app's user-upload pipeline, but that alone is not a blanket safety claim.
- `image-size 2.0.2` has no patched published release for the reported [ICNS](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and [JXL/HEIF](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) parser issues. Vinext beta.6 [bundles that same implementation](https://github.com/cloudflare/vinext/pull/2913); hiding it from npm's dependency graph is not remediation. It is currently used for build-time static image metadata. Do not process untrusted build assets through those parsers without remediation.
- The broader suggested Cloudflare update introduces a new workerd and a Miniflare 5 alpha. Treat that as a separately tested runtime/tooling upgrade.

No force audit fix or unsupported downgrade was performed. Continue remediation before broad public access rather than describing the project as vulnerability-free.

## Scoped tooling follow-up

Applied three scoped overrides while retaining the existing Vinext, Cloudflare Vite plugin, Wrangler, Miniflare, workerd, React and Vite versions:

| Parent                    | Dependency | Before → after    |
| ------------------------- | ---------- | ----------------- |
| Wrangler                  | esbuild    | 0.27.3 → 0.28.2   |
| `@esbuild-kit/core-utils` | esbuild    | 0.18.20 → 0.25.12 |
| Miniflare                 | sharp      | 0.34.5 → 0.35.4   |

The esbuild updates address the [Windows development-server traversal](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) and [development-server CORS issue](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99). Sharp 0.35.4 includes patched libheif 1.23.2; see the [maintainer advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c). Existing ws and Undici overrides remain.

`npm run test:tooling` passes three compatibility checks: the legacy TypeScript loader's sync/async transforms; real-schema Drizzle migration generation in a temporary directory followed by an unchanged repeat; and native sharp through Miniflare Images metadata, WebP and AVIF transforms. The actual local economy/coordinator API scenarios also pass with these overrides. No real database migration or player data change was needed. Malformed preexisting optional-platform lock entries were regenerated/repaired during installation; the final lockfile has no missing-version package entries.

Fresh npm audit now reports **two high affected packages, `image-size` and its parent `vinext`**. This is still not a clean audit. Published Vinext beta.9 was inspected: it bundles `image-size@2.0.2` with the same unsafe ICNS/JXL size-advancement paths. Updating to beta.9 would hide the transitive report without resolving that code. The parser is used for repository metadata assets in the inspected build path; this limited finding is not whole-program proof that every potential ingestion path is safe. Keep untrusted build assets out of these parsers until an actual patch is available.
