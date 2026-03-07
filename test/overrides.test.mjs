import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOverrides } from '../dist/core/overrides.js';

const providers = [
  {
    id: 'openai',
    name: 'Openai',
    modelCount: 1,
    sourceIds: ['source:1'],
    updatedAt: '2026-03-07T00:00:00.000Z'
  }
];

const models = [
  {
    providerId: 'openai',
    modelId: 'gpt-5.4',
    upstreamId: 'openai/gpt-5.4',
    name: 'GPT-5.4',
    family: 'gpt-5.4',
    aliases: ['openai/gpt-5.4'],
    status: 'active',
    releaseStage: 'stable',
    inputModalities: ['text'],
    outputModalities: ['text'],
    capabilities: ['tool-calling'],
    pricing: {},
    links: { openrouter: 'https://openrouter.ai/openai/gpt-5.4' },
    metadata: {
      supportedParameters: [],
      moderated: true
    },
    sourceIds: ['source:1'],
    updatedAt: '2026-03-07T00:00:00.000Z'
  }
];

const overrides = {
  providers: {
    openai: {
      name: 'OpenAI',
      homepage: 'https://openai.com'
    }
  },
  models: {
    openai: {
      'gpt-5.4': {
        aliases: { add: ['gpt-5.4-latest'] },
        capabilities: { add: ['structured-output'] },
        pricing: { inputUsdPerMillionTokens: 2.5 }
      }
    }
  }
};

test('applyOverrides patches providers and models', () => {
  const next = applyOverrides(providers, models, overrides);

  assert.equal(next.providers[0]?.name, 'OpenAI');
  assert.equal(next.providers[0]?.homepage, 'https://openai.com');
  assert.deepEqual(next.models[0]?.aliases, ['gpt-5.4-latest', 'openai/gpt-5.4']);
  assert.deepEqual(next.models[0]?.capabilities, ['structured-output', 'tool-calling']);
  assert.equal(next.models[0]?.pricing.inputUsdPerMillionTokens, 2.5);
});
