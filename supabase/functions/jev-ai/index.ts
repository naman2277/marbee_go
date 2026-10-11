import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/supabase.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const body = await req.json();
    const apiKey = String(body.api_key ?? '').trim();
    const model = String(body.model ?? 'jev-latest');
    const state = body.state;
    const questions = body.questions;
    const endpoint = String(body.endpoint ?? '/v1/decide');
    const baseUrl = String(body.base_url ?? 'https://jevtypesafeai.com/api').replace(/\/$/, '');

    const effectiveKey = apiKey || Deno.env.get('JEV_API_KEY') || '';
    if (!effectiveKey) {
      return errorResponse('Jev API key not configured. Set JEV_API_KEY secret or pass api_key.', 503);
    }

    if (!state) return errorResponse('state is required', 400);
    if (!questions || typeof questions !== 'object') return errorResponse('questions map is required', 400);

    const url = `${baseUrl}${endpoint}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effectiveKey}`,
      },
      body: JSON.stringify({ model, state, questions }),
    });

    const data = await res.json();

    if (!res.ok) {
      return errorResponse(data.error || data.message || `Jev API returned ${res.status}`, res.status);
    }

    return jsonResponse(data);
  } catch (err: any) {
    return errorResponse(err.message || 'Internal server error', 500);
  }
});
