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
