import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAdminCliArgs,
  parseJsonArg,
  requireArg,
  resolveAdminBaseUrl,
  usage
} from '../dist/cli/admin-lib.js';

test('resolveAdminBaseUrl prefers explicit env and strips trailing slash', () => {
  assert.equal(
    resolveAdminBaseUrl({ DISCOVERY_BASE_URL: 'https://example.com/' }),
    'https://example.com'
  );
  assert.equal(
    resolveAdminBaseUrl({ PORT: '4567' }),
    'http://127.0.0.1:4567'
  );
});

test('parseAdminCliArgs returns command and args', () => {
  assert.deepEqual(parseAdminCliArgs(['sync']), {
    name: 'sync',
    args: []
  });
  assert.deepEqual(parseAdminCliArgs(['put-model-override', 'openai', 'gpt-5', '{}']), {
    name: 'put-model-override',
    args: ['openai', 'gpt-5', '{}']
  });
});

test('CLI helper validations produce useful errors', () => {
  assert.throws(() => parseAdminCliArgs([]), /Usage:/);
  assert.throws(() => requireArg(undefined, 'modelId'), /Missing required argument: modelId/);
  assert.throws(() => parseJsonArg('{', 'model override'), /Invalid JSON for model override/);
  assert.match(usage(), /put-model-override <providerId> <modelId> <json>/);
});
