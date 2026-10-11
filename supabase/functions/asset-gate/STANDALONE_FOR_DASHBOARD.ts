// Deploy as asset-gate in Supabase Dashboard
// Settings: turn OFF "Enforce JWT Verification"
// Serves ONLY published + valid assets from private storage

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AssetRow = {
  id: string;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing asset id' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: asset, error } = await supabase
    .from('assets')
    .select('id, file_path, mime_type, archived_at, metadata')
    .eq('id', id)
    .maybeSingle();

  if (error || !asset) {
    return new Response(JSON.stringify({ error: 'Asset not found' }), {
      status: 404,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const row = asset as AssetRow;
  if (row.archived_at || !isAccessible(row.metadata ?? {})) {
    return new Response(JSON.stringify({ error: 'Asset is not published or is unavailable' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from('assets')
    .download(row.file_path);

  if (downloadError || !file) {
    return new Response(JSON.stringify({ error: 'File not found in storage' }), {
      status: 404,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const bytes = await file.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': row.mime_type ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});
