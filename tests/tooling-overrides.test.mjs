import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import vm from 'node:vm';
import sharp from 'sharp';
import { Log, LogLevel, Miniflare } from 'miniflare';

const project = fileURLToPath(new URL('..', import.meta.url));
const run = promisify(execFile);
const require = createRequire(import.meta.url);

void test('the legacy Drizzle loader still transforms TypeScript through its scoped esbuild', async () => {
  const loader = require('@esbuild-kit/core-utils');
  const source =
    'type Input = { value: number }; const input: Input = { value: 21 }; export const answer: number = input.value * 2;';
  const sync = loader.transformSync(
    source,
    path.join(project, 'loader-compat.ts'),
  );
  const sandboxModule = { exports: {} };
  vm.runInNewContext(sync.code, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require,
  });
  assert.equal(sandboxModule.exports.answer, 42);
  const asynchronous = await loader.transform(
    source,
    path.join(project, 'loader-compat.mts'),
  );
  const result = await import(
    'data:text/javascript,' + encodeURIComponent(asynchronous.code)
  );
  assert.equal(result.answer, 42);
});

void test(
  'Drizzle loads TypeScript config and generates the real schema in isolation',
  { timeout: 30_000 },
  async (t) => {
    const scratch = await mkdtemp(
      path.join(os.tmpdir(), 'noobius-drizzle-compat-'),
    );
    t.after(() => rm(scratch, { recursive: true, force: true }));
    await symlink(
      path.join(project, 'node_modules'),
      path.join(scratch, 'node_modules'),
      'dir',
    );
    const config = path.join(scratch, 'drizzle.config.ts');
    const output = path.join(scratch, 'migrations');
    await writeFile(
      config,
      [
        "import { defineConfig } from 'drizzle-kit';",
        'export default defineConfig(' +
          JSON.stringify({
            dialect: 'sqlite',
            schema: path.join(project, 'db/schema.ts'),
            out: './migrations',
          }) +
          ');',
      ].join('\n'),
    );
    const command = [
      path.join(project, 'node_modules/drizzle-kit/bin.cjs'),
      'generate',
      '--config',
      config,
    ];
    const generated = await run(process.execPath, command, {
      cwd: scratch,
      timeout: 20_000,
    });
    const files = (await readdir(output)).filter((name) =>
      name.endsWith('.sql'),
    );
    assert.equal(files.length, 1, generated.stdout);
    const sql = await readFile(path.join(output, files[0]), 'utf8');
    for (const table of [
      'players',
      'room_grants',
      'room_checkpoints',
      'room_service_nonces',
    ])
      assert.ok(
        sql.includes('CREATE TABLE `' + table + '`'),
        'Missing table ' + table,
      );
    const journalBefore = await readFile(
      path.join(output, 'meta/_journal.json'),
      'utf8',
    );
    const repeated = await run(process.execPath, command, {
      cwd: scratch,
      timeout: 20_000,
    });
    assert.doesNotMatch(generated.stderr + repeated.stderr, /Error:/);
    assert.match(repeated.stdout, /No schema changes/i);
    assert.equal(
      await readFile(path.join(output, 'meta/_journal.json'), 'utf8'),
      journalBefore,
    );
    assert.deepEqual(
      (await readdir(output)).filter((name) => name.endsWith('.sql')),
      files,
    );
  },
);

void test(
  'patched sharp native codecs work through the existing Miniflare Images binding',
  { timeout: 30_000 },
  async (t) => {
    assert.equal(sharp.versions.sharp, '0.35.4');
    assert.equal(sharp.versions.heif, '1.23.2');
    const original = await sharp({
      create: { width: 16, height: 12, channels: 4, background: '#22aa77' },
    })
      .png()
      .toBuffer();
    const mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } };',
      compatibilityDate: '2026-05-15',
      images: { binding: 'IMAGES' },
      imagesPersist: false,
      cf: false,
      log: new Log(LogLevel.NONE),
    });
    t.after(() => mf.dispose());
    const images = await mf.getImagesBinding('IMAGES');
    const stream = () => new Blob([original]).stream();
    const info = await images.info(stream());
    assert.deepEqual(
      { format: info.format, width: info.width, height: info.height },
      { format: 'image/png', width: 16, height: 12 },
    );
    for (const format of ['image/webp', 'image/avif']) {
      const transformed = await images
        .input(stream())
        .transform({ width: 8, height: 6 })
        .output({ format });
      const response = transformed.response();
      assert.equal(response.headers.get('content-type'), format);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.ok(bytes.length > 0);
      const metadata = await sharp(bytes).metadata();
      assert.deepEqual(
        { width: metadata.width, height: metadata.height },
        { width: 8, height: 6 },
      );
      assert.equal(metadata.format, format === 'image/avif' ? 'heif' : 'webp');
    }
  },
);
