import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOpenRouterModels } from '../dist/core/normalize.js';
import { readFixture } from './helpers.mjs';

const source = {
  id: 'source:openrouter:test',
  kind: 'openrouter-models-api',
  title: 'OpenRouter models API',
  url: 'https://openrouter.ai/api/v1/models',
  retrievedAt: '2026-03-07T00:00:00.000Z',
  checksum: 'fixture',
  upstream: 'openrouter'
};

test('normalizeOpenRouterModels produces composite ids and normalized fields', async () => {
  const fixture = await readFixture('openrouter-models.json');
  const registry = normalizeOpenRouterModels(fixture.data, source);

  assert.equal(registry.providers.length, 2);
  assert.equal(registry.providers[0]?.name, 'Anthropic');

  const model = registry.models.find(item => item.providerId === 'openai' && item.modelId === 'gpt-5.4');
  assert.ok(model);
  assert.equal(model.name, 'GPT-5.4');
  assert.equal(model.family, 'gpt-5.4');
  assert.equal(model.contextWindow, 1050000);
  assert.equal(model.maxOutputTokens, 128000);
  assert.deepEqual(model.inputModalities, ['file', 'image', 'text']);
  assert.deepEqual(model.outputModalities, ['text']);
  assert.deepEqual(model.capabilities, ['file-input', 'moderated', 'reasoning', 'structured-output', 'tool-calling', 'vision']);
  assert.equal(model.pricing.inputUsdPerMillionTokens, 2.5);
  assert.equal(model.pricing.outputUsdPerMillionTokens, 15);
  assert.equal(model.pricing.inputCacheReadUsdPerMillionTokens, 0.25);
  assert.equal(model.pricing.webSearchUsdPerRequest, 0.01);
  assert.equal(model.releaseStage, 'stable');

  const preview = registry.models.find(item => item.providerId === 'anthropic' && item.modelId === 'claude-sonnet-4.5-preview');
  assert.ok(preview);
  assert.equal(preview.releaseStage, 'preview');
  assert.equal(preview.status, 'scheduled-removal');
});
