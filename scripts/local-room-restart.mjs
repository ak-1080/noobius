// Owns an isolated local room coordinator for a crash/restart gameplay check.
// Never points at a production Worker or uses production room-auth secrets.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';

const root = resolve(import.meta.dirname, '..');
const config = resolve(root, '.wrangler/mixed-gameplay-qa/rooms.json');
const state = resolve(root, '.wrangler/mixed-gameplay-qa/rooms-state');
const url = 'http://127.0.0.1:3004/rooms/restart-check';
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

async function up() {
  try {
    const result = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return result.status === 404;
  } catch {
    return false;
  }
}

async function until(test, description, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await test()) return;
    await wait(150);
  }
  throw Error('Timed out waiting for local room coordinator ' + description);
}

export async function localRoomRestart() {
  assert.equal(process.env.NOOBIUS_TEST_ORIGIN, 'http://127.0.0.1:3003');
  await access(config);
  assert.equal(await up(), false, 'Port 3004 already has a room coordinator');
  const log = await open('/tmp/noobius-local-room-restart.log', 'a');
  let child;
  async function start() {
    child = spawn(
      resolve(root, 'node_modules/.bin/wrangler'),
      [
        'dev',
        '--config',
        config,
        '--ip',
        '127.0.0.1',
        '--port',
        '3004',
        '--inspector-port',
        '9233',
        '--persist-to',
        state,
      ],
      { cwd: root, stdio: ['ignore', log.fd, log.fd], detached: true },
    );
    const exited = once(child, 'exit');
    await Promise.race([
      until(up, 'to start'),
      exited.then(() => {
        throw Error('Local room coordinator exited before it was ready');
      }),
    ]);
  }
  async function stop() {
    if (!child) return;
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    await until(async () => !(await up()), 'to stop');
    child = undefined;
  }
  try {
    await start();
    return {
      async restart() {
        await stop();
        await start();
      },
      async close() {
        await stop();
        await log.close();
      },
    };
  } catch (error) {
    await stop();
    await log.close();
    throw error;
  }
}
