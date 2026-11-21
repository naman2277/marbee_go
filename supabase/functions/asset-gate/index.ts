import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, errorResponse } from '../_shared/supabase.ts';
import { tenantIsActive } from '../_shared/tenant-guard.ts';

type AssetRow = {
  id: string;
  tenant_id: string;
  file_path: string;
  mime_type: string | null;
  archived_at: string | null;
  metadata: {
    status?: string;
    valid_from?: string | null;
    valid_until?: string | null;
  };
};

function isAccessible(meta: AssetRow['metadata']): boolean {
  if (meta.status !== 'published') return false;
  const now = Date.now();
  const from = meta.valid_from ? new Date(meta.valid_from).getTime() : null;
  const until = meta.valid_until ? new Date(meta.valid_until).getTime() : null;
  if (from && now < from) return false;
  if (until && now > until) return false;
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return errorResponse('Missing asset id', 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: asset, error } = await supabase
    .from('assets')
    .select('id, tenant_id, file_path, mime_type, archived_at, metadata')
    .eq('id', id)
    .maybeSingle();

  if (error || !asset) return errorResponse('Asset not found', 404);

  const row = asset as AssetRow;
  if (!(await tenantIsActive(supabase, row.tenant_id).catch(() => false))) {
    return errorResponse('Asset is not published or is unavailable', 403);
  }
  if (row.archived_at || !isAccessible(row.metadata ?? {})) {
    return errorResponse('Asset is not published or is unavailable', 403);
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from('assets')
    .download(row.file_path);

  if (downloadError || !file) return errorResponse('File not found in storage', 404);

  const bytes = await file.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders(),
      'Content-Type': row.mime_type ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});
