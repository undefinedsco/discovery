import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApiRequest } from '../dist/api/server.js';
import { createTestRegistry } from './helpers.mjs';

const adminApiKey = 'test-admin-key';
const adminHeaders = {
  'x-admin-key': adminApiKey
};

test('API handler exposes public registry queries', async () => {
  const context = await createTestRegistry();

  try {
    await context.registry.syncOpenRouter();

    const healthResult = await handleApiRequest(context.registry, 'GET', '/health');
    assert.equal(healthResult.statusCode, 200);

    const registryResult = await handleApiRequest(context.registry, 'GET', '/registry');
    assert.equal(registryResult.statusCode, 200);
    assert.equal(registryResult.body.version, 1);
    assert.equal(registryResult.body.providers.length, 2);
    assert.equal(registryResult.body.models.length, 2);
    assert.match(registryResult.headers?.etag ?? '', /^W\//);
    assert.ok(registryResult.headers?.['last-modified']);
    assert.equal(registryResult.headers?.['cache-control'], 'public, max-age=60, stale-while-revalidate=300');

    const registryNotModified = await handleApiRequest(context.registry, 'GET', '/registry', {
      headers: {
        'if-none-match': registryResult.headers?.etag
      }
    });
    assert.equal(registryNotModified.statusCode, 304);
    assert.equal(registryNotModified.body, undefined);

    const registryHeadResult = await handleApiRequest(context.registry, 'HEAD', '/registry');
    assert.equal(registryHeadResult.statusCode, 200);
    assert.equal(registryHeadResult.body, undefined);
    assert.equal(registryHeadResult.headers?.etag, registryResult.headers?.etag);

    const versionResult = await handleApiRequest(context.registry, 'GET', '/registry/version');
    assert.equal(versionResult.statusCode, 200);
    assert.equal(versionResult.body.version, 1);
    assert.equal(versionResult.body.generatedAt, registryResult.body.generatedAt);

    const providerVersionResult = await handleApiRequest(context.registry, 'GET', '/providers/openai/version');
    assert.equal(providerVersionResult.statusCode, 200);
    assert.equal(providerVersionResult.body.providerId, 'openai');
    assert.ok(providerVersionResult.body.updatedAt);

    const providerVersionHead = await handleApiRequest(context.registry, 'HEAD', '/providers/openai/version');
    assert.equal(providerVersionHead.statusCode, 200);
    assert.equal(providerVersionHead.body, undefined);

    const providerModelsResult = await handleApiRequest(context.registry, 'GET', '/providers/openai/models');
    assert.equal(providerModelsResult.statusCode, 200);
    assert.deepEqual(providerModelsResult.body.map(model => model.modelId), ['gpt-5.4']);

    const modelResult = await handleApiRequest(context.registry, 'GET', '/providers/openai/models/gpt-5.4');
    assert.equal(modelResult.statusCode, 200);
    assert.equal(modelResult.body.providerId, 'openai');
    assert.equal(modelResult.body.modelId, 'gpt-5.4');

    const modelVersionResult = await handleApiRequest(context.registry, 'GET', '/providers/openai/models/gpt-5.4/version');
    assert.equal(modelVersionResult.statusCode, 200);
    assert.equal(modelVersionResult.body.providerId, 'openai');
    assert.equal(modelVersionResult.body.modelId, 'gpt-5.4');
    assert.ok(modelVersionResult.body.updatedAt);

    const modelVersionHead = await handleApiRequest(context.registry, 'HEAD', '/providers/openai/models/gpt-5.4/version');
    assert.equal(modelVersionHead.statusCode, 200);
    assert.equal(modelVersionHead.body, undefined);

    const allSourcesResult = await handleApiRequest(context.registry, 'GET', '/sources');
    assert.equal(allSourcesResult.statusCode, 200);
    assert.equal(allSourcesResult.body.length, 1);
    assert.equal(allSourcesResult.body[0]?.kind, 'openrouter-models-api');

    const statsResult = await handleApiRequest(context.registry, 'GET', '/stats');
    assert.equal(statsResult.statusCode, 200);
    assert.equal(statsResult.body.version, 1);
    assert.equal(statsResult.body.providerCount, 2);
    assert.equal(statsResult.body.modelCount, 2);
    assert.equal(statsResult.body.sourceCount, 1);

    const modelsResult = await handleApiRequest(context.registry, 'GET', '/models?provider=openai');
    assert.equal(modelsResult.statusCode, 200);
    assert.deepEqual(modelsResult.body.map(model => model.modelId), ['gpt-5.4']);

    const sourcesResult = await handleApiRequest(context.registry, 'GET', '/providers/openai/models/gpt-5.4/sources');
    assert.equal(sourcesResult.statusCode, 200);
    assert.equal(sourcesResult.body[0]?.kind, 'openrouter-models-api');
  } finally {
    await context.close();
  }
});

test('API handler requires admin authorization for admin routes', async () => {
  const context = await createTestRegistry();

  try {
    await assert.rejects(
      handleApiRequest(context.registry, 'POST', '/admin/sync/openrouter', {
        adminApiKey
      }),
      error => error?.message === 'Admin authorization failed'
    );
  } finally {
    await context.close();
  }
});

test('API handler supports admin sync and override routes', async () => {
  const context = await createTestRegistry();

  try {
    const syncResult = await handleApiRequest(context.registry, 'POST', '/admin/sync/openrouter', {
      headers: adminHeaders,
      adminApiKey
    });
    assert.equal(syncResult.statusCode, 200);
    assert.equal(syncResult.body.status, 'ok');
    assert.equal(syncResult.body.models, 2);

    const putResult = await handleApiRequest(context.registry, 'PUT', '/admin/overrides/models/openai/gpt-5.4', {
      headers: adminHeaders,
      adminApiKey,
      body: {
        aliases: { add: ['gpt-5.4-latest'] },
        description: 'Preferred production alias'
      }
    });
    assert.equal(putResult.statusCode, 200);

    const overridesResult = await handleApiRequest(context.registry, 'GET', '/admin/overrides/models', {
      headers: adminHeaders,
      adminApiKey
    });
    assert.equal(overridesResult.statusCode, 200);
    assert.ok(overridesResult.body.openai?.['gpt-5.4']);

    const modelResult = await handleApiRequest(context.registry, 'GET', '/providers/openai/models/gpt-5.4');
    assert.equal(modelResult.statusCode, 200);
    assert.ok(modelResult.body.aliases.includes('gpt-5.4-latest'));
    assert.equal(modelResult.body.description, 'Preferred production alias');

    const deleteResult = await handleApiRequest(context.registry, 'DELETE', '/admin/overrides/models/openai/gpt-5.4', {
      headers: adminHeaders,
      adminApiKey
    });
    assert.equal(deleteResult.statusCode, 200);

    const finalModelResult = await handleApiRequest(context.registry, 'GET', '/providers/openai/models/gpt-5.4');
    assert.equal(finalModelResult.statusCode, 200);
    assert.ok(!finalModelResult.body.aliases.includes('gpt-5.4-latest'));
  } finally {
    await context.close();
  }
});
