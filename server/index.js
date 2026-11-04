import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createApp } from './app.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const app = createApp({
  dbPath: process.env.DB_PATH ?? resolve(projectRoot, 'data/app.sqlite'),
  staticDir: resolve(projectRoot, 'dist'),
  seed: process.env.SEED_DEMO === 'true' || (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO !== 'false'),
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean) ??
    (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']),
});

app.server.listen(port, '0.0.0.0', () => {
  console.log(`sai API listening on port ${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    try { await app.close(); process.exitCode = 0; }
    catch { process.exitCode = 1; }
  });
}
