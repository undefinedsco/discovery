import { createHash } from 'node:crypto';
import type { ListOverride } from '../types.js';

export function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function checksumJson(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function toIsoDate(value: number | string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

export function titleCaseSlug(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map(token => token[0]?.toUpperCase() + token.slice(1))
    .join(' ');
}

export function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

export function parseNumber(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toUsdPerMillionTokens(value: string | number | null | undefined): number | undefined {
  const parsed = parseNumber(value);
  if (parsed === undefined) {
    return undefined;
  }

  return Number.parseFloat((parsed * 1_000_000).toFixed(6));
}

export function applyListOverride(base: string[], override?: string[] | ListOverride): string[] {
  if (!override) {
    return uniqueSorted(base);
  }

  if (Array.isArray(override)) {
    return uniqueSorted(override);
  }

  const next = new Set(override.replace ? override.replace : base);

  for (const item of override.add ?? []) {
    next.add(item);
  }

  for (const item of override.remove ?? []) {
    next.delete(item);
  }

  return uniqueSorted(next);
}

export function inferReleaseStage(name: string, slug: string): 'stable' | 'preview' | 'beta' | 'alpha' | 'experimental' {
  const haystack = `${name} ${slug}`.toLowerCase();

  if (haystack.includes('preview')) {
    return 'preview';
  }

  if (haystack.includes('beta')) {
    return 'beta';
  }

  if (haystack.includes('alpha')) {
    return 'alpha';
  }

  if (haystack.includes('experimental') || haystack.includes('exp ')) {
    return 'experimental';
  }

  return 'stable';
}
