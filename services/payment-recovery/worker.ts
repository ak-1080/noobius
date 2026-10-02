import { recoverComputePayments } from '../../lib/compute-payment-recovery.ts';
import { paymentRecoveryConfiguration } from '../../lib/compute-market-api.ts';
import { runtimeControls } from '../../lib/operations.ts';
type Env = Record<string, unknown> & { DB: D1Database };
const worker = {
  async scheduled(_controller: ScheduledController, env: Env) {
    if (runtimeControls(env).maintenance) {
      console.log(
        JSON.stringify({
          event: 'compute-payment-recovery-paused',
          reason: 'maintenance',
        }),
      );
      return;
    }
    const errorStages: Record<string, number> = {};
    const errorCategories: Record<string, number> = {};
    const counts = await recoverComputePayments(
      env.DB,
      (quote) => paymentRecoveryConfiguration(env, quote),
      Date.now(),
      ({ stage, category }) => {
        errorStages[stage] = (errorStages[stage] ?? 0) + 1;
        errorCategories[category] = (errorCategories[category] ?? 0) + 1;
      },
    );
    // Counts and fixed error labels only: never log exception objects, wallets,
    // signatures, transactions, keys or RPC URLs. At most ten rows per event.
    if (counts.checked)
      console.log(
        JSON.stringify({
          event: 'compute-payment-recovery',
          ...counts,
          ...(counts.errors ? { errorStages, errorCategories } : {}),
        }),
      );
    // A completed handler with counted errors looks healthy to platform error
    // monitoring. Preserve every row and the sanitized counts above, then mark
    // this scheduled event failed so operators can detect repeated outages.
    if (counts.errors)
      throw new Error('Compute payment recovery has unresolved errors.');
  },
  fetch() {
    return new Response('Not found', { status: 404 });
  },
};

export default worker;
