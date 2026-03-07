import { createPgPoolFromEnv } from './core/database.js';
import { createApiServer } from './api/server.js';
import { PgStore } from './core/pg-store.js';
import { RegistryService } from './core/registry-service.js';

const host = process.env.HOST ?? '0.0.0.0';
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const syncOnStart = process.env.DISCOVERY_SYNC_ON_START !== 'false';
const adminApiKey = process.env.ADMIN_API_KEY;
const openRouterAuthMode = process.env.OPENROUTER_API_KEY?.trim() ? 'bearer' : 'anonymous';

const pool = createPgPoolFromEnv();
const store = new PgStore(pool);
const registry = new RegistryService({ store });
const api = createApiServer(registry, adminApiKey);

await registry.initialize();

console.log(`OpenRouter auth: ${openRouterAuthMode}`);

if (syncOnStart) {
  try {
    const synced = await registry.syncOpenRouter();
    console.log(`synced ${synced.models.length} models from OpenRouter`);
  } catch (error) {
    console.warn('initial OpenRouter sync failed:', error);
  }
}

const actualPort = await api.listen(port, host);
console.log(`discovery registry listening on http://${host}:${actualPort}`);

const shutdown = async () => {
  await api.close().catch(() => undefined);
  await pool.end().catch(() => undefined);
};

process.once('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});
process.once('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});
