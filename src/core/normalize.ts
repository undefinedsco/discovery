import type { ModelMetadata, ModelPricing, ModelRecord, OpenRouterModel, ProviderRecord, SourceRecord } from '../types.js';
import { inferReleaseStage, titleCaseSlug, toIsoDate, toUsdPerMillionTokens, uniqueSorted } from './utils.js';

export function normalizeOpenRouterModels(models: OpenRouterModel[], source: SourceRecord): {
  providers: ProviderRecord[];
  models: ModelRecord[];
} {
  const providerNames = new Map<string, string>();
  const normalizedModels = models.map(model => {
    const normalized = normalizeModel(model, source);
    providerNames.set(normalized.providerId, inferProviderName(model));
    return normalized;
  });

  const providers = buildProviders(normalizedModels, providerNames, source);

  return {
    providers,
    models: normalizedModels.sort(compareModels)
  };
}

function normalizeModel(model: OpenRouterModel, source: SourceRecord): ModelRecord {
  const [providerId, ...rest] = model.id.split('/');
  const upstreamModelId = rest.join('/');

  if (!providerId || !upstreamModelId) {
    throw new Error(`Unexpected OpenRouter model id: ${model.id}`);
  }

  const displayName = model.name.includes(':')
    ? model.name.split(':').slice(1).join(':').trim()
    : model.name;
  const canonicalTail = (model.canonical_slug ?? model.id).split('/').slice(1).join('/');
  const family = stripDateSuffix(canonicalTail || upstreamModelId);
  const modelId = family;
  const inputModalities = uniqueSorted(model.architecture?.input_modalities ?? []);
  const outputModalities = uniqueSorted(model.architecture?.output_modalities ?? []);
  const capabilities = inferCapabilities(model, inputModalities, outputModalities);
  const status = inferStatus(model.expiration_date);
  const pricing = normalizePricing(model.pricing);
  const metadata = buildMetadata(model);
  const aliases = uniqueSorted([
    model.id,
    upstreamModelId,
    modelId,
    model.canonical_slug ?? '',
    displayName,
    model.name
  ]);

  return {
    providerId,
    modelId,
    upstreamId: model.id,
    ...(model.canonical_slug ? { upstreamCanonicalSlug: model.canonical_slug } : {}),
    name: displayName,
    family,
    aliases,
    ...(model.description ? { description: model.description } : {}),
    status,
    releaseStage: inferReleaseStage(model.name, model.canonical_slug ?? model.id),
    inputModalities,
    outputModalities,
    capabilities,
    ...(model.context_length ?? model.top_provider?.context_length
      ? { contextWindow: model.context_length ?? model.top_provider?.context_length ?? undefined }
      : {}),
    ...(model.top_provider?.max_completion_tokens
      ? { maxOutputTokens: model.top_provider.max_completion_tokens }
      : {}),
    pricing,
    links: {
      openrouter: `https://openrouter.ai/${model.id}`,
      ...(model.hugging_face_id
        ? { huggingFace: `https://huggingface.co/${model.hugging_face_id}` }
        : {})
    },
    metadata,
    sourceIds: [source.id],
    updatedAt: source.retrievedAt
  };
}

function buildProviders(models: ModelRecord[], providerNames: Map<string, string>, source: SourceRecord): ProviderRecord[] {
  const byProvider = new Map<string, ProviderRecord>();

  for (const model of models) {
    const current = byProvider.get(model.providerId);
    if (current) {
      current.modelCount += 1;
      current.updatedAt = source.retrievedAt;
      continue;
    }

    byProvider.set(model.providerId, {
      id: model.providerId,
      name: providerNames.get(model.providerId) ?? titleCaseSlug(model.providerId),
      modelCount: 1,
      sourceIds: [source.id],
      updatedAt: source.retrievedAt
    });
  }

  return [...byProvider.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function compareModels(left: ModelRecord, right: ModelRecord): number {
  return `${left.providerId}/${left.modelId}`.localeCompare(`${right.providerId}/${right.modelId}`);
}

function inferCapabilities(model: OpenRouterModel, inputModalities: string[], outputModalities: string[]): string[] {
  const supported = new Set(model.supported_parameters ?? []);
  const capabilities = new Set<string>();

  if (supported.has('tools') || supported.has('tool_choice')) {
    capabilities.add('tool-calling');
  }

  if (supported.has('structured_outputs') || supported.has('response_format')) {
    capabilities.add('structured-output');
  }

  if (supported.has('reasoning') || supported.has('include_reasoning')) {
    capabilities.add('reasoning');
  }

  if (inputModalities.includes('image')) {
    capabilities.add('vision');
  }

  if (inputModalities.includes('audio')) {
    capabilities.add('audio-input');
  }

  if (outputModalities.includes('audio')) {
    capabilities.add('audio-output');
  }

  if (inputModalities.includes('file')) {
    capabilities.add('file-input');
  }

  if (model.top_provider?.is_moderated) {
    capabilities.add('moderated');
  }

  return uniqueSorted(capabilities);
}

function normalizePricing(pricing?: Record<string, string | number | null> | null): ModelPricing {
  const next: ModelPricing = {};
  const input = toUsdPerMillionTokens(pricing?.prompt);
  const output = toUsdPerMillionTokens(pricing?.completion);
  const cacheRead = toUsdPerMillionTokens(pricing?.input_cache_read);
  const webSearch = typeof pricing?.web_search === 'string' || typeof pricing?.web_search === 'number'
    ? Number(pricing.web_search)
    : undefined;

  if (input !== undefined) {
    next.inputUsdPerMillionTokens = input;
  }
  if (output !== undefined) {
    next.outputUsdPerMillionTokens = output;
  }
  if (cacheRead !== undefined) {
    next.inputCacheReadUsdPerMillionTokens = cacheRead;
  }
  if (webSearch !== undefined && Number.isFinite(webSearch)) {
    next.webSearchUsdPerRequest = webSearch;
  }

  return next;
}

function buildMetadata(model: OpenRouterModel): ModelMetadata {
  const metadata: ModelMetadata = {
    supportedParameters: uniqueSorted(model.supported_parameters ?? []),
    moderated: Boolean(model.top_provider?.is_moderated)
  };

  if (model.architecture?.tokenizer) {
    metadata.tokenizer = model.architecture.tokenizer;
  }
  if (model.architecture?.instruct_type) {
    metadata.instructType = model.architecture.instruct_type;
  }
  if (model.architecture?.modality) {
    metadata.modality = model.architecture.modality;
  }
  if (model.created) {
    metadata.createdAt = toIsoDate(model.created * 1000);
  }
  if (model.expiration_date) {
    metadata.expirationDate = model.expiration_date;
  }

  return metadata;
}

function stripDateSuffix(value: string): string {
  return value.replace(/-20\d{6}$/u, '');
}

function inferStatus(expirationDate?: string | null): 'active' | 'scheduled-removal' | 'sunset' {
  if (!expirationDate) {
    return 'active';
  }

  const expiresAt = Date.parse(expirationDate);
  if (Number.isNaN(expiresAt)) {
    return 'active';
  }

  return expiresAt <= Date.now() ? 'sunset' : 'scheduled-removal';
}

function inferProviderName(model: OpenRouterModel): string {
  if (!model.name.includes(':')) {
    const providerId = model.id.split('/')[0] ?? model.id;
    return titleCaseSlug(providerId);
  }

  return model.name.split(':')[0]?.trim() || titleCaseSlug(model.id.split('/')[0] ?? model.id);
}
