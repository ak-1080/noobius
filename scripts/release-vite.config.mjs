// Local acceptance only. This config never imports deployed bindings or env files.
import {
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';

function browserFixturePlugin(root) {
  return {
    name: 'noobius-release-browser-fixture',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/__qa/browser/')) return next();
        response.setHeader('Cache-Control', 'no-store');
        const token = request.url.slice('/__qa/browser/'.length);
        const peer = request.socket.remoteAddress;
        const file = path.join(root, 'browser-fixture.json');
        if (
          process.env.NOOBIUS_RELEASE_QA_SERVE !== 'true' ||
          request.method !== 'GET' ||
          request.headers.host !== '127.0.0.1:3003' ||
          !['127.0.0.1', '::ffff:127.0.0.1'].includes(peer) ||
          !/^[a-f0-9]{64}$/.test(token) ||
          !existsSync(file)
        ) {
          response.statusCode = 404;
          return response.end();
        }
        try {
          if (!realpathSync(file).startsWith(realpathSync(root) + path.sep))
            throw new Error('Browser fixture escaped scratch.');
          const raw = readFileSync(file, 'utf8');
          if (raw.length > 100000)
            throw new Error('Browser fixture too large.');
          const fixture = JSON.parse(raw);
          const actor = Object.entries(fixture.actors ?? {}).find(
            ([, value]) => value?.token === token,
          );
          if (!actor || !/^[a-f0-9]{64}$/.test(actor[1].session)) {
            response.statusCode = 404;
            return response.end();
          }
          // Consume the opaque link before setting the generated test session.
          const session = actor[1].session;
          delete fixture.actors[actor[0]];
          writeFileSync(file + '.tmp', JSON.stringify(fixture), {
            mode: 0o600,
          });
          renameSync(file + '.tmp', file);
          response.setHeader(
            'Set-Cookie',
            `noobius_session=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`,
          );
          response.setHeader('Referrer-Policy', 'no-referrer');
          response.setHeader('Location', '/');
          response.statusCode = 302;
          return response.end();
        } catch {
          response.statusCode = 404;
          return response.end();
        }
      });
    },
  };
}

export default defineConfig(async () => {
  const root = process.env.NOOBIUS_RELEASE_QA_ROOT;
  if (!root || realpathSync(process.cwd()) !== realpathSync(root))
    throw new Error(
      'Release Vite must run inside its runner-owned scratch directory.',
    );
  const configPath = path.join(root, '.openai/wrangler.local.json');
  // The scratch directory contains changing logs and SQLite files. Scan the
  // canonical source root, whose gitignore excludes generated QA evidence.
  const sourceRoot = path.dirname(realpathSync(path.join(root, 'app')));
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  return {
    root,
    envDir: root,
    // Vinext's CommonJS loader recognizes optimized files by node_modules/.vite.
    // Keep that suffix while storing the cache entirely inside this QA run.
    cacheDir: path.join(root, '.wrangler/node_modules/.vite'),
    css: { postcss: { plugins: [tailwindcss({ base: sourceRoot })] } },
    server: {
      host: '127.0.0.1',
      port: 3003,
      strictPort: true,
      watch: { useFsEvents: false, usePolling: true },
    },
    plugins: [
      browserFixturePlugin(root),
      vinext(),
      cloudflare({
        configPath,
        config: { main: 'vinext/server/fetch-handler' },
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        persistState: { path: path.join(root, '.wrangler/state') },
        inspectorPort: false,
        remoteBindings: false,
      }),
    ],
  };
});
