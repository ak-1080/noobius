// Temporary remote-development probe. Read-only calls only; never broadcast or
// expose the configured provider URL, which may contain an API key.
const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';

async function rpc(url, method, params = []) {
  const id = crypto.randomUUID();
  try {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      return { ok: false, httpStatus: response.status };
    const data = await response.json();
    if (data?.id !== id || data?.jsonrpc !== '2.0' || data.error ||
        !Object.hasOwn(data ?? {}, 'result'))
      return { ok: false, rpcCode: Number.isInteger(data?.error?.code) ? data.error.code : null };
    return { ok: true, result: data.result };
  } catch {
    return { ok: false, transportError: true };
  }
}

const probeWorker = {
  async fetch(request, env) {
    if (request.method !== 'GET' || new URL(request.url).pathname !== '/')
      return new Response(null, { status: 404 });
    if (!env.NOOBIUS_RPC_URL || !env.NOOBIUS_MINT || !env.NOOBIUS_SIGNATURE)
      return Response.json({ ok: false, configurationMissing: true });
    const checks = {};
    const genesis = await rpc(env.NOOBIUS_RPC_URL, 'getGenesisHash');
    checks.genesis = genesis.ok
      ? { ok: genesis.result === DEVNET_GENESIS, network: genesis.result === DEVNET_GENESIS ? 'devnet' : 'wrong-network' }
      : genesis;
    if (!checks.genesis.ok)
      return Response.json({ ok: false, checks });
    const mint = await rpc(env.NOOBIUS_RPC_URL, 'getAccountInfo', [
      env.NOOBIUS_MINT, { encoding: 'jsonParsed', commitment: 'finalized' },
    ]);
    checks.mint = mint.ok ? {
      ok: mint.result?.value?.data?.parsed?.type === 'mint' &&
        mint.result?.value?.data?.parsed?.info?.isInitialized === true &&
        Number.isSafeInteger(mint.result?.context?.slot),
    } : mint;
    if (!checks.mint.ok)
      return Response.json({ ok: false, checks });
    for (const [name, method, params, validate] of [
      ['blockhash', 'getLatestBlockhash', [{ commitment: 'finalized' }],
        (v) => typeof v?.value?.blockhash === 'string' &&
          Number.isSafeInteger(v?.context?.slot) &&
          v.context.slot >= mint.result.context.slot],
      ['history', 'getTransaction', [env.NOOBIUS_SIGNATURE, {
        encoding: 'base64', commitment: 'finalized', maxSupportedTransactionVersion: 0,
      }], (v) => v?.meta?.err === null],
    ]) {
      let answer;
      for (let attempt = 0; attempt < (name === 'blockhash' ? 5 : 1); attempt++) {
        answer = await rpc(env.NOOBIUS_RPC_URL, method, params);
        if (!answer.ok || validate(answer.result)) break;
        if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 400));
      }
      checks[name] = answer.ok ? {
        ok: validate(answer.result),
        ...(name === 'blockhash' ? {
          slotDelta: answer.result?.context?.slot - mint.result.context.slot,
        } : {}),
      } : answer;
    }
    return Response.json({
      ok: Object.values(checks).every((check) => check.ok),
      checks,
    });
  },
};
export default probeWorker;
