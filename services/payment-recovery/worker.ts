import { recoverComputePayments } from '../../lib/compute-payment-recovery.ts';
import { paymentConfiguration } from '../../lib/compute-market-api.ts';
type Env = Record<string, unknown> & { DB: D1Database };
const worker = {
  async scheduled(_controller: ScheduledController, env: Env) {
    const counts = await recoverComputePayments(env.DB, (quote) =>
      paymentConfiguration(env, quote),
    );
    // Counts only: never log wallet signatures, transactions, keys or RPC URLs.
    if (counts.checked)
      console.log(
        JSON.stringify({ event: 'compute-payment-recovery', ...counts }),
      );
  },
  fetch() {
    return new Response('Not found', { status: 404 });
  },
};

export default worker;
