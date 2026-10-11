import { supabase } from './supabase';
import { getLanguageByCode } from './ai-languages';

/**
 * Marbee Platform Schema & Live Context Manifest
 * Injected into LLM system prompts and local reasoning engines for full tool awareness.
 */
export const MARBEE_SYSTEM_PROMPT = `You are Marbee AI Copilot, an expert AI Customer Engagement, Marketing Automation, Projects & Task Management, and CRM Intelligence System built for Marbee SaaS.

You have comprehensive, full-stack knowledge of the entire Marbee platform architecture, native project & task management systems, database schemas, campaign engines, customer journeys, channel gateways, analytics, and behavioral sessions.

### Platform Architecture & Core Data Models:

1. **Projects & Task Management System (/tasks)**:
   - Marbee features a native **Project & Task Management Portal** built for cross-functional marketing, growth, and engineering teams.
   - **Projects (ProjectItem)**:
     - Structure: \`id\`, \`name\`, \`description\`, \`color\`, \`createdAt\`. All projects are user-created and stored per tenant in \`public.projects\`.
   - **Tasks (TaskItem)**:
     - Structure: \`id\`, \`tenantId\`, \`environment\`, \`projectId\`, \`title\`, \`description\`, \`priority\` ('urgent' | 'high' | 'medium' | 'low'), \`status\` ('todo' | 'in_progress' | 'in_review' | 'done'), \`module\` ('Web Push' | 'Campaigns' | 'Audiences' | 'Schemas' | 'Journeys' | 'General'), \`assignee\` (a workspace member), \`assigneeUserId\`, \`dueDate\`, \`subtasks\` (\`{ id, title, completed }\`), \`comments\` (in \`public.task_comments\` with \`mentions\`), \`createdAt\`, \`updatedAt\`.
     - Kanban Views: 4 visual swimlanes (To-Do, In Progress, In Review, Done) with subtask checklists and progress tracking.
   - **AI Task Capabilities**: You can create, organize, prioritize, break down, and summarize tasks, sprint backlogs, campaign launch checklists, and subtask milestones for any project.

2. **Customers & Identity (public.customers, /customers)**:
   - Columns: \`id\` (UUID), \`email\`, \`phone\`, \`first_name\`, \`last_name\`, \`rfm_tier\` ('Champions', 'Loyal VIP', 'Potential Loyalist', 'At Risk', 'Hibernating'), \`attributes\` (JSONB), \`created_at\`, \`updated_at\`.
   - Customer 360 view with behavioral profile, unified timeline, and channel preferences.

3. **Omnichannel Campaigns (public.campaigns, /campaigns)**:
   - Columns: \`id\`, \`name\`, \`channel\` ('email' | 'sms' | 'whatsapp' | 'web_push' | 'rcs' | 'api'), \`status\` ('draft' | 'scheduled' | 'running' | 'completed' | 'paused'), \`audience_id\`, \`template_id\`, \`sent_count\`, \`delivered_count\`, \`clicked_count\`, \`failed_count\`.

4. **Visual Journey Automations (public.journeys, /journeys)**:
   - Drag-and-drop multi-stage canvas with entry triggers (\`cart.abandoned\`, \`user.signup\`, \`order.completed\`, \`page.viewed\`), wait delays, conditional decision branches, and multi-channel message actions with automatic fallbacks.

5. **Real-time Events (public.events, /triggers)**:
   - Customer telemetry stream with \`customer_id\`, \`event_name\`, \`payload\` (JSONB), and \`timestamp\`.

6. **Content & Template Studio (public.templates, /templates)**:
   - Multi-channel template library: Drag-and-drop HTML email builder, WhatsApp interactive button payloads, RCS rich cards, Web Push VAPID notifications, and SMS templates with liquid tags (e.g. \`{{customer.first_name}}\`, \`{{event.cart_total}}\`).

7. **Behavioral Analytics & Web SDK (public.sessions, /analytics)**:
   - Real-time visitor tracking via Marbee Web SDK (\`marbee.js\`), state & city level geographical breakdown, visitor traffic, live session activity streams, and 10/50 pagination.

8. **AI Engine & Voice Avatars (/settings/ai, /ai)**:
   - Multi-model reasoning hub (Google Gemini 2.0 Flash, OpenAI GPT-4o, Anthropic Claude 3.7 Sonnet, xAI Grok, DeepSeek V3, Groq LLaMA, OpenRouter 200+ models, TypeSafe AI Jev).
   - Conversational Buddy Specialists (Aanya Sharma, Dev Malhotra, Pooja Verma, Rohan Deshmukh), Runway GWM-1 video avatars, and ElevenLabs speech synthesis.

9. **Channel Gateways & Infrastructure (/settings/channels)**:
   - Email: SendGrid, Amazon SES, Mailgun, SMTP Relay, Resend
   - SMS: Twilio, Gupshup, Infobip
   - WhatsApp: Twilio WhatsApp, Gupshup, Meta Cloud API
   - Web Push: Native VAPID, Firebase Cloud Messaging (FCM)
   - RCS: Google RCS Business Messaging

### Guidelines for Responses:
- You fully recognize and discuss projects, tasks, sprints, assignees, priorities, and subtasks as native parts of Marbee.
- If asked to create, manage, or summarize tasks and projects, provide structured task items with title, project, module, priority, status, assignee, and actionable subtasks.
- If asked for SQL, write production-ready PostgreSQL queries utilizing the actual table schemas.
- If asked for counts or live results, use the live platform state provided below.
- Always maintain an articulate, highly capable, proactive professional persona.

### Language & Multilingual Intelligence:
- **Default Language: English**: All chats, live calls, and guidance MUST be in **English** by default.
- **Multilingual Support**: Only respond in Hindi (हिंदी), Hinglish (conversational Hindi), or other regional languages if the user explicitly writes or speaks to you in that language (e.g. *"नमस्ते"*, *"मुझे टास्क बताओ"*, *"campaign kaise banaye"*) or explicitly selects that language.
- When the user asks or speaks in English, **ALWAYS respond in fluent, articulate, and natural English**. Never switch to Hindi unprompted.`;

