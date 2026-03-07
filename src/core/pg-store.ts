import type { QueryResult } from 'pg';
import type {
  ModelOverride,
  ModelOverrideMap,
  OpenRouterModelsResponse,
  OverridesFile,
  ProviderOverride,
  RegistryData,
  SourceRecord
} from '../types.js';
import type { RegistryStore } from './store.js';

interface Queryable {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
}

export class PgStore implements RegistryStore {
  constructor(private readonly db: Queryable) {}

  async migrate(): Promise<void> {
    await this.db.query(`
      create table if not exists registry_state (
        key text primary key,
        generated_at timestamptz not null,
        data jsonb not null,
        updated_at timestamptz not null default now()
      );

      create table if not exists upstream_snapshots (
        id text primary key,
        upstream text not null,
        retrieved_at timestamptz not null,
        source jsonb not null,
        payload jsonb not null,
        created_at timestamptz not null default now()
      );

      create table if not exists provider_overrides (
        provider_id text primary key,
        data jsonb not null,
        updated_at timestamptz not null default now()
      );

      create table if not exists model_overrides (
        provider_id text not null,
        model_id text not null,
        data jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (provider_id, model_id)
      );
    `);
  }

  async loadRegistry(): Promise<RegistryData | null> {
    const result = await this.db.query(
      'select data from registry_state where key = $1',
      ['current']
    );

    return (result.rows[0]?.data as RegistryData | undefined) ?? null;
  }

  async saveRegistry(registry: RegistryData): Promise<void> {
    await this.db.query(
      `insert into registry_state (key, generated_at, data, updated_at)
       values ($1, $2::timestamptz, $3::jsonb, now())
       on conflict (key) do update set
         generated_at = excluded.generated_at,
         data = excluded.data,
         updated_at = now()`,
      ['current', registry.generatedAt, JSON.stringify(registry)]
    );
  }

  async saveOpenRouterSnapshot(source: SourceRecord, payload: OpenRouterModelsResponse): Promise<void> {
    await this.db.query(
      `insert into upstream_snapshots (id, upstream, retrieved_at, source, payload)
       values ($1, $2, $3::timestamptz, $4::jsonb, $5::jsonb)
       on conflict (id) do update set
         upstream = excluded.upstream,
         retrieved_at = excluded.retrieved_at,
         source = excluded.source,
         payload = excluded.payload`,
      [source.id, source.upstream, source.retrievedAt, JSON.stringify(source), JSON.stringify(payload)]
    );
  }

  async loadLatestOpenRouterSnapshot(): Promise<{ source: SourceRecord; payload: OpenRouterModelsResponse } | null> {
    const result = await this.db.query(
      `select source, payload
       from upstream_snapshots
       where upstream = $1
       order by retrieved_at desc
       limit 1`,
      ['openrouter']
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      source: row.source as SourceRecord,
      payload: row.payload as OpenRouterModelsResponse
    };
  }

  async loadOverrides(): Promise<OverridesFile> {
    return {
      providers: await this.listProviderOverrides(),
      models: await this.listModelOverrides()
    };
  }

  async listProviderOverrides(): Promise<Record<string, ProviderOverride>> {
    const result = await this.db.query('select provider_id, data from provider_overrides order by provider_id asc');
    const providers: Record<string, ProviderOverride> = {};

    for (const row of result.rows) {
      providers[row.provider_id as string] = row.data as ProviderOverride;
    }

    return providers;
  }

  async listModelOverrides(): Promise<ModelOverrideMap> {
    const result = await this.db.query(
      'select provider_id, model_id, data from model_overrides order by provider_id asc, model_id asc'
    );
    const models: ModelOverrideMap = {};

    for (const row of result.rows) {
      const providerId = row.provider_id as string;
      const modelId = row.model_id as string;
      models[providerId] ??= {};
      models[providerId][modelId] = row.data as ModelOverride;
    }

    return models;
  }

  async upsertProviderOverride(providerId: string, override: ProviderOverride): Promise<void> {
    await this.db.query(
      `insert into provider_overrides (provider_id, data, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (provider_id) do update set
         data = excluded.data,
         updated_at = now()`,
      [providerId, JSON.stringify(override)]
    );
  }

  async upsertModelOverride(providerId: string, modelId: string, override: ModelOverride): Promise<void> {
    await this.db.query(
      `insert into model_overrides (provider_id, model_id, data, updated_at)
       values ($1, $2, $3::jsonb, now())
       on conflict (provider_id, model_id) do update set
         data = excluded.data,
         updated_at = now()`,
      [providerId, modelId, JSON.stringify(override)]
    );
  }

  async deleteProviderOverride(providerId: string): Promise<void> {
    await this.db.query('delete from provider_overrides where provider_id = $1', [providerId]);
  }

  async deleteModelOverride(providerId: string, modelId: string): Promise<void> {
    await this.db.query('delete from model_overrides where provider_id = $1 and model_id = $2', [providerId, modelId]);
  }
}
