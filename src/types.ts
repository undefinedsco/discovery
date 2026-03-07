export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export interface OpenRouterModel {
  id: string;
  canonical_slug?: string | null;
  hugging_face_id?: string | null;
  name: string;
  created?: number | null;
  description?: string | null;
  context_length?: number | null;
  architecture?: {
    modality?: string | null;
    input_modalities?: string[] | null;
    output_modalities?: string[] | null;
    tokenizer?: string | null;
    instruct_type?: string | null;
  } | null;
  pricing?: Record<string, string | number | null> | null;
  top_provider?: {
    context_length?: number | null;
    max_completion_tokens?: number | null;
    is_moderated?: boolean | null;
  } | null;
  per_request_limits?: Record<string, unknown> | null;
  supported_parameters?: string[] | null;
  default_parameters?: Record<string, unknown> | null;
  expiration_date?: string | null;
}

export interface SourceRecord {
  id: string;
  kind: 'openrouter-models-api';
  title: string;
  url: string;
  retrievedAt: string;
  checksum: string;
  upstream: 'openrouter';
}

export interface ProviderRecord {
  id: string;
  name: string;
  modelCount: number;
  sourceIds: string[];
  homepage?: string;
  docsUrl?: string;
  updatedAt: string;
}

export interface ModelPricing {
  inputUsdPerMillionTokens?: number;
  outputUsdPerMillionTokens?: number;
  inputCacheReadUsdPerMillionTokens?: number;
  webSearchUsdPerRequest?: number;
}

export type ModelStatus = 'active' | 'scheduled-removal' | 'sunset';
export type ReleaseStage = 'stable' | 'preview' | 'beta' | 'alpha' | 'experimental';

export interface ModelLinks {
  openrouter: string;
  huggingFace?: string;
}

export interface ModelMetadata {
  supportedParameters: string[];
  tokenizer?: string;
  instructType?: string;
  modality?: string;
  moderated: boolean;
  createdAt?: string;
  expirationDate?: string;
}

export interface ModelRecord {
  providerId: string;
  modelId: string;
  upstreamId: string;
  upstreamCanonicalSlug?: string;
  name: string;
  family: string;
  aliases: string[];
  description?: string;
  status: ModelStatus;
  releaseStage: ReleaseStage;
  inputModalities: string[];
  outputModalities: string[];
  capabilities: string[];
  contextWindow?: number;
  maxOutputTokens?: number;
  pricing: ModelPricing;
  links: ModelLinks;
  metadata: ModelMetadata;
  sourceIds: string[];
  updatedAt: string;
}

export interface RegistryData {
  version: 1;
  generatedAt: string;
  providers: ProviderRecord[];
  models: ModelRecord[];
  sources: SourceRecord[];
}

export interface ListOverride {
  add?: string[];
  remove?: string[];
  replace?: string[];
}

export interface ProviderOverride {
  name?: string;
  homepage?: string;
  docsUrl?: string;
}

export interface ModelOverride {
  hidden?: boolean;
  name?: string;
  family?: string;
  description?: string;
  status?: ModelStatus;
  releaseStage?: ReleaseStage;
  contextWindow?: number;
  maxOutputTokens?: number;
  aliases?: string[] | ListOverride;
  capabilities?: string[] | ListOverride;
  inputModalities?: string[] | ListOverride;
  outputModalities?: string[] | ListOverride;
  pricing?: Partial<ModelPricing>;
  metadata?: Partial<ModelMetadata>;
  links?: Partial<ModelLinks>;
}

export type ModelOverrideMap = Record<string, Record<string, ModelOverride>>;

export interface OverridesFile {
  providers: Record<string, ProviderOverride>;
  models: ModelOverrideMap;
}

export interface ModelQuery {
  provider?: string;
  capability?: string;
  inputModality?: string;
  outputModality?: string;
  status?: ModelStatus;
  releaseStage?: ReleaseStage;
  q?: string;
}
