import { invokeFunction } from './functions';
import type { FormField } from './forms';
import {
  generateBannerDataUrl,
  uploadBannerDataUrl,
  type FormBanner,
} from './form-design';
import { generateBannerViaOpenAi, generateFormViaOpenAi } from './openai-form';

export type AiFormDraft = {
  name: string;
  description: string;
  fields: FormField[];
  settings: import('./forms').FormSettings;
  schema_mapping: import('./forms').FormSchemaMapping;
  theme: import('./form-design').FormTheme;
  banner: FormBanner;
  banner_prompt?: string;
};

type GenerateOptions = {
  generateBanner?: boolean;
  tenantId?: string;
  environment?: string;
};

const AI_SETUP_HELP =
  'To enable AI form generation, set OPENAI_API_KEY in Supabase Edge Function secrets and deploy form-ai. ' +
  'Deploy the form-ai Edge Function and set OPENAI_API_KEY in Supabase → Edge Functions → Secrets.';

function getClientOpenAiKey(): string | undefined {
  const key = undefined as string | undefined /* SEC-06: AI keys never in the browser — edge functions / ai-gateway only */;
  return key?.trim() || undefined;
}

function formatAiError(raw: string): string {
  if (raw.includes('insufficient_quota') || raw.includes('no credits remaining')) {
    return (
      'Your OpenAI account has no credits left. Add billing at platform.openai.com/settings/organization/billing ' +
      '— then retry AI Studio. You can still create forms using Template or Blank.'
    );
  }
  if (raw.includes('401 Unauthorized') || raw.includes('Enforce JWT Verification')) {
    return raw;
  }
  return raw;
}

async function generateViaEdge(
  prompt: string,
  options?: GenerateOptions,
): Promise<AiFormDraft | null> {
  const edge = await invokeFunction<AiFormDraft>('form-ai', {
    prompt,
    generateBanner: false, // banner generated client-side (avoids edge timeout)
    tenantId: options?.tenantId,
    environment: options?.environment,
  });

  if (edge.ok && edge.data?.fields?.length) {
    return edge.data;
  }

  if (edge.error?.includes('insufficient_quota') || edge.error?.includes('no credits')) {
    throw new Error(formatAiError(edge.error));
  }

  // Edge failed — fall back to local OpenAI if configured
  if (getClientOpenAiKey()) {
    console.warn('[form-ai] Edge function failed, using local OpenAI:', edge.error);
    return null;
  }

  if (edge.error) {
    throw new Error(formatAiError(edge.error));
  }

  return null;
}

async function generateViaClientKey(
  prompt: string,
  options?: GenerateOptions,
): Promise<AiFormDraft> {
  const apiKey = getClientOpenAiKey();
  if (!apiKey) {
    throw new Error(AI_SETUP_HELP);
  }

  const result = await generateFormViaOpenAi(apiKey, prompt, options?.generateBanner ?? true);
  return result;
}

export async function generateFormWithAi(
  prompt: string,
  options?: GenerateOptions,
): Promise<AiFormDraft> {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error('Describe the form you want to create');

  // 1) Supabase Edge Function (production path)
  const fromEdge = await generateViaEdge(trimmed, options);
  if (fromEdge) return fromEdge;

  // 2) (disabled — SEC-06) direct browser OpenAI calls; AI keys never ship to the browser
  const fromClient = await generateViaClientKey(trimmed, options);

  // 3) Generate banner client-side if edge didn't upload one
  if (
    options?.generateBanner &&
    !fromClient.banner.image_url &&
    fromClient.banner_prompt &&
    getClientOpenAiKey()
  ) {
    const apiKey = getClientOpenAiKey()!;
    const tempUrl = await generateBannerViaOpenAi(apiKey, fromClient.banner_prompt);
    if (tempUrl && options.tenantId && options.environment) {
      const uploaded = await uploadBannerFromOpenAiUrl(
        tempUrl,
        options.tenantId,
        options.environment,
        fromClient.name,
      );
      if (uploaded) {
        fromClient.banner = { ...fromClient.banner, enabled: true, image_url: uploaded };
        fromClient.settings = { ...fromClient.settings, banner: fromClient.banner };
      }
    }
  }

  return fromClient;
}

async function uploadBannerFromOpenAiUrl(
  imageUrl: string,
  tenantId: string,
  environment: string,
  formName: string,
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return imageUrl;
    const blob = await res.blob();
    const { supabase } = await import('./supabase');
    const path = `${tenantId}/${environment}/form-banners/${Date.now()}-${formName.replace(/\s+/g, '-').toLowerCase().slice(0, 40)}.png`;

    const { error } = await supabase.storage.from('cdn-public').upload(path, blob, {
      contentType: 'image/png',
      upsert: false,
    });
    if (error) return imageUrl;

    const { data } = supabase.storage.from('cdn-public').getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return imageUrl;
  }
}

export async function generateAndUploadBanner(
  draft: AiFormDraft,
  tenantId: string,
  environment: string,
): Promise<FormBanner> {
  // Already generated by edge function
  if (draft.banner.image_url) {
    return { ...draft.banner, enabled: true };
  }

  const apiKey = getClientOpenAiKey();

  // Try DALL-E if we have a prompt and API key
  if (apiKey && draft.banner_prompt) {
    const tempUrl = await generateBannerViaOpenAi(apiKey, draft.banner_prompt);
    if (tempUrl) {
      const uploaded = await uploadBannerFromOpenAiUrl(tempUrl, tenantId, environment, draft.name);
      if (uploaded) {
        return { ...draft.banner, enabled: true, image_url: uploaded };
      }
    }
  }

  // Fallback: styled SVG banner (not AI image)
  const dataUrl = generateBannerDataUrl(
    draft.banner.headline ?? draft.name,
    draft.banner.subheadline ?? draft.description,
    draft.theme.preset,
  );

  const uploaded = await uploadBannerDataUrl(
    dataUrl,
    tenantId,
    environment,
    draft.name.replace(/\s+/g, '-').toLowerCase(),
  );

  return {
    ...draft.banner,
    enabled: true,
    image_url: uploaded ?? dataUrl,
  };
}

export const AI_FORM_EXAMPLES = [
  'Webinar registration for a fintech conference with company, job title, and dietary preferences',
  'B2B demo request form — work email, company size dropdown, and use case textarea',
  'Restaurant table reservation with date, party size, and special requests',
  'Employee satisfaction survey with department select and anonymous feedback',
  'Real estate lead form with budget range, preferred location, and move-in timeline',
  'Fitness studio membership inquiry with fitness goals and experience level',
];
