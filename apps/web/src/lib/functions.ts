import { supabase } from './supabase';

export type FunctionCallResult<T = Record<string, unknown>> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
};

function extractBodyError(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === 'string' && err.trim()) return err;
  }
  return undefined;
}

function inferStatus(message: string): number {
  if (message.includes('401') || message.includes('Unauthorized') || message.includes('Invalid JWT')) {
    return 401;
  }
  if (message.includes('503') || message.includes('OPENAI_API_KEY')) return 503;
  if (message.includes('404')) return 404;
  return 500;
}

async function readFunctionErrorBody(error: unknown): Promise<string | undefined> {
  if (!error || typeof error !== 'object' || !('context' in error)) return undefined;
  const ctx = (error as { context?: unknown }).context;
  if (!(ctx instanceof Response)) return undefined;

  try {
    const body = await ctx.clone().json();
    return extractBodyError(body);
  } catch {
    try {
      const text = await ctx.clone().text();
      return text.trim() || undefined;
    } catch {
      return undefined;
    }
  }
}

/** Invoke Edge Function via Supabase client (handles auth + avoids CORS header issues) */
export async function invokeFunction<T = Record<string, unknown>>(
  name: string,
  body: Record<string, unknown>,
): Promise<FunctionCallResult<T>> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  const payload = data as (T & { error?: string }) | null;
  const bodyError = extractBodyError(payload);

  if (error) {
    const responseError = await readFunctionErrorBody(error);
    const raw = error.message ?? String(error);
    const msg = responseError ?? bodyError ?? raw;

    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return {
        ok: false,
        status: 0,
        error:
          `Cannot reach Edge Function "${name}". ` +
          'Deploy the function and turn OFF "Enforce JWT Verification" in Supabase → Edge Functions → Settings.',
      };
    }

    if (raw.includes('non-2xx') && responseError) {
      return {
        ok: false,
        status: inferStatus(responseError),
        error: responseError,
        data: payload ?? undefined,
      };
    }

    if (inferStatus(msg) === 401) {
      return {
        ok: false,
        status: 401,
        error:
          responseError ??
          bodyError ??
          `Edge Function "${name}" returned 401 Unauthorized. ` +
            'In Supabase Dashboard → Edge Functions → Settings: turn OFF "Enforce JWT Verification", then Deploy.',
        data: payload ?? undefined,
      };
    }

    return {
      ok: false,
      status: inferStatus(msg),
      error: msg,
      data: payload ?? undefined,
    };
  }

  if (bodyError) {
    return { ok: false, status: 400, error: bodyError, data: payload ?? undefined };
  }

  return { ok: true, status: 200, data: payload as T };
}