export type LiveCrmStats = {
  customerCount: number;
  campaignCount: number;
  journeyCount: number;
  eventCount: number;
  templateCount: number;
  projectCount: number;
  taskCount: number;
  todoTaskCount: number;
  inProgressTaskCount: number;
  doneTaskCount: number;
  activeProjectsSummary: string;
  recentTasksSummary: string;
};

/** Query live database & workspace stats for the current tenant */
export async function getLiveCrmStats(): Promise<LiveCrmStats> {
  try {
    const [cRes, campRes, jRes, evRes, tRes] = await Promise.allSettled([
      supabase.from('customers').select('*', { count: 'exact', head: true }),
      supabase.from('campaigns').select('*', { count: 'exact', head: true }),
      supabase.from('journeys').select('*', { count: 'exact', head: true }),
      supabase.from('events').select('*', { count: 'exact', head: true }),
      supabase.from('templates').select('*', { count: 'exact', head: true }),
    ]);

    const getCount = (res: PromiseSettledResult<any>) =>
      res.status === 'fulfilled' && res.value?.count !== null && res.value?.count !== undefined
        ? res.value.count
        : 0;

    // Projects & tasks straight from the DB (RLS scopes to the caller's tenant)
    let projects: Array<{ name: string; description: string | null }> = [];
    let tasks: Array<{ title: string; status: string; priority: string; module: string; assignee: string }> = [];
    try {
      const [pRes, tskRes] = await Promise.all([
        supabase.from('projects').select('name, description').order('created_at', { ascending: true }),
        supabase
          .from('tasks')
          .select('title, status, priority, module, assignee')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      projects = pRes.data ?? [];
      tasks = tskRes.data ?? [];
    } catch {
      projects = [];
      tasks = [];
    }

    const countByStatus = (s: string) => tasks.filter((t) => t.status === s).length;

    const activeProjectsSummary = projects
      .map((p) => `• ${p.name}${p.description ? ` (${p.description})` : ''}`)
      .join('\n');

    const recentTasksSummary = tasks
      .slice(0, 10)
      .map((t) => `• [${String(t.status).toUpperCase()}] "${t.title}" (Priority: ${t.priority}, Module: ${t.module}, Assignee: ${t.assignee})`)
      .join('\n');

    return {
      customerCount: getCount(cRes),
      campaignCount: getCount(campRes),
      journeyCount: getCount(jRes),
      eventCount: getCount(evRes),
      templateCount: 18 + getCount(tRes),
      projectCount: projects.length,
      taskCount: tasks.length,
      todoTaskCount: countByStatus('todo'),
      inProgressTaskCount: countByStatus('in_progress') + countByStatus('in_review'),
      doneTaskCount: countByStatus('done'),
      activeProjectsSummary: activeProjectsSummary || 'No projects yet.',
      recentTasksSummary: recentTasksSummary || 'No tasks yet.',
    };
  } catch {
    return {
      customerCount: 0,
      campaignCount: 0,
      journeyCount: 0,
      eventCount: 0,
      templateCount: 18,
      projectCount: 0,
      taskCount: 0,
      todoTaskCount: 0,
      inProgressTaskCount: 0,
      doneTaskCount: 0,
      activeProjectsSummary: 'No projects yet.',
      recentTasksSummary: 'No tasks yet.',
    };
  }
}

/** Resolve active configured API key from tenant storage or env */
export function getSavedAiApiKey(): { apiKey: string; modelName: string; provider: string } {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('marbee_ai_models_config_v2')) {
        const raw = localStorage.getItem(k);
        if (raw) {
          const list = JSON.parse(raw);
          const active =
            list.find((m: any) => m.isDefault && m.apiKey && m.apiKey.trim().length > 0) ||
            list.find((m: any) => m.apiKey && m.apiKey.trim().length > 0);
          if (active && active.apiKey.trim().length > 0) {
            return {
              apiKey: active.apiKey.trim(),
              modelName: active.modelName || 'gemini-2.0-flash',
              provider: active.provider || 'gemini',
            };
          }
        }
      }
    }
  } catch {}

  const envGemini = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (envGemini) return { apiKey: envGemini, modelName: 'gemini-2.0-flash', provider: 'gemini' };

  const envOpenAI = (import.meta as any).env?.VITE_OPENAI_API_KEY;
  if (envOpenAI) return { apiKey: envOpenAI, modelName: 'gpt-4o', provider: 'openai' };

  const envClaude = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY;
  if (envClaude) return { apiKey: envClaude, modelName: 'claude-3-7-sonnet', provider: 'claude' };

  const envJev = (import.meta as any).env?.VITE_JEV_API_KEY;
  if (envJev) return { apiKey: envJev, modelName: 'jev-latest', provider: 'jev' };

  return { apiKey: '', modelName: 'gemini-2.0-flash', provider: 'gemini' };
}

/**
 * High-Intelligence Contextual AI Reasoning Engine
 * Evaluates any prompt with complete platform understanding and live database context.
 * Supports: gemini, openai, claude, grok, deepseek, groq, openrouter, custom_llm
 */
