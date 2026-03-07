import {
  parseAdminCliArgs,
  parseJsonArg,
  requireArg,
  resolveAdminBaseUrl,
  usage
} from './admin-lib.js';

async function main(): Promise<void> {
  const adminApiKey = process.env.ADMIN_API_KEY;
  if (!adminApiKey) {
    throw new Error('ADMIN_API_KEY is required');
  }

  const { name, args } = parseAdminCliArgs(process.argv.slice(2));
  const baseUrl = resolveAdminBaseUrl(process.env);

  switch (name) {
    case 'sync': {
      await printRequest(baseUrl, adminApiKey, 'POST', '/admin/sync/openrouter');
      return;
    }
    case 'list-provider-overrides': {
      await printRequest(baseUrl, adminApiKey, 'GET', '/admin/overrides/providers');
      return;
    }
    case 'list-model-overrides': {
      await printRequest(baseUrl, adminApiKey, 'GET', '/admin/overrides/models');
      return;
    }
    case 'put-provider-override': {
      const providerId = encodeURIComponent(requireArg(args[0], 'providerId'));
      const body = parseJsonArg(requireArg(args[1], 'json'), 'provider override');
      await printRequest(baseUrl, adminApiKey, 'PUT', `/admin/overrides/providers/${providerId}`, body);
      return;
    }
    case 'delete-provider-override': {
      const providerId = encodeURIComponent(requireArg(args[0], 'providerId'));
      await printRequest(baseUrl, adminApiKey, 'DELETE', `/admin/overrides/providers/${providerId}`);
      return;
    }
    case 'put-model-override': {
      const providerId = encodeURIComponent(requireArg(args[0], 'providerId'));
      const modelId = encodeURIComponent(requireArg(args[1], 'modelId'));
      const body = parseJsonArg(requireArg(args[2], 'json'), 'model override');
      await printRequest(baseUrl, adminApiKey, 'PUT', `/admin/overrides/models/${providerId}/${modelId}`, body);
      return;
    }
    case 'delete-model-override': {
      const providerId = encodeURIComponent(requireArg(args[0], 'providerId'));
      const modelId = encodeURIComponent(requireArg(args[1], 'modelId'));
      await printRequest(baseUrl, adminApiKey, 'DELETE', `/admin/overrides/models/${providerId}/${modelId}`);
      return;
    }
    case 'help':
    case '--help':
    case '-h': {
      console.log(usage());
      return;
    }
    default:
      throw new Error(`Unknown command: ${name}\n\n${usage()}`);
  }
}

async function printRequest(
  baseUrl: string,
  adminApiKey: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-admin-key': adminApiKey
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}: ${JSON.stringify(payload)}`);
  }

  console.log(JSON.stringify(payload, null, 2));
}

await main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
