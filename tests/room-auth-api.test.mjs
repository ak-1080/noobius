import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client } from './api-client.mjs';
import { roomServiceHeaders, ROOM_SERVICE_PATH } from '../lib/room-auth.ts';

const origin = process.env.NOOBIUS_TEST_ORIGIN;
if (origin !== 'http://127.0.0.1:3003')
  throw new Error('Room auth QA requires isolated loopback port 3003.');
// Generated only for this isolated Worker. Never copy deployed credentials here.
const config = JSON.parse(readFileSync('.wrangler/room-auth-qa.json', 'utf8'));
assert.equal(config.audience, origin);
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
async function service(body, headers) {
  const raw = JSON.stringify(body);
  const r = await fetch(origin + ROOM_SERVICE_PATH, {
    method: 'POST',
    headers: headers ?? (await roomServiceHeaders(config, raw)),
    body: raw,
  });
  return { status: r.status, data: await r.json() };
}

test('actual Worker authenticates tickets, protects cookie routes and revokes the exact login', async () => {
  const c = new Client();
  const guest = new Client();
  assert.equal((await guest.request('room-ticket', {})).status, 401);
  ok(await c.login());
  const controller = { clientId: crypto.randomUUID(), generation: 0 };
  controller.generation = ok(
    await c.request(
      'neighborhood-join',
      c.body({ ...controller, realm: 'commons' }),
    ),
  ).membership.generation;
  assert.equal(
    (
      await c.request('room-ticket', c.body(controller), {
        Origin: 'https://foreign.example',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await c.request('room-ticket', {
        ...controller,
        expectedWallet: guest.account.address.toLowerCase(),
      })
    ).status,
    401,
  );
  const ticket = ok(await c.request('room-ticket', c.body(controller))).ticket;
  assert.match(ticket, /^[a-f0-9]{64}$/);
  const body = { operation: 'ticket-consume', ticket };
  assert.equal(
    (await service(body, { 'Content-Type': 'application/json' })).status,
    401,
  );
  const signed = await roomServiceHeaders(config, JSON.stringify(body));
  const a = ok(await service(body, signed));
  assert.ok(a.grant);
  assert.equal((await service(body, signed)).status, 409);
  assert.equal((await service(body)).status, 409);
  const snapshot = ok(
    await service({ operation: 'authority-refresh', grant: a.grant }),
  );
  assert.equal(snapshot.membership.neighborhoodId, a.membership.neighborhoodId);
  assert.equal(snapshot.membership.sequence, a.membership.sequence);
  assert.equal(
    (
      await service({
        operation: 'movement-checkpoint',
        grant: a.grant,
        x: 999,
        z: 999,
      })
    ).status,
    400,
  );
  const otherLogin = new Client(c.account);
  ok(await otherLogin.login());
  ok(await c.request('logout', c.body()));
  assert.equal(
    (await service({ operation: 'authority-refresh', grant: a.grant })).status,
    409,
  );
  const nextTicket = ok(
    await otherLogin.request('room-ticket', otherLogin.body(controller)),
  ).ticket;
  ok(await service({ operation: 'ticket-consume', ticket: nextTicket }));
  ok(
    await otherLogin.request('neighborhood-leave', otherLogin.body(controller)),
  );
  ok(await otherLogin.request('logout', otherLogin.body()));
});
