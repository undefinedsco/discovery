import { createPgPoolFromEnv } from '../core/database.js';
import { PgStore } from '../core/pg-store.js';
import { RegistryService } from '../core/registry-service.js';

const openRouterAuthMode = process.env.OPENROUTER_API_KEY?.trim() ? 'bearer' : 'anonymous';
const pool = createPgPoolFromEnv();
const store = new PgStore(pool);
const registry = new RegistryService({ store });

await registry.initialize();
console.log(`OpenRouter auth: ${openRouterAuthMode}`);
const synced = await registry.syncOpenRouter();

console.log(JSON.stringify({
  generatedAt: synced.generatedAt,
  providers: synced.providers.length,
  models: synced.models.length
}, null, 2));

await pool.end();
