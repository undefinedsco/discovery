import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { ModelOverride, ModelQuery, ProviderOverride, RegistryData } from '../types.js';
import { RegistryService } from '../core/registry-service.js';
import { checksumJson } from '../core/utils.js';

export interface ApiServer {
  server: Server;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export interface ApiResult {
  statusCode: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface ApiRequestOptions {
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  adminApiKey?: string;
}

class HttpError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export function createApiServer(registry: RegistryService, adminApiKey?: string): ApiServer {
  const server = createServer((request, response) => {
    void handleNodeRequest(registry, adminApiKey, request, response);
  });

  return {
    server,
    listen(port = 3000, host = '0.0.0.0') {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          const address = server.address();
          resolve(typeof address === 'object' && address ? address.port : port);
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

export async function handleApiRequest(
  registry: RegistryService,
  method: string,
  rawUrl: string,
  options: ApiRequestOptions = {}
): Promise<ApiResult> {
  const isHead = method === 'HEAD';
  const routeMethod = isHead ? 'GET' : method;
  const url = new URL(rawUrl, 'http://localhost');
  const path = url.pathname.replace(/\/$/u, '') || '/';
  const segments = path.split('/').filter(Boolean).map(decodeURIComponent);

  if (routeMethod === 'GET' && path === '/health') {
    return { statusCode: 200, body: isHead ? undefined : { status: 'ok' } };
  }

  if (routeMethod === 'GET' && path === '/registry') {
    const current = await registry.getRegistry();
    return buildCachedResult(current, current, options.headers, isHead);
  }

  if (routeMethod === 'GET' && path === '/registry/version') {
    const current = await registry.getRegistry();
    return buildCachedResult({
      version: current.version,
      generatedAt: current.generatedAt
    }, current, options.headers, isHead);
  }

  if (routeMethod === 'GET' && path === '/sources') {
    const current = await registry.getRegistry();
    return buildCachedResult(current.sources, current, options.headers, isHead);
  }

  if (routeMethod === 'GET' && path === '/stats') {
    const current = await registry.getRegistry();
    return buildCachedResult({
      version: current.version,
      generatedAt: current.generatedAt,
      providerCount: current.providers.length,
      modelCount: current.models.length,
      sourceCount: current.sources.length
    }, current, options.headers, isHead);
  }

  if (routeMethod === 'POST' && path === '/admin/sync/openrouter') {
    assertAdminAuthorized(options.headers, options.adminApiKey);
    const synced = await registry.syncOpenRouter();
    return {
      statusCode: 200,
      body: {
        status: 'ok',
        generatedAt: synced.generatedAt,
        providers: synced.providers.length,
        models: synced.models.length
      }
    };
  }

  if (routeMethod === 'GET' && path === '/admin/overrides/providers') {
    assertAdminAuthorized(options.headers, options.adminApiKey);
    return { statusCode: 200, body: await registry.listProviderOverrides() };
  }

  if (routeMethod === 'GET' && path === '/admin/overrides/models') {
    assertAdminAuthorized(options.headers, options.adminApiKey);
    return { statusCode: 200, body: await registry.listModelOverrides() };
  }

  if (routeMethod === 'PUT' && segments[0] === 'admin' && segments[1] === 'overrides' && segments[2] === 'providers' && segments.length === 4) {
    assertAdminAuthorized(options.headers, options.adminApiKey);
    assertJsonBody(options.body);
    const refreshed = await registry.upsertProviderOverride(segments[3] ?? '', options.body as ProviderOverride);
    return {
      statusCode: 200,
      body: { status: 'ok', refreshedAt: refreshed?.generatedAt ?? null }
    };
  }

  if (routeMethod === 'DELETE' && segments[0] === 'admin' && segments[1] === 'overrides' && segments[2] === 'providers' && segments.length === 4) {
    assertAdminAuthorized(options.headers, options.adminApiKey);
    const refreshed = await registry.deleteProviderOverride(segments[3] ?? '');
    return {
      statusCode: 200,
      body: { status: 'ok', refreshedAt: refreshed?.generatedAt ?? null }
    };
  }

  if (routeMethod === 'PUT' && segments[0] === 'admin' && segments[1] === 'overrides' && segments[2] === 'models' && segments.length === 5) {
    assertAdminAuthorized(options.headers, options.adminApiKey);
    assertJsonBody(options.body);
    const refreshed = await registry.upsertModelOverride(segments[3] ?? '', segments[4] ?? '', options.body as ModelOverride);
    return {
      statusCode: 200,
      body: { status: 'ok', refreshedAt: refreshed?.generatedAt ?? null }
    };
  }

  if (routeMethod === 'DELETE' && segments[0] === 'admin' && segments[1] === 'overrides' && segments[2] === 'models' && segments.length === 5) {
    assertAdminAuthorized(options.headers, options.adminApiKey);
    const refreshed = await registry.deleteModelOverride(segments[3] ?? '', segments[4] ?? '');
    return {
      statusCode: 200,
      body: { status: 'ok', refreshedAt: refreshed?.generatedAt ?? null }
    };
  }

  if (routeMethod === 'GET' && path === '/providers') {
    const current = await registry.getRegistry();
    return buildCachedResult(current.providers, current, options.headers, isHead);
  }

  if (routeMethod === 'GET' && segments[0] === 'providers' && segments.length === 2) {
    const current = await registry.getRegistry();
    const provider = current.providers.find(item => item.id === (segments[1] ?? '')) ?? null;
    return provider
      ? buildCachedResult(provider, current, options.headers, isHead)
      : { statusCode: 404, body: { error: 'Provider not found' } };
  }

  if (routeMethod === 'GET' && segments[0] === 'providers' && segments[2] === 'version' && segments.length === 3) {
    const current = await registry.getRegistry();
    const provider = current.providers.find(item => item.id === (segments[1] ?? '')) ?? null;
    return provider
      ? buildCachedResult({
          providerId: provider.id,
          updatedAt: provider.updatedAt
        }, current, options.headers, isHead)
      : { statusCode: 404, body: { error: 'Provider not found' } };
  }

  if (routeMethod === 'GET' && segments[0] === 'providers' && segments[2] === 'models' && segments.length === 3) {
    const current = await registry.getRegistry();
    const providerId = segments[1] ?? '';
    return buildCachedResult(current.models.filter(model => model.providerId === providerId), current, options.headers, isHead);
  }

  if (routeMethod === 'GET' && segments[0] === 'providers' && segments[2] === 'models' && segments.length === 4) {
    const current = await registry.getRegistry();
    const model = current.models.find(item => item.providerId === (segments[1] ?? '') && item.modelId === (segments[3] ?? '')) ?? null;
    return model
      ? buildCachedResult(model, current, options.headers, isHead)
      : { statusCode: 404, body: { error: 'Model not found' } };
  }

  if (routeMethod === 'GET' && segments[0] === 'providers' && segments[2] === 'models' && segments[4] === 'version' && segments.length === 5) {
    const current = await registry.getRegistry();
    const model = current.models.find(item => item.providerId === (segments[1] ?? '') && item.modelId === (segments[3] ?? '')) ?? null;
    return model
      ? buildCachedResult({
          providerId: model.providerId,
          modelId: model.modelId,
          updatedAt: model.updatedAt
        }, current, options.headers, isHead)
      : { statusCode: 404, body: { error: 'Model not found' } };
  }

  if (routeMethod === 'GET' && segments[0] === 'providers' && segments[2] === 'models' && segments[4] === 'sources' && segments.length === 5) {
    const current = await registry.getRegistry();
    const model = current.models.find(item => item.providerId === (segments[1] ?? '') && item.modelId === (segments[3] ?? ''));
    const sources = model
      ? current.sources.filter(source => model.sourceIds.includes(source.id))
      : [];
    return buildCachedResult(sources, current, options.headers, isHead);
  }

  if (routeMethod === 'GET' && path === '/models') {
    const current = await registry.getRegistry();
    const query = parseModelQuery(url);
    return buildCachedResult(current.models.filter(model => matchesQuery(model, query)), current, options.headers, isHead);
  }

  return { statusCode: 404, body: { error: 'Not found' } };
}

async function handleNodeRequest(
  registry: RegistryService,
  adminApiKey: string | undefined,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  try {
    const body = await readJsonBody(request);
    const result = await handleApiRequest(registry, request.method ?? 'GET', request.url ?? '/', {
      headers: request.headers,
      body,
      adminApiKey
    });
    sendResponse(response, result.statusCode, result.body, result.headers);
  } catch (error) {
    if (error instanceof HttpError) {
      sendResponse(response, error.statusCode, { error: error.message });
      return;
    }

    sendResponse(response, 500, {
      error: error instanceof Error ? error.message : 'Unexpected server error'
    });
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'DELETE' || request.method === 'HEAD') {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return undefined;
  }

  return JSON.parse(raw);
}

function buildCachedResult(
  body: unknown,
  registry: RegistryData,
  requestHeaders?: ApiRequestOptions['headers'],
  omitBody = false
): ApiResult {
  const etag = buildEtag(body, registry.generatedAt);
  const lastModified = new Date(registry.generatedAt).toUTCString();
  const headers = {
    'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    etag,
    'last-modified': lastModified,
    vary: 'Accept, Accept-Encoding'
  };

  if (isNotModified(requestHeaders, etag, registry.generatedAt)) {
    return {
      statusCode: 304,
      body: undefined,
      headers
    };
  }

  return {
    statusCode: 200,
    body: omitBody ? undefined : body,
    headers
  };
}

function buildEtag(body: unknown, generatedAt: string): string {
  return `W/\"${generatedAt}:${checksumJson(body).slice(0, 16)}\"`;
}

function isNotModified(
  headers: ApiRequestOptions['headers'],
  etag: string,
  generatedAt: string
): boolean {
  const ifNoneMatch = headerValue(headers?.['if-none-match']);
  if (ifNoneMatch && ifNoneMatch === etag) {
    return true;
  }

  const ifModifiedSince = headerValue(headers?.['if-modified-since']);
  if (!ifModifiedSince) {
    return false;
  }

  const modifiedSince = Date.parse(ifModifiedSince);
  const updatedAt = Date.parse(generatedAt);

  return Number.isFinite(modifiedSince) && Number.isFinite(updatedAt) && modifiedSince >= updatedAt;
}

function assertAdminAuthorized(headers: ApiRequestOptions['headers'], adminApiKey?: string): void {
  if (!adminApiKey) {
    throw new HttpError(503, 'Admin API is disabled: ADMIN_API_KEY is not configured');
  }

  const xAdminKey = headerValue(headers?.['x-admin-key']);
  const authHeader = headerValue(headers?.authorization);
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const provided = xAdminKey ?? bearer;

  if (!provided || provided !== adminApiKey) {
    throw new HttpError(401, 'Admin authorization failed');
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function assertJsonBody(body: unknown): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Expected a JSON object body');
  }
}

function parseModelQuery(url: URL): ModelQuery {
  const query: ModelQuery = {};

  const provider = url.searchParams.get('provider');
  const capability = url.searchParams.get('capability');
  const inputModality = url.searchParams.get('inputModality');
  const outputModality = url.searchParams.get('outputModality');
  const status = url.searchParams.get('status');
  const releaseStage = url.searchParams.get('releaseStage');
  const q = url.searchParams.get('q');

  if (provider) query.provider = provider;
  if (capability) query.capability = capability;
  if (inputModality) query.inputModality = inputModality;
  if (outputModality) query.outputModality = outputModality;
  if (status) query.status = status as ModelQuery['status'];
  if (releaseStage) query.releaseStage = releaseStage as ModelQuery['releaseStage'];
  if (q) query.q = q;

  return query;
}

function matchesQuery(model: import('../types.js').ModelRecord, query: ModelQuery): boolean {
  if (query.provider && model.providerId !== query.provider) {
    return false;
  }

  if (query.capability && !model.capabilities.includes(query.capability)) {
    return false;
  }

  if (query.inputModality && !model.inputModalities.includes(query.inputModality)) {
    return false;
  }

  if (query.outputModality && !model.outputModalities.includes(query.outputModality)) {
    return false;
  }

  if (query.status && model.status !== query.status) {
    return false;
  }

  if (query.releaseStage && model.releaseStage !== query.releaseStage) {
    return false;
  }

  if (query.q) {
    const needle = query.q.toLowerCase();
    const haystacks = [
      `${model.providerId}/${model.modelId}`,
      model.providerId,
      model.modelId,
      model.name,
      model.family,
      ...model.aliases
    ];
    if (!haystacks.some(value => value.toLowerCase().includes(needle))) {
      return false;
    }
  }

  return true;
}

function sendResponse(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {}
): void {
  if (statusCode === 304 || body === undefined) {
    response.writeHead(statusCode, headers);
    response.end();
    return;
  }

  const payload = JSON.stringify(body, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload).toString(),
    ...headers
  });
  response.end(payload);
}
