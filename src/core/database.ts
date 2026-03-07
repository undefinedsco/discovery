import { Pool } from 'pg';

export function createPgPoolFromEnv(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  return new Pool({
    connectionString,
    max: Number.parseInt(process.env.PGPOOL_MAX ?? '10', 10)
  });
}
