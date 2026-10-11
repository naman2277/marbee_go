/** PostgREST select — disambiguate after references_schema_id FK was added in 08 */
export const SCHEMA_WITH_FIELDS_SELECT =
  '*, schema_fields!schema_fields_schema_id_fkey(*)';

export function getSupabaseErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;

  const pg = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };

  const parts = [pg.message, pg.details, pg.hint, pg.code ? `(${pg.code})` : '']
    .filter(Boolean)
    .join(' — ');

  return parts || JSON.stringify(error);
}
