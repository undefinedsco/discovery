import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestRegistry } from './helpers.mjs';

test('RegistryService syncs OpenRouter data and persists curated registry', async () => {
  const context = await createTestRegistry({
    overrides: {
      providers: {
        openai: {
          name: 'OpenAI'
        }
      },
      models: {
        openai: {
          'gpt-5.4': {
            aliases: { add: ['gpt-5.4-latest'] }
          }
        }
      }
    }
  });

  try {
    const registry = await context.registry.syncOpenRouter();
    assert.equal(registry.models.length, 2);
    assert.equal(registry.providers.length, 2);

    const openAi = await context.registry.getModel('openai', 'gpt-5.4');
    assert.ok(openAi);
    assert.ok(openAi.aliases.includes('gpt-5.4-latest'));

    const provider = await context.registry.getProvider('openai');
    assert.ok(provider);
    assert.equal(provider.name, 'OpenAI');

    const toolModels = await context.registry.getModels({ capability: 'tool-calling' });
    assert.equal(toolModels.length, 2);

    const searched = await context.registry.getModels({ q: 'sonnet' });
    assert.equal(searched.length, 1);
    assert.equal(searched[0]?.providerId, 'anthropic');
    assert.equal(searched[0]?.modelId, 'claude-sonnet-4.5-preview');
  } finally {
    await context.close();
  }
});

test('RegistryService refreshes registry after model override changes', async () => {
  const context = await createTestRegistry();

  try {
    await context.registry.syncOpenRouter();
    const refreshed = await context.registry.upsertModelOverride('openai', 'gpt-5.4', {
      capabilities: { add: ['structured-output'] },
      aliases: { add: ['gpt-5.4-prod'] }
    });

    assert.ok(refreshed);

    const model = await context.registry.getModel('openai', 'gpt-5.4');
    assert.ok(model);
    assert.ok(model.aliases.includes('gpt-5.4-prod'));
    assert.ok(model.capabilities.includes('structured-output'));
  } finally {
    await context.close();
  }
});
