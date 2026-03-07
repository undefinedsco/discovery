export interface AdminCliCommand {
  name: string;
  args: string[];
}

export function resolveAdminBaseUrl(env: NodeJS.ProcessEnv): string {
  const explicit = env.DISCOVERY_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/u, '');
  }

  const port = env.PORT?.trim() || '3000';
  return `http://127.0.0.1:${port}`;
}

export function parseAdminCliArgs(argv: string[]): AdminCliCommand {
  const [name, ...args] = argv;

  if (!name) {
    throw new Error(usage());
  }

  return { name, args };
}

export function usage(): string {
  return [
    'Usage:',
    '  yarn admin sync',
    '  yarn admin list-provider-overrides',
    '  yarn admin list-model-overrides',
    '  yarn admin put-provider-override <providerId> <json>',
    '  yarn admin delete-provider-override <providerId>',
    '  yarn admin put-model-override <providerId> <modelId> <json>',
    '  yarn admin delete-model-override <providerId> <modelId>',
    '',
    'Environment:',
    '  ADMIN_API_KEY is required',
    '  DISCOVERY_BASE_URL defaults to http://127.0.0.1:$PORT'
  ].join('\n');
}

export function requireArg(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }

  return value;
}

export function parseJsonArg(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid JSON for ${label}`);
  }
}
