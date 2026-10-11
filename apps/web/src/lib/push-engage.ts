export type PushEngageResult = {
  success?: boolean;
  event?: string;
  title?: string | null;
  body?: string | null;
  click_url?: string | null;
  delivery_id?: string | null;
  delivery_name?: string | null;
  error?: string;
  duplicate?: boolean;
};

async function callPushEngage(body: Record<string, unknown>): Promise<PushEngageResult> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!baseUrl || !anonKey) {
    throw new Error('Supabase env not configured');
  }

  const res = await fetch(`${baseUrl}/functions/v1/push-engage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as PushEngageResult;
  if (!res.ok) {
    throw new Error(data.error ?? `push-engage failed (${res.status})`);
  }
  return data;
}

/** Public push tracking — works on /push/open without login. */
export async function logPushEngagement(input: {
  tenantId: string;
  environment: string;
  messageId: string;
  event: 'opened' | 'clicked';
  deliveryId?: string;
  deliveryName?: string;
  journeyId?: string;
}): Promise<PushEngageResult> {
  return callPushEngage({
    tenant_id: input.tenantId,
    environment: input.environment,
    message_id: input.messageId,
    event: input.event,
    delivery_id: input.deliveryId,
    delivery_name: input.deliveryName,
    journey_id: input.journeyId,
  });
}
