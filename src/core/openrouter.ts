import { checksumJson, toIsoDate } from './utils.js';
import type { OpenRouterModelsResponse, SourceRecord } from '../types.js';

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

export interface OpenRouterSnapshot {
  response: OpenRouterModelsResponse;
  source: SourceRecord;
}

export async function fetchOpenRouterSnapshot(fetchFn: typeof fetch = fetch): Promise<OpenRouterSnapshot> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const headers: Record<string, string> = {
    accept: 'application/json'
  };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetchFn(OPENROUTER_MODELS_URL, { headers });

  if (!response.ok) {
    throw new Error(`OpenRouter sync failed with ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const payload = validateOpenRouterResponse(json);
  const retrievedAt = toIsoDate(new Date());

  return {
    response: payload,
    source: {
      id: `source:openrouter:${retrievedAt}`,
      kind: 'openrouter-models-api',
      title: 'OpenRouter models API',
      url: OPENROUTER_MODELS_URL,
      retrievedAt,
      checksum: checksumJson(payload),
      upstream: 'openrouter'
    }
  };
}

function validateOpenRouterResponse(value: unknown): OpenRouterModelsResponse {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { data?: unknown }).data)) {
    throw new Error('Invalid OpenRouter response: expected a JSON object with a data array');
  }

  return value as OpenRouterModelsResponse;
}