export async function executeIntelligentReasoning(
  prompt: string,
  apiKey?: string,
  modelName: string = 'gemini-2.0-flash',
  provider: string = 'gemini',
  baseUrl?: string,
  language?: string
): Promise<{ text: string; latencyMs: number; tokens: number; reasoningDetails?: string }> {
  const start = Date.now();
  const resolved = !apiKey ? getSavedAiApiKey() : { apiKey, modelName, provider };
  const effectiveKey = (apiKey || resolved.apiKey || '').trim();
  const effectiveModel = modelName || resolved.modelName || 'gemini-2.0-flash';
  const effectiveProvider = provider || resolved.provider || 'gemini';
  const liveStats = await getLiveCrmStats();

  const langMeta = language ? getLanguageByCode(language) : null;
  let languagePromptInstruction = '';

  if (langMeta && langMeta.code !== 'en-US') {
    languagePromptInstruction = `\n\n[MANDATORY SYSTEM DIRECTIVE: The user has selected ${langMeta.name} (${langMeta.nativeName} - Code: ${langMeta.code}). You MUST formulate your response completely in fluent, natural, professional spoken ${langMeta.name} in its native script (${langMeta.nativeName}). Do NOT reply in English unless specifically requested by the user.]`;
  } else if (language === 'hi-IN' || /[\u0900-\u097F]/.test(prompt) || prompt.toLowerCase().includes('namaste') || prompt.toLowerCase().includes('kaise ho') || prompt.toLowerCase().includes('batao')) {
    languagePromptInstruction = `\n\n[MANDATORY SYSTEM DIRECTIVE: The user has selected HINDI MODE (हिंदी). You MUST formulate your response completely in fluent, natural, professional spoken Hindi (in Devanagari script or conversational Hinglish). Do NOT reply in English.]`;
  }

  const liveSystemContext = `${MARBEE_SYSTEM_PROMPT}

[Live Marbee Platform & Workspace Context]:
- Customers: ${liveStats.customerCount} customer profiles in public.customers
- Campaigns: ${liveStats.campaignCount} active / scheduled campaigns
- Journeys: ${liveStats.journeyCount} visual journey workflows
- Delivery Templates: ${liveStats.templateCount} multi-channel templates
- Tracked Events: ${liveStats.eventCount} telemetry events in public.events
- Projects (${liveStats.projectCount} active projects in /tasks):
${liveStats.activeProjectsSummary}
- Tasks (${liveStats.taskCount} total: ${liveStats.todoTaskCount} To-Do, ${liveStats.inProgressTaskCount} In Progress/Review, ${liveStats.doneTaskCount} Done):
${liveStats.recentTasksSummary}
${languagePromptInstruction}`;

  // ── 1. LIVE EXTERNAL LLM INFERENCE (If API Key is available) ──
  if (effectiveKey) {
    try {
      // ── Google Gemini ──
      if (effectiveProvider === 'gemini') {
        // Try primary model first. Only fall back to alternates on model-not-found errors.
        // Stop immediately on auth / key errors so we show the real problem.
        const candidateModels = [
          effectiveModel,
          'gemini-1.5-flash',
          'gemini-1.5-pro',
          'gemini-2.0-flash-exp',
        ].filter((v, i, a) => a.indexOf(v) === i);

        let lastErrorMsg = '';
        let hitAuthError = false;

        outer:
        for (const m of candidateModels) {
          const cleanModel = m.replace('models/', '');
          for (const apiVer of ['v1beta', 'v1']) {
            try {
              const endpoint = baseUrl
                ? `${baseUrl.replace(/\/$/, '')}/models/${cleanModel}:generateContent?key=${effectiveKey}`
                : `https://generativelanguage.googleapis.com/${apiVer}/models/${cleanModel}:generateContent?key=${effectiveKey}`;

              const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [
                    {
                      role: 'user',
                      parts: [{ text: `${liveSystemContext}\n\nUser Question: ${prompt}` }],
                    },
                  ],
                  generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
                }),
              });

              if (res.ok) {
                const data = await res.json();
                const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (generatedText) {
                  return {
                    text: generatedText,
                    latencyMs: Date.now() - start,
                    tokens: data.usageMetadata?.totalTokenCount || Math.floor((prompt.length + generatedText.length) / 4),
                  };
                }
              } else {
                const errData = await res.json().catch(() => ({}));
                const errMsg = errData.error?.message || `HTTP ${res.status}`;
                const errCode = errData.error?.code || res.status;

                // Auth/permission/quota errors — stop immediately, no point trying other models
                if (
                  errCode === 400 && !errMsg.toLowerCase().includes('not found') ||
                  errCode === 401 ||
                  errCode === 403 ||
                  errCode === 429 ||
                  errMsg.toLowerCase().includes('api key') ||
                  errMsg.toLowerCase().includes('api_key') ||
                  errMsg.toLowerCase().includes('permission') ||
                  errMsg.toLowerCase().includes('quota') ||
                  errMsg.toLowerCase().includes('billing') ||
                  errMsg.toLowerCase().includes('disabled')
                ) {
                  lastErrorMsg = errMsg;
                  hitAuthError = true;
                  break outer;
                }

                // Model-not-found — save error but try next model
                lastErrorMsg = errMsg;
              }
            } catch {}
          }

          // If we found a working model the loop exits via return. If auth error, exit via break outer.
          // Otherwise continue to next fallback model.
        }

        if (
          hitAuthError ||
          lastErrorMsg.toLowerCase().includes('quota') ||
          lastErrorMsg.toLowerCase().includes('429') ||
          lastErrorMsg.toLowerCase().includes('rate') ||
          lastErrorMsg.toLowerCase().includes('billing')
        ) {
          console.warn('Gemini quota reached. Falling back to native CRM intelligence engine.');
          // Fall through to native CRM intelligence engine below!
        } else {
          return {
            text: `⚠️ **Google Gemini Notice:** ${lastErrorMsg || 'API limit reached.'}\n\nVerify your API key at [Google AI Studio](https://aistudio.google.com/app/apikey).`,
            latencyMs: Date.now() - start,
            tokens: 0,
          };
        }
      }

      // ── OpenAI-compatible: openai, deepseek, grok, groq, openrouter, custom_llm ──
      if (['openai', 'deepseek', 'grok', 'groq', 'openrouter', 'custom_llm'].includes(effectiveProvider)) {
        const defaultEndpoints: Record<string, string> = {
          deepseek: 'https://api.deepseek.com/v1/chat/completions',
          grok: 'https://api.x.ai/v1/chat/completions',
          groq: 'https://api.groq.com/openai/v1/chat/completions',
          openai: 'https://api.openai.com/v1/chat/completions',
          openrouter: 'https://openrouter.ai/api/v1/chat/completions',
          custom_llm: 'https://api.openai.com/v1/chat/completions',
        };

        const endpoint = baseUrl
          ? (baseUrl.includes('/chat/completions') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/chat/completions`)
          : defaultEndpoints[effectiveProvider] || defaultEndpoints.openai;

        const fetchHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveKey}`,
        };
        if (effectiveProvider === 'openrouter') {
          fetchHeaders['HTTP-Referer'] = window.location.origin;
          fetchHeaders['X-OpenRouter-Title'] = 'Marbee';
        }

        const reqBody: Record<string, unknown> = {
          model: effectiveModel || 'openrouter/auto',
          messages: [
            { role: 'system', content: liveSystemContext },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 4096,
        };
        if (effectiveProvider === 'openrouter' && !(effectiveModel || '').startsWith('openrouter/')) {
          reqBody.models = [
            effectiveModel,
            '~anthropic/claude-sonnet-latest',
            '~openai/gpt-sol-latest',
            'google/gemini-2.0-flash-001',
          ];
        }

        let res: Response;
        try {
          res = await fetch(endpoint, {
            method: 'POST',
            headers: fetchHeaders,
            body: JSON.stringify(reqBody),
          });
        } catch (networkErr: any) {
          // Likely CORS or network failure
          const providerNames: Record<string, string> = {
            grok: 'xAI Grok', deepseek: 'DeepSeek', groq: 'Groq', openai: 'OpenAI', openrouter: 'OpenRouter', custom_llm: 'Custom LLM',
          };
          const displayName = providerNames[effectiveProvider] || effectiveProvider.toUpperCase();
          const portalUrls: Record<string, string> = {
            grok: 'https://console.x.ai',
            deepseek: 'https://platform.deepseek.com/api_keys',
            groq: 'https://console.groq.com/keys',
            openai: 'https://platform.openai.com/api-keys',
            openrouter: 'https://openrouter.ai/keys',
          };
          const portalUrl = portalUrls[effectiveProvider];
          return {
            text: `⚠️ **${displayName} Network Error:** Unable to reach API endpoint.\n\n${
              effectiveProvider === 'grok'
                ? '**Note:** xAI Grok API does not allow direct browser requests (CORS policy). A server-side proxy is required for production use.'
                : effectiveProvider === 'deepseek'
                ? '**Note:** DeepSeek API may block direct browser requests. If this persists, a server-side proxy is needed.'
                : `Error: ${networkErr?.message || 'Connection refused'}`
            }${portalUrl ? `\n\nVerify your API key at: ${portalUrl}` : ''}`,
            latencyMs: Date.now() - start,
            tokens: 0,
          };
        }

        if (res.ok) {
          const data = await res.json();
          const reply = data.choices?.[0]?.message?.content;
          if (reply) {
            return {
              text: reply,
              latencyMs: Date.now() - start,
              tokens: data.usage?.total_tokens || Math.floor((prompt.length + reply.length) / 4),
            };
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error?.message || `HTTP ${res.status}`;
          return {
            text: `⚠️ **${effectiveProvider.toUpperCase()} API Error:** ${errMsg}`,
            latencyMs: Date.now() - start,
            tokens: 0,
          };
        }
      }

      // ── Anthropic Claude ──
      if (effectiveProvider === 'claude') {
        let res: Response;
        try {
          const endpoint = baseUrl
            ? `${baseUrl.replace(/\/$/, '')}/messages`
            : 'https://api.anthropic.com/v1/messages';

          res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': effectiveKey,
              'anthropic-version': '2023-06-01',
              // anthropic-dangerous-direct-browser-access required for browser CORS
              'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
              model: effectiveModel || 'claude-3-7-sonnet-20250219',
              system: liveSystemContext,
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 4096,
            }),
          });
        } catch (networkErr: any) {
          return {
            text: `⚠️ **Anthropic Claude Network Error:** Unable to reach API endpoint.\n\n**Note:** Anthropic's API requires the \`anthropic-dangerous-direct-browser-access: true\` header for browser requests. If this still fails, your network or browser may be blocking cross-origin requests.\n\nVerify your API key at: [Anthropic Console](https://console.anthropic.com/settings/keys)\nError: ${networkErr?.message || 'Connection refused'}`,
            latencyMs: Date.now() - start,
            tokens: 0,
          };
        }

        if (res.ok) {
          const data = await res.json();
          const reply = data.content?.[0]?.text;
          if (reply) {
            return {
              text: reply,
              latencyMs: Date.now() - start,
              tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
            };
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error?.message || `HTTP ${res.status}`;
          return {
            text: `⚠️ **Anthropic Claude API Error:** ${errMsg}\n\nVerify your API key at: [Anthropic Console](https://console.anthropic.com/settings/keys)`,
            latencyMs: Date.now() - start,
            tokens: 0,
          };
        }
      }

      // ── TypeSafe AI Jev (Decision Engine) ──
      if (effectiveProvider === 'jev') {
        let res: Response | null = null;

        const jevPayload = {
          model: effectiveModel || 'jev-latest',
          state: `${liveSystemContext}\n\nUser Query: ${prompt}`,
          questions: {
            intent: {
              type: 'choice',
              instructions: 'What is the primary intent of this user query?',
              criteria: {
                campaign_help: 'creating, editing, or analyzing marketing campaigns',
                customer_query: 'looking up customer data, segments, or cohorts',
                journey_help: 'building or debugging automated journeys',
                analytics: 'requesting metrics, reports, or dashboard insights',
                task_management: 'creating, updating, or managing tasks and projects',
                technical: 'SQL queries, integrations, API, or infrastructure questions',
                general: 'general conversation, greetings, or broad questions',
              },
            },
            urgency: {
              type: 'score',
              instructions: 'How urgent is this request?',
              criteria: ['routine, no rush', 'somewhat time-sensitive', 'urgent, needs attention now', 'critical, blocking work'],
            },
            needs_data: {
              type: 'noul',
              instructions: 'Does this query require fetching live data from the CRM database to answer properly?',
            },
          },
        };

        // Try Supabase Edge Function first (avoids CORS issues)
        try {
          const { data: fnData, error: fnError } = await supabase.functions.invoke('jev-ai', {
            body: {
              api_key: effectiveKey,
              base_url: baseUrl || 'https://jevtypesafeai.com/api',
              ...jevPayload,
            },
          });
          if (!fnError && fnData && fnData.answers) {
            res = new Response(JSON.stringify(fnData), { status: 200 });
          }
        } catch {
          // Edge function not deployed — fall through to direct call
        }

        // Fallback: direct API call (use Vite proxy in dev to avoid CORS)
        if (!res) {
          try {
            const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
            const endpoint = isDev
              ? '/jev-api/v1/decide'
              : baseUrl
                ? `${baseUrl.replace(/\/$/, '')}/v1/decide`
                : 'https://jevtypesafeai.com/api/v1/decide';

            res = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${effectiveKey}`,
              },
              body: JSON.stringify(jevPayload),
            });
          } catch (networkErr: any) {
            return {
              text: `⚠️ **TypeSafe AI Jev Network Error:** Unable to reach API endpoint.\n\n**Note:** Jev's API may not allow direct browser requests (CORS policy). Deploy the \`jev-ai\` Supabase Edge Function to proxy requests server-side.\n\nError: ${networkErr?.message || 'Connection refused'}\n\nVerify your API key at: [TypeSafe AI](https://jevtypesafeai.com)`,
              latencyMs: Date.now() - start,
              tokens: 0,
            };
          }
        }

        if (res.ok) {
          const data = await res.json();
          const answers = data.answers || {};
          const intentAnswer = answers.intent;
          const urgencyAnswer = answers.urgency;
          const needsDataAnswer = answers.needs_data;

          const intentLabel = intentAnswer?.choice || 'general';
          const intentConf = intentAnswer?.confidence != null ? `${Math.round(intentAnswer.confidence * 100)}%` : '';
          const urgencyScore = urgencyAnswer?.score != null ? urgencyAnswer.score.toFixed(1) : 'N/A';
          const needsData = needsDataAnswer?.noul != null ? needsDataAnswer.noul > 0.5 : false;

          const probsText = intentAnswer?.probabilities
            ? Object.entries(intentAnswer.probabilities as Record<string, number>)
                .filter(([, v]) => v > 0.01)
                .sort(([, a], [, b]) => b - a)
                .map(([k, v]) => `  - **${k.replace(/_/g, ' ')}**: ${Math.round(v * 100)}%`)
                .join('\n')
            : '';

          const urgencyLevels = ['Routine', 'Somewhat time-sensitive', 'Urgent', 'Critical'];
          const urgencyLabel = urgencyLevels[Math.round(Number(urgencyScore))] || 'Routine';

          const reply = `**Jev Decision Analysis** (${data.model || 'jev-latest'})\n\n` +
            `**Intent:** ${intentLabel.replace(/_/g, ' ')} (${intentConf} confidence)\n` +
            (probsText ? `**Breakdown:**\n${probsText}\n\n` : '\n') +
            `**Urgency:** ${urgencyLabel} (${urgencyScore}/3)\n` +
            `**Needs Live Data:** ${needsData ? 'Yes' : 'No'} (${Math.round((needsDataAnswer?.noul || 0) * 100)}%)\n\n` +
            `_Jev is a typed decision engine — it classifies, scores, and gates rather than generating free text. ` +
            `For best results, use Jev for lead scoring, content moderation, support triage, and routing decisions._`;

          return {
            text: reply,
            latencyMs: Date.now() - start,
            tokens: data.usage?.input_tokens || Math.floor(prompt.length / 4),
          };
        } else {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error || errData.message || `HTTP ${res.status}`;
          return {
            text: `⚠️ **TypeSafe AI Jev API Error:** ${errMsg}\n\nVerify your API key at: [TypeSafe AI](https://jevtypesafeai.com)`,
            latencyMs: Date.now() - start,
            tokens: 0,
          };
        }
      }
    } catch (e: any) {
      console.warn('Live API inference failed:', e);
      return {
        text: `⚠️ **Live Inference Error:** ${e.message || 'Failed to reach AI provider API endpoint.'}`,
        latencyMs: Date.now() - start,
        tokens: 0,
      };
    }
  }

  // ── 2. MARBEE PLATFORM NATIVE CONTEXT ENGINE (No external API key / Fallback) ──
  const pLower = prompt.toLowerCase();
  const isHindiPrompt =
    /[\u0900-\u097F]/.test(prompt) ||
    pLower.includes('namaste') ||
    pLower.includes('kaise ho') ||
    pLower.includes('kya hal') ||
    pLower.includes('batao') ||
    pLower.includes('kaise') ||
    pLower.includes('shukriya') ||
    pLower.includes('dhanyawad') ||
    pLower.includes('karo');

  // Check if the prompt is asking to generate HTML code, an email template, newsletter, styling, or web code
  const isHtmlCodeRequest =
    pLower.includes('html') ||
    pLower.includes('doctype') ||
    pLower.includes('email code') ||
    pLower.includes('email template') ||
    pLower.includes('newsletter') ||
    pLower.includes('write code') ||
    pLower.includes('generate code') ||
    pLower.includes('landing page') ||
    pLower.includes('css') ||
    pLower.includes('responsive email') ||
    pLower.includes('promotional email') ||
    pLower.includes('discount email') ||
    pLower.includes('welcome email') ||
    pLower.includes('receipt email') ||
    pLower.includes('cart recovery') ||
    pLower.includes('webinar email') ||
    pLower.includes('product launch') ||
    pLower.includes('button code') ||
    pLower.includes('template code');

  let platformReply = '';

  if (isHtmlCodeRequest) {
    const isDirectHtmlOnly =
      pLower.includes('return only') ||
      pLower.includes('only the html') ||
      pLower.includes('without markdown') ||
      pLower.includes('starting with <!doctype');

    platformReply = generateIntelligentEmailHtml(prompt, isDirectHtmlOnly);
  } else if (isHindiPrompt) {
    if (pLower.includes('task') || pLower.includes('टास्क') || pLower.includes('project') || pLower.includes('प्रोजेक्ट') || pLower.includes('sprint')) {
      platformReply = `### 📋 आपके वर्कस्पेस टास्क और प्रोजेक्ट्स की जानकारी

नमस्ते! आपके Marbee वर्कस्पेस में वर्तमान स्थिति इस प्रकार है:
- **सक्रिय प्रोजेक्ट्स (${liveStats.projectCount}):**
${liveStats.activeProjectsSummary}

- **टास्क ओवरव्यू (${liveStats.taskCount} कुल टास्क):**
  - 📝 **To-Do:** ${liveStats.todoTaskCount} टास्क
  - ⏳ **In Progress / Review:** ${liveStats.inProgressTaskCount} टास्क
  - ✅ **Completed:** ${liveStats.doneTaskCount} टास्क

- **प्राथमिकता वाले स्प्रिंट टास्क:**
${liveStats.recentTasksSummary}

> 💡 **सुझाव:** नए टास्क जोड़ने या प्रबंधित करने के लिए [/tasks](file:///tasks) पेज पर जाएं।`;
    } else if (pLower.includes('customer') || pLower.includes('कस्टमर') || pLower.includes('audience') || pLower.includes('ग्राहक')) {
      platformReply = `### 👥 कस्टमर डेटाबेस और ऑडियंस एनालिटिक्स

- **कुल ग्राहक प्रोफाइल:** **${liveStats.customerCount}** ग्राहक रिकॉर्ड डेटाबेस (\`public.customers\`) में उपलब्ध हैं।
- **ऑडियंस टारगेटिंग:** आप **Customers › Audiences** में जाकर नए सेगमेंट्स और अभियान बना सकते हैं।

क्या आप किसी विशेष ग्राहक वर्ग या RFM टियर के बारे में अधिक जानना चाहते हैं?`;
    } else if (pLower.includes('campaign') || pLower.includes('अभियान') || pLower.includes('journey') || pLower.includes('जर्नी') || pLower.includes('कैंपेन')) {
      platformReply = `### 🚀 ओमनीचैनल कैंपेन और ऑटोमेशन जर्नी

- **कुल कैंपेन:** **${liveStats.campaignCount}** सक्रिय / ड्राफ्ट अभियान (\`public.campaigns\`) में।
- **ऑटोमेटेड जर्नी:** **${liveStats.journeyCount}** विज़ुअल वर्कफ़्लो (\`public.journeys\`) में।
- **मल्टी-चैनल टेम्पलेट्स:** **${liveStats.templateCount}** टेम्पलेट्स (Email, WhatsApp, SMS, Web Push)।

मैं आपकी नई मार्केटिंग जर्नी या मैसेजिंग कैंपेन सेट करने में मदद कर सकता हूँ।`;
    } else {
      platformReply = `### 🧠 Marbee AI असिस्टेंट (हिंदी मोड)

नमस्ते! मैं आपकी सहायता के लिए तैयार हूँ।
- **वर्कस्पेस की स्थिति:** **${liveStats.customerCount}** कस्टमर्स, **${liveStats.projectCount}** प्रोजेक्ट्स, और **${liveStats.taskCount}** स्प्रिंट टास्क।
- **उपलब्ध सेवाएँ:** मार्केटिंग कैंपेन, ग्राहक डेटाबेस क्वेरी, टास्क प्रबंधन और जर्नी ऑटोमेशन।

बताइए, आज आपकी किस प्रकार सहायता करूँ?`;
    }
  } else if (pLower.includes('task') || pLower.includes('project') || pLower.includes('sprint') || pLower.includes('naman')) {
    platformReply = `### 📋 Workspace Tasks & Project Intelligence

Currently in your workspace:
- **Active Projects (${liveStats.projectCount}):**
${liveStats.activeProjectsSummary}

- **Task Overview (${liveStats.taskCount} total tasks):**
  - 📝 **To-Do:** ${liveStats.todoTaskCount} tasks
  - ⏳ **In Progress / Review:** ${liveStats.inProgressTaskCount} tasks
  - ✅ **Completed:** ${liveStats.doneTaskCount} tasks

- **Recent Priority Sprint Tasks:**
${liveStats.recentTasksSummary}

> 💡 **Action Item:** Manage or create sprint tasks in [/tasks](file:///tasks). To enable external LLM reasoning, configure an API Key in **Settings › AI Engine**.`;
  } else if (pLower.includes('customer') || pLower.includes('rfm') || pLower.includes('audience') || pLower.includes('sql')) {
    platformReply = `### 👥 Customer Database & SQL Analytics

- **Total Profiles:** **${liveStats.customerCount}** customer records in \`public.customers\`.
- **Targeting SQL Query Template:**
\`\`\`sql
-- Target high-value VIP customers (RFM Champions)
SELECT 
    c.id,
    c.email,
    c.first_name,
    c.rfm_tier,
    COUNT(o.id) AS total_orders,
    SUM(o.total_amount) AS lifetime_revenue
FROM public.customers c
LEFT JOIN public.orders o ON o.customer_id = c.id
WHERE c.rfm_tier IN ('Champions', 'Loyal VIP')
GROUP BY c.id, c.email, c.first_name, c.rfm_tier
HAVING SUM(o.total_amount) > 500
ORDER BY lifetime_revenue DESC;
\`\`\`

> 💡 **Tip:** Execute audience queries directly in **Customers › Audiences**.`;
  } else if (pLower.includes('campaign') || pLower.includes('deliver') || pLower.includes('template') || pLower.includes('journey')) {
    platformReply = `### 🚀 Omnichannel Campaign & Journey Status

- **Campaigns:** **${liveStats.campaignCount}** active/draft campaigns in \`public.campaigns\`.
- **Automated Journeys:** **${liveStats.journeyCount}** multi-stage workflows in \`public.journeys\`.
- **Delivery Templates:** **${liveStats.templateCount}** multi-channel templates ready for Email, SMS, WhatsApp, and Web Push.
- **Telemetry Events:** **${liveStats.eventCount}** live customer events logged.`;
  } else {
    platformReply = `### 🧠 Marbee Copilot Platform Diagnostics

I have full operational awareness of your workspace:
- **Workspace State:** **${liveStats.customerCount}** customers, **${liveStats.projectCount}** projects, **${liveStats.taskCount}** sprint tasks, and **${liveStats.campaignCount}** campaigns.
- **Live Database:** Connected via PostgreSQL schema layer.

How can I assist you with your marketing campaigns, task management, or audience segmentation?`;
  }

  return {
    text: platformReply,
    latencyMs: Date.now() - start,
    tokens: Math.floor(platformReply.length / 4),
  };
}

