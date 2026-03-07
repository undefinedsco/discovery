import type {
  ModelOverride,
  ModelOverrideMap,
  OpenRouterModelsResponse,
  OverridesFile,
  ProviderOverride,
  RegistryData,
  SourceRecord
} from '../types.js';

export interface RegistryStore {
  migrate(): Promise<void>;
  loadRegistry(): Promise<RegistryData | null>;
  saveRegistry(registry: RegistryData): Promise<void>;
  saveOpenRouterSnapshot(source: SourceRecord, payload: OpenRouterModelsResponse): Promise<void>;
  loadLatestOpenRouterSnapshot(): Promise<{ source: SourceRecord; payload: OpenRouterModelsResponse } | null>;
  loadOverrides(): Promise<OverridesFile>;
  listProviderOverrides(): Promise<Record<string, ProviderOverride>>;
  listModelOverrides(): Promise<ModelOverrideMap>;
  upsertProviderOverride(providerId: string, override: ProviderOverride): Promise<void>;
  upsertModelOverride(providerId: string, modelId: string, override: ModelOverride): Promise<void>;
  deleteProviderOverride(providerId: string): Promise<void>;
  deleteModelOverride(providerId: string, modelId: string): Promise<void>;
}
