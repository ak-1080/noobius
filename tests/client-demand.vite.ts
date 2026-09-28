// Local-only API fixture server. No remote bindings, payment secrets or token policy.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vinext from 'vinext';
import tailwindcss from '@tailwindcss/postcss';
import { cloudflare } from '@cloudflare/vite-plugin';
const root = fileURLToPath(new URL('../', import.meta.url));
export default defineConfig({
  root,
  server: { host: '127.0.0.1', port: 3003, strictPort: true },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      persistState: {
        path: fileURLToPath(
          new URL('../.wrangler/qa-dispatch', import.meta.url),
        ),
      },
      config: {
        name: 'noobius-client-demand-local-qa',
        main: 'vinext/server/fetch-handler',
        compatibility_date: '2026-05-15',
        compatibility_flags: ['nodejs_compat'],
        vars: {
          NOOBIUS_SITE_ORIGIN: 'http://127.0.0.1:3003',
          NOOBIUS_PAYMENTS_ENABLED: 'false',
        },
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'site-creator-d1',
            database_id: '00000000-0000-4000-8000-000000000000',
          },
        ],
      },
    }),
  ],
});