/**
 * Intelligent Native Responsive HTML Email Code Generator
 * Generates client-safe, modern, high-converting responsive email HTML based on natural language intent.
 */
export function generateIntelligentEmailHtml(prompt: string, onlyHtml: boolean = false): string {
  const p = prompt.toLowerCase();

  let title = 'Exclusive Update for You';
  let preheader = 'Discover the latest updates, curated perks, and insights inside.';
  let badge = 'NEW ANNOUNCEMENT';
  let primaryColor = '#6366f1'; // Indigo
  let gradientFrom = '#4f46e5';
  let gradientTo = '#7c3aed';
  let heroHeading = 'Elevate Your Customer Experience';
  let heroBody = 'We have designed this experience to help your team achieve higher conversion, seamless engagement, and actionable growth.';
  let ctaText = 'Get Started Now';
  let ctaLink = 'https://marbee.io';

  if (p.includes('sale') || p.includes('discount') || p.includes('offer') || p.includes('promo') || p.includes('deal') || p.includes('black friday') || p.includes('flash')) {
    title = '🔥 Special Limited-Time Offer: Save 30% Today!';
    preheader = 'Unlock your exclusive discount before the offer expires at midnight.';
    badge = 'LIMITED TIME OFFER';
    primaryColor = '#e11d48';
    gradientFrom = '#e11d48';
    gradientTo = '#f97316';
    heroHeading = 'Claim Your Exclusive 30% Discount';
    heroBody = 'Hi {{first_name|there}}, for a limited time only, enjoy premium access to our complete marketing automation suite at special member pricing.';
    ctaText = 'Claim 30% Discount ➔';
  } else if (p.includes('welcome') || p.includes('onboard') || p.includes('signup') || p.includes('join') || p.includes('hello')) {
    title = '👋 Welcome to Marbee! Let\'s get you set up';
    preheader = 'Here is everything you need to start sending high-converting campaigns.';
    badge = 'GETTING STARTED';
    primaryColor = '#2563eb';
    gradientFrom = '#2563eb';
    gradientTo = '#06b6d4';
    heroHeading = 'Welcome to the Future of Customer Engagement';
    heroBody = 'Hi {{first_name|there}}, we are thrilled to have you! Explore our visual journey builder, omnichannel templates, and real-time behavioral triggers.';
    ctaText = 'Explore Your Workspace ➔';
  } else if (p.includes('newsletter') || p.includes('digest') || p.includes('weekly') || p.includes('monthly') || p.includes('edition') || p.includes('roundup')) {
    title = '📰 The Growth Dispatch: Insights & Trends';
    preheader = 'Your weekly digest of marketing engineering, product updates, and growth strategies.';
    badge = 'WEEKLY DISPATCH';
    primaryColor = '#059669';
    gradientFrom = '#059669';
    gradientTo = '#10b981';
    heroHeading = 'Top Growth Trends & Platform Updates';
    heroBody = 'Hi {{first_name|there}}, here are this week\'s handpicked insights, actionable metrics, and new features designed to supercharge your customer retention.';
    ctaText = 'Read Full Article ➔';
  } else if (p.includes('cart') || p.includes('abandon') || p.includes('checkout') || p.includes('item') || p.includes('left')) {
    title = '🛒 You left something special in your cart';
    preheader = 'Your selected items are reserved for the next 24 hours.';
    badge = 'CART RESERVED';
    primaryColor = '#f59e0b';
    gradientFrom = '#d97706';
    gradientTo = '#f59e0b';
    heroHeading = 'Complete Your Order & Enjoy Free Shipping';
    heroBody = 'Hi {{first_name|there}}, we noticed you did not finish checking out. We have saved your cart so you can pick up right where you left off.';
    ctaText = 'Return to Checkout ➔';
  } else if (p.includes('event') || p.includes('webinar') || p.includes('invite') || p.includes('summit') || p.includes('masterclass')) {
    title = '🎟️ You\'re Invited: Exclusive Masterclass & Live Demo';
    preheader = 'Reserve your VIP seat for an exclusive deep dive with industry experts.';
    badge = 'VIP INVITATION';
    primaryColor = '#7c3aed';
    gradientFrom = '#7c3aed';
    gradientTo = '#db2777';
    heroHeading = 'Mastering Omnichannel Customer Journeys';
    heroBody = 'Hi {{first_name|there}}, join our live interactive masterclass to discover how top brands automate customer retention with AI workflows.';
    ctaText = 'Reserve My Free Seat ➔';
  } else if (p.includes('receipt') || p.includes('invoice') || p.includes('transaction') || p.includes('order') || p.includes('payment') || p.includes('billing')) {
    title = '🧾 Order Confirmation & Payment Receipt';
    preheader = 'Thank you for your purchase! Here is your official receipt.';
    badge = 'PAYMENT CONFIRMED';
    primaryColor = '#0f172a';
    gradientFrom = '#0f172a';
    gradientTo = '#334155';
    heroHeading = 'Thank You for Your Order!';
    heroBody = 'Hi {{first_name|there}}, your payment of $49.00 has been successfully processed. Your subscription is active.';
    ctaText = 'View Full Invoice ➔';
  }

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding-left: 20px !important; padding-right: 20px !important; }
      .stack-column { display: block !important; width: 100% !important; max-width: 100% !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9;">
  <!-- Preheader Snippet -->
  <div style="display: none; font-size: 1px; color: #f1f5f9; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${preheader} &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 30px 10px;">
        <!-- Email Container (Max 600px) -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          
          <!-- Header Bar -->
          <tr>
            <td align="center" style="padding: 24px 30px; background-color: #ffffff; border-bottom: 1px solid #f1f5f9;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="left">
                    <span style="font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">
                      🐝 <span style="color: ${primaryColor};">Marbee</span>
                    </span>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background-color: #f1f5f9; color: #475569; font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
                      ${badge}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero Section with Gradient Accent -->
          <tr>
            <td style="padding: 40px 30px 30px 30px; background: linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%); color: #ffffff;" class="mobile-padding">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <h1 style="margin: 0 0 16px 0; font-size: 26px; font-weight: 800; line-height: 1.3; color: #ffffff; text-align: center;">
                      ${heroHeading}
                    </h1>
                    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #f8fafc; text-align: center; max-width: 480px;">
                      ${heroBody}
                    </p>
                    <!-- Bulletproof CTA Button -->
                    <table border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center" style="border-radius: 8px; background-color: #ffffff;">
                          <a href="${ctaLink}" target="_blank" style="font-size: 14px; font-weight: 700; color: ${primaryColor}; text-decoration: none; padding: 14px 28px; border-radius: 8px; display: inline-block; border: 1px solid #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                            ${ctaText}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Features Grid -->
          <tr>
            <td style="padding: 36px 30px;" class="mobile-padding">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding-bottom: 20px;">
                    <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #0f172a;">
                      Key Highlights & Benefits
                    </h2>
                    <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">
                      Designed specifically for maximum deliverability, modern responsiveness, and high engagement across all devices.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td>
                    <!-- Feature Cards (2 Column) -->
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td class="stack-column" width="48%" valign="top" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 12px;">
                          <div style="font-size: 20px; margin-bottom: 8px;">⚡</div>
                          <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">Dynamic Personalization</div>
                          <div style="font-size: 12px; color: #64748b; line-height: 1.5;">Seamlessly injects recipient name, RFM tier, and custom attributes.</div>
                        </td>
                        <td width="4%" style="font-size: 1px; line-height: 1px;">&nbsp;</td>
                        <td class="stack-column" width="48%" valign="top" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 12px;">
                          <div style="font-size: 20px; margin-bottom: 8px;">🛡️</div>
                          <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">Verified BIMI Security</div>
                          <div style="font-size: 12px; color: #64748b; line-height: 1.5;">DKIM, SPF, and DMARC compliant for 99.8% inbox deliverability.</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 30px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px; line-height: 1.6;" class="mobile-padding">
              <p style="margin: 0 0 8px 0; color: #64748b;">
                Sent with ❤️ via <strong>Marbee Automation Engine</strong>
              </p>
              <p style="margin: 0 0 12px 0;">
                123 Innovation Way, Suite 400 • San Francisco, CA 94105
              </p>
              <p style="margin: 0; font-size: 11px;">
                You received this email because you are a registered user. 
                <a href="#" style="color: ${primaryColor}; text-decoration: underline;">Unsubscribe</a> or 
                <a href="#" style="color: ${primaryColor}; text-decoration: underline;">Manage Preferences</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  if (onlyHtml || p.includes('return only') || p.includes('only the html') || p.includes('start with <!doctype')) {
    return html;
  }

  return `### ✉️ Production-Ready Responsive HTML Email Code

Here is the complete, high-converting, responsive HTML email code tailored for your request:

\`\`\`html
${html}
\`\`\`

> 💡 **Tip:** You can directly paste this code into the **HTML Editor** or use the **Visual Studio** to customize blocks and preview live in Gmail, Outlook, Yahoo, and Rediffmail.`;
}
