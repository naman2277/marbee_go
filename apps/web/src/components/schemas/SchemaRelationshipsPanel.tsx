import { Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { getRelationshipsForSlug, type ErdSchemaInput } from '@/lib/schema-erd';
import type { SchemaFieldRow, FkSchemaOption } from '@/components/schemas/SchemaFieldsEditor';

type Props = {
  slug: string;
  schemaName: string;
  fields?: SchemaFieldRow[];
  fkSchemaOptions?: FkSchemaOption[];
  allSchemas?: ErdSchemaInput[];
};

export function SchemaRelationshipsPanel({ slug, schemaName, fields, fkSchemaOptions = [], allSchemas }: Props) {
  const staticRelationships = getRelationshipsForSlug(slug, allSchemas);

  const customFkRelationships = (fields ?? [])
    .filter((f) => f.references_schema_id)
    .map((f) => {
      const ref = fkSchemaOptions.find((s) => s.id === f.references_schema_id);
      return {
        key: f.id,
        field: f.name,
        relatedSlug: ref?.slug ?? 'unknown',
        relatedLabel: ref?.name ?? 'Unknown schema',
        relatedTable: ref?.table_name ?? '—',
        refField: f.references_field ?? 'id',
      };
    });

  if (!staticRelationships.length && !customFkRelationships.length) {
    return (
      <p className="border-t border-slate-100 px-6 py-4 text-sm text-slate-500">
        No relationships defined yet. Add foreign key fields on the Fields tab to link to other schemas.
      </p>
    );
  }

  return (
    <div className="border-t border-slate-100">
      <div className="px-6 py-4">
        <h3 className="text-sm font-semibold text-slate-900">Relationships</h3>
        <p className="mt-1 text-xs text-slate-500">
          Foreign-key style links for {schemaName}.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-slate-100 text-left text-slate-500">
            <th className="px-6 py-3 font-medium">Direction</th>
            <th className="px-6 py-3 font-medium">Related schema</th>
            <th className="px-6 py-3 font-medium">Link field</th>
            <th className="px-6 py-3 font-medium">Table</th>
          </tr>
        </thead>
        <tbody>
          {staticRelationships.map((rel) => (
            <tr key={`static-${rel.direction}-${rel.relatedSlug}-${rel.field}`} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-6 py-3 text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  {rel.direction === 'outbound' ? (
                    <>
                      <ArrowRight className="h-3.5 w-3.5 text-brand-500" />
                      References
                    </>
                  ) : (
                    <>
                      <ArrowLeft className="h-3.5 w-3.5 text-slate-400" />
                      Referenced by
                    </>
                  )}
                </span>
              </td>
              <td className="px-6 py-3 font-medium">
                <Link to={`/data/schemas/${rel.relatedSlug}`} className="text-brand-600 hover:underline">
                  {rel.relatedLabel}
                </Link>
              </td>
              <td className="px-6 py-3 font-mono text-xs text-slate-600">{rel.field}</td>
              <td className="px-6 py-3 font-mono text-xs text-slate-500">{rel.relatedTable}</td>
            </tr>
          ))}
          {customFkRelationships.map((rel) => (
            <tr key={`custom-${rel.key}`} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-6 py-3 text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <ArrowRight className="h-3.5 w-3.5 text-brand-500" />
                  References
                </span>
              </td>
              <td className="px-6 py-3 font-medium">
                <Link to={`/data/schemas/${rel.relatedSlug}`} className="text-brand-600 hover:underline">
                  {rel.relatedLabel}
                </Link>
              </td>
              <td className="px-6 py-3 font-mono text-xs text-slate-600">
                {rel.field} → {rel.refField}
              </td>
              <td className="px-6 py-3 font-mono text-xs text-slate-500">{rel.relatedTable}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
