import { createClient } from '@clickhouse/client';
import type { QueryParams } from './queries.js';

const client = createClient({
  url: process.env.CLICKHOUSE_URL ?? 'http://clickhouse:8123',
  username: process.env.CLICKHOUSE_USER ?? 'default',
  password: process.env.CLICKHOUSE_PASSWORD ?? '',
  database: process.env.CLICKHOUSE_DB ?? 'default',
});

export async function runQuery<T>(sql: string, params: QueryParams): Promise<T[]> {
  const result = await client.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
  });
  return result.json<T>();
}
