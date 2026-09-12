import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('./dist/', import.meta.url)),
  appType: 'mpa',
  server: { host: '127.0.0.1', port: 3001, strictPort: true, open: false },
});
await server.listen();
server.printUrls();
