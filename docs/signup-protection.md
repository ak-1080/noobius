# New-wallet signup protection

The optional Turnstile check supplements the existing shared earning pools and rolling signup limits. It is not identity verification or a guarantee that a person owns only one wallet. All earning caps and signed work receipts remain necessary. The October 2 implementation is disabled unless explicitly configured.

## Configuration and activation

Create a Cloudflare Turnstile widget restricted to the staging game hostname. Set `NOOBIUS_SIGNUP_PROTECTION=turnstile` and the public `NOOBIUS_TURNSTILE_SITE_KEY` in the game Worker configuration; store `NOOBIUS_TURNSTILE_SECRET_KEY` as a Worker secret. Never commit that secret, copy it into screenshots, or paste it in chat. Local dummy keys are refused on hosted origins. Do not enable a half-configured widget: new accounts intentionally fail closed.

The current Worker OAuth login cannot manage widgets: the widget API returned HTTP 403, Cloudflare code 10000. Activation requires an account operator with Turnstile access. No production widget or key has been created by this change.

Only a previously unenrolled wallet is asked to complete the browser check. Its response is bound to the server's signed-login challenge, hostname and `noobius_signup` action. The server validates it with Siteverify before creating a profile. A client flag cannot replace verification. The normal wallet signature and single-use challenge remain required. Existing players reconnect without this check, including during a provider outage; their saves are retained. Clearing a browser cookie does not unlink an existing earning pool.

Cloudflare documents single-use tokens that expire after five minutes. If the wallet approval takes too long, reconnect for a fresh challenge. Cancel, expired-token, script-load and provider-error paths offer a retry without creating an account. Widget outage returns a sanitized error and does not log keys or token content.

Before activating beyond staging, check a genuinely new supported wallet, a returning wallet, cancel/retry, expired proof, cross-host proof and provider outage. Test real wallet browsers on mobile. Automated rejection and returning-save cases run with `npm run test:signup-api`; pure provider-response cases run in `npm test`. These do not prove real-widget or wallet-extension acceptance.

## Primary documentation

- [Server-side validation and token lifetime](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Explicit client rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)
- [Action and cData configuration](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)
- [Widget management permissions](https://developers.cloudflare.com/turnstile/get-started/widget-management/api/)
