import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newDb } from 'pg-mem';
import { PgStore } from '../dist/core/pg-store.js';
import { RegistryService } from '../dist/core/registry-service.js';

export async function readFixture(name) {
  const content = await readFile(join(process.cwd(), 'test', 'fixtures', name), 'utf8');
  return JSON.parse(content);
}

export function makeFetchResponse(payload) {
  return async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json'
    }
  });
}

export async function createTestRegistry(options = {}) {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const store = new PgStore(pool);
  const fixture = options.fixture ?? await readFixture('openrouter-models.json');
  const registry = new RegistryService({
    store,
    fetchFn: options.fetchFn ?? makeFetchResponse(fixture)
  });

  await registry.initialize();

  for (const [providerId, override] of Object.entries(options.overrides?.providers ?? {})) {
    await store.upsertProviderOverride(providerId, override);
  }

  for (const [providerId, models] of Object.entries(options.overrides?.models ?? {})) {
    for (const [modelId, override] of Object.entries(models ?? {})) {
      await store.upsertModelOverride(providerId, modelId, override);
    }
  }

  return {
    pool,
    store,
    registry,
    fixture,
    async close() {
      await pool.end();
    }
  };
}
