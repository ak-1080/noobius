import vinext from 'vinext/server/fetch-handler';
import { transportProbe, type TransportProbeEnv } from './lib/transport-probe';
export { TransportProbe } from './lib/transport-probe';

export default {
  fetch(request: Request, env: TransportProbeEnv, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === '/api/noobius/transport-probe')
      return transportProbe(request, env);
    return vinext.fetch(request, env, ctx);
  },
};
