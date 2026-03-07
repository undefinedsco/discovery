import type { ModelOverride, ModelRecord, OverridesFile, ProviderRecord } from '../types.js';
import { applyListOverride } from './utils.js';

export function applyOverrides(
  providers: ProviderRecord[],
  models: ModelRecord[],
  overrides: OverridesFile
): { providers: ProviderRecord[]; models: ModelRecord[] } {
  const nextModels: ModelRecord[] = [];

  for (const model of models) {
    const override = getModelOverride(overrides, model.providerId, model.modelId);
    if (override?.hidden) {
      continue;
    }

    let next: ModelRecord = { ...model };

    if (override) {
      next = applyModelOverride(next, override);
    }

    nextModels.push(next);
  }

  const modelCountByProvider = new Map<string, number>();
  for (const model of nextModels) {
    modelCountByProvider.set(model.providerId, (modelCountByProvider.get(model.providerId) ?? 0) + 1);
  }

  const nextProviders = providers
    .map(provider => ({
      ...provider,
      ...(overrides.providers[provider.id] ?? {}),
      modelCount: modelCountByProvider.get(provider.id) ?? 0
    }))
    .filter(provider => provider.modelCount > 0)
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    providers: nextProviders,
    models: nextModels.sort((left, right) => `${left.providerId}/${left.modelId}`.localeCompare(`${right.providerId}/${right.modelId}`))
  };
}

function getModelOverride(overrides: OverridesFile, providerId: string, modelId: string): ModelOverride | undefined {
  return overrides.models[providerId]?.[modelId];
}

function applyModelOverride(model: ModelRecord, override: ModelOverride): ModelRecord {
  return {
    ...model,
    ...(override.name !== undefined ? { name: override.name } : {}),
    ...(override.family !== undefined ? { family: override.family } : {}),
    ...(override.description !== undefined ? { description: override.description } : {}),
    ...(override.status !== undefined ? { status: override.status } : {}),
    ...(override.releaseStage !== undefined ? { releaseStage: override.releaseStage } : {}),
    ...(override.contextWindow !== undefined ? { contextWindow: override.contextWindow } : {}),
    ...(override.maxOutputTokens !== undefined ? { maxOutputTokens: override.maxOutputTokens } : {}),
    aliases: applyListOverride(model.aliases, override.aliases),
    capabilities: applyListOverride(model.capabilities, override.capabilities),
    inputModalities: applyListOverride(model.inputModalities, override.inputModalities),
    outputModalities: applyListOverride(model.outputModalities, override.outputModalities),
    pricing: {
      ...model.pricing,
      ...override.pricing
    },
    metadata: {
      ...model.metadata,
      ...override.metadata
    },
    links: {
      ...model.links,
      ...override.links
    }
  };
}
