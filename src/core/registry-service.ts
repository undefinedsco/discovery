import type {
  ModelOverride,
  ModelOverrideMap,
  ModelQuery,
  ModelRecord,
  ProviderOverride,
  ProviderRecord,
  RegistryData,
  SourceRecord
} from '../types.js';
import type { RegistryStore } from './store.js';
import { applyOverrides } from './overrides.js';
import { fetchOpenRouterSnapshot } from './openrouter.js';
import { normalizeOpenRouterModels } from './normalize.js';
import { toIsoDate } from './utils.js';

export interface RegistryServiceOptions {
  store: RegistryStore;
  fetchFn?: typeof fetch;
}

export class RegistryService {
  private readonly store: RegistryStore;
  private readonly fetchFn: typeof fetch;

  constructor(options: RegistryServiceOptions) {
    this.store = options.store;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async initialize(): Promise<void> {
    await this.store.migrate();
  }

  async getRegistry(): Promise<RegistryData> {
    return (await this.store.loadRegistry()) ?? {
      version: 1,
      generatedAt: toIsoDate(new Date()),
      providers: [],
      models: [],
      sources: []
    };
  }

  async syncOpenRouter(): Promise<RegistryData> {
    const snapshot = await fetchOpenRouterSnapshot(this.fetchFn);
    await this.store.saveOpenRouterSnapshot(snapshot.source, snapshot.response);
    return this.persistCuratedRegistry(snapshot.response.data, snapshot.source);
  }

  async refreshFromLatestSnapshot(): Promise<RegistryData | null> {
    const latest = await this.store.loadLatestOpenRouterSnapshot();
    if (!latest) {
      return null;
    }

    return this.persistCuratedRegistry(latest.payload.data, latest.source);
  }

  async getProviders(): Promise<ProviderRecord[]> {
    const registry = await this.getRegistry();
    return registry.providers;
  }

  async getProvider(providerId: string): Promise<ProviderRecord | null> {
    const registry = await this.getRegistry();
    return registry.providers.find(provider => provider.id === providerId) ?? null;
  }

  async getModels(query: ModelQuery = {}): Promise<ModelRecord[]> {
    const registry = await this.getRegistry();
    return registry.models.filter(model => matchesQuery(model, query));
  }

  async getProviderModels(providerId: string): Promise<ModelRecord[]> {
    const registry = await this.getRegistry();
    return registry.models.filter(model => model.providerId === providerId);
  }

  async getModel(providerId: string, modelId: string): Promise<ModelRecord | null> {
    const registry = await this.getRegistry();
    return registry.models.find(model => model.providerId === providerId && model.modelId === modelId) ?? null;
  }

  async getSourcesForModel(providerId: string, modelId: string): Promise<SourceRecord[]> {
    const registry = await this.getRegistry();
    const model = registry.models.find(item => item.providerId === providerId && item.modelId === modelId);

    if (!model) {
      return [];
    }

    return registry.sources.filter(source => model.sourceIds.includes(source.id));
  }

  async listProviderOverrides(): Promise<Record<string, ProviderOverride>> {
    return this.store.listProviderOverrides();
  }

  async listModelOverrides(): Promise<ModelOverrideMap> {
    return this.store.listModelOverrides();
  }

  async upsertProviderOverride(providerId: string, override: ProviderOverride): Promise<RegistryData | null> {
    await this.store.upsertProviderOverride(providerId, override);
    return this.refreshFromLatestSnapshot();
  }

  async upsertModelOverride(providerId: string, modelId: string, override: ModelOverride): Promise<RegistryData | null> {
    await this.store.upsertModelOverride(providerId, modelId, override);
    return this.refreshFromLatestSnapshot();
  }

  async deleteProviderOverride(providerId: string): Promise<RegistryData | null> {
    await this.store.deleteProviderOverride(providerId);
    return this.refreshFromLatestSnapshot();
  }

  async deleteModelOverride(providerId: string, modelId: string): Promise<RegistryData | null> {
    await this.store.deleteModelOverride(providerId, modelId);
    return this.refreshFromLatestSnapshot();
  }

  private async persistCuratedRegistry(models: import('../types.js').OpenRouterModel[], source: SourceRecord): Promise<RegistryData> {
    const normalized = normalizeOpenRouterModels(models, source);
    const overrides = await this.store.loadOverrides();
    const curated = applyOverrides(normalized.providers, normalized.models, overrides);

    const registry: RegistryData = {
      version: 1,
      generatedAt: source.retrievedAt,
      providers: curated.providers,
      models: curated.models,
      sources: [source]
    };

    await this.store.saveRegistry(registry);
    return registry;
  }
}

function matchesQuery(model: ModelRecord, query: ModelQuery): boolean {
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
