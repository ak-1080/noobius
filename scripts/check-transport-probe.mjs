import assert from 'node:assert/strict';
import WebSocket from 'ws';

const origin = process.argv[2] ?? 'http://localhost:3000';
if (!['http://localhost:3000', 'http://localhost:3004', 'https://noobius-compute-crew.rivd609.chatgpt.site'].includes(origin))
  throw Error('Use the known local or owner-private Site origin.');
const headers = process.env.NOOBIUS_SITE_AUTH
  ? { 'OAI-Sites-Authorization': `Bearer ${process.env.NOOBIUS_SITE_AUTH}` }
  : {};
const result = await fetch(origin + '/api/noobius/transport-probe', { headers });
assert.equal(result.status, 200, 'Probe status route');
const capability = await result.json();
assert.equal(capability.probe, 1);
console.log({ capability });
async function exchange(mode, overrideOrigin = origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(origin.replace(/^http/, 'ws') + '/api/noobius/transport-probe?mode=' + mode,
      { origin: overrideOrigin, headers, handshakeTimeout: 8000 });
    let receipt;
    socket.on('open', () => socket.send('ping'));
    socket.on('message', (message) => { receipt = JSON.parse(message.toString()); });
    socket.on('unexpected-response', (_, response) => {
      response.resume();
      reject(Error('Handshake status ' + response.statusCode));
      socket.terminate();
    });
    socket.on('error', reject);
    socket.on('close', (code) => receipt ? resolve({ ...receipt, code }) : reject(Error('Closed without receipt: ' + code)));
  });
}
const socket = await exchange('socket');
assert.equal(socket.pong, true);assert.equal(socket.code, 1000);
console.log({ rawUpgrade: socket });
const denied = await fetch(origin + '/api/noobius/transport-probe?mode=socket', {
  headers: { ...headers, Origin: 'https://example.invalid' },
});
assert.equal(denied.status, 403);
await assert.rejects(exchange('socket', 'https://example.invalid'));
console.log({ foreignOriginRejected: true });
if (capability.roomBinding) {
  const results = await Promise.all(Array.from({ length: 5 }, () => exchange('room')));
  assert.equal(new Set(results.map(r => r.receipt)).size, 5);
  for (const r of results) { assert.equal(r.pong, true);assert.equal(r.code, 1000); }
  console.log({ sharedRoom: results.map(r => r.receipt) });
} else {
  await assert.rejects(exchange('room'));
  console.log({ sharedRoom: 'unavailable: namespace not provisioned' });
  process.exitCode = 2;
}
