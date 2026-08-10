/**
 * PostgreSQL v3 wire protocol caps a single statement at 65535 bind
 * parameters. drizzle-orm / postgres-js reserve a few internal params and
 * performance degrades near the ceiling, so we keep each batch under half
 * the limit.
 */
export const PG_MAX_BIND_PARAMS = 65535;
export const PG_SAFE_PARAM_RATIO = 0.5; // stay under half the ceiling

/** Safe rows-per-batch for a table written with `columnCount` columns. */
export function safeBatchSize(columnCount: number): number {
  return Math.max(1, Math.floor((PG_MAX_BIND_PARAMS * PG_SAFE_PARAM_RATIO) / columnCount));
}

/** Split `items` into consecutive chunks of `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error(`chunk size must be >= 1, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
