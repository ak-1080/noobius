import { transportProbe, type TransportProbeEnv } from './probe';
export { TransportProbe } from './probe';
const worker = {
  fetch(request: Request, env: TransportProbeEnv) {
    if (new URL(request.url).pathname === '/api/noobius/transport-probe')
      return transportProbe(request, env);
    return new Response('Transport proof only', { status: 404 });
  },
};
export default worker;
