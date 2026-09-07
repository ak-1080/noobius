import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
const base = process.env.NOOBIUS_TEST_ORIGIN ?? 'http://localhost:3000';
export class Client {
  constructor(account = privateKeyToAccount(generatePrivateKey())) {
    this.account = account;
    this.cookies = new Map();
  }
  async request(action, body, extra = {}) {
    const r = await fetch(base + '/api/noobius/' + action, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: base,
        Cookie: [...this.cookies].map(([k, v]) => k + '=' + v).join('; '),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of r.headers.getSetCookie()) {
      const [pair] = c.split(';'),
        i = pair.indexOf('=');
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
    return { status: r.status, data };
  }
  async login() {
    const nonce = await this.request('nonce', {
      address: this.account.address,
      chainId: 1,
    });
    assert.equal(nonce.status, 200, JSON.stringify(nonce.data));
    const signature = await this.account.signMessage({
      message: nonce.data.message,
    });
    const verified = await this.request('verify', { signature });
    assert.equal(verified.status, 200, JSON.stringify(verified.data));
    return verified;
  }
  body(body = {}) {
    return { expectedWallet: this.account.address.toLowerCase(), ...body };
  }
}
