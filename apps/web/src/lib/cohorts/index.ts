/**
 * AI-native Segment & Cohort builder.
 *
 * Layering, top to bottom:
 *   natural language / visual builder
 *     → ai.ts            (intent → IR, grounded on the catalog)
 *     → catalog.ts       (semantic schema — the only names anything may use)
 *     → ir.ts            (intermediate representation)
 *     → validate.ts      (schema + logic validation, cost estimate)
 *     → compile.ts       (IR → SQL / JSON / English)
 *     → evaluate.ts      (execution, previews, match traces)
 *     → store.ts         (persistence, versions, snapshots)
 */
export * from './ir';
export * from './catalog';
export * from './validate';
export * from './compile';
export * from './evaluate';
export * from './ai';
export * from './templates';
export * from './store';
