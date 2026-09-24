// One-time local, hidden-input setup. The URL is ignored by Git and is never
// printed; deployment copies it into Cloudflare Worker secrets temporarily.
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEVNET_RPC_FILE, validatePrivateDevnetRpcUrl } from './devnet-rpc-config.mjs';

if (!process.stdin.isTTY || !process.stdin.setRawMode)
  throw Error('Run this setup in an interactive terminal.');
process.stdout.write('Paste the private Devnet HTTPS RPC URL and press Enter (input hidden): ');
const value = await new Promise((resolve, reject) => {
  let input = '';
  const finish = (error) => {
    process.stdin.off('data', onData);
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write('\n');
    if (error) reject(error);
    else resolve(input.trim());
  };
  const onData = (chunk) => {
    for (const byte of chunk) {
      if (byte === 3) return finish(Error('Setup cancelled.'));
      if (byte === 10 || byte === 13) return finish();
      if (byte === 127 || byte === 8) input = input.slice(0, -1);
      else if (byte >= 32 && byte < 127 && input.length < 2048)
        input += String.fromCharCode(byte);
    }
  };
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', onData);
});
const url = validatePrivateDevnetRpcUrl(value);
mkdirSync('.wrangler', { recursive: true });
writeFileSync(DEVNET_RPC_FILE, url + '\n', { mode: 0o600 });
console.log('Private devnet RPC URL saved locally outside Git. No wallet was accessed.');
