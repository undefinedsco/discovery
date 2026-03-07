import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchOpenRouterSnapshot, OPENROUTER_MODELS_URL } from '../dist/core/openrouter.js';

const payload = {
  data: []
};

test('fetchOpenRouterSnapshot works without OPENROUTER_API_KEY', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;

  const calls = [];
  const snapshot = await fetchOpenRouterSnapshot(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  });

  try {
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, OPENROUTER_MODELS_URL);
    assert.equal(calls[0].init.headers.accept, 'application/json');
    assert.equal(calls[0].init.headers.authorization, undefined);
    assert.equal(snapshot.response.data.length, 0);
  } finally {
    if (previous !== undefined) {
      process.env.OPENROUTER_API_KEY = previous;
    }
  }
});

test('fetchOpenRouterSnapshot adds bearer token when OPENROUTER_API_KEY is set', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

  const calls = [];
  await fetchOpenRouterSnapshot(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  });

  try {
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.headers.authorization, 'Bearer test-openrouter-key');
  } finally {
    if (previous === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = previous;
    }
  }
});
