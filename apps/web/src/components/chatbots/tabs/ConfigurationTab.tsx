import { IdCard, MessageCircle, Timer, Shield } from 'lucide-react';
import { SectionCard, Field, Toggle, fieldInput, TabHeading } from '../studio-ui';
import type { TabProps } from '../types';

const LANGUAGES = [
  { code: 'en', label: 'English' }, { code: 'hi', label: 'Hindi' }, { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' }, { code: 'de', label: 'German' }, { code: 'ar', label: 'Arabic' },
  { code: 'pt', label: 'Portuguese' }, { code: 'zh', label: 'Chinese' },
];

export function ConfigurationTab({ draft, update }: TabProps) {
  const bot = draft.bot;
  const set = (patch: Partial<typeof bot>) => update((d) => ({ ...d, bot: { ...d.bot, ...patch } }));

  return (
    <div className="space-y-5">
      <TabHeading title="Configuration" description="The bot's identity and how it greets and behaves with every visitor." />

      <SectionCard icon={IdCard} title="Bot Identity" description="How this assistant introduces itself.">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bot Name" required>
            <input className={fieldInput} value={bot.name} onChange={(e) => set({ name: e.target.value })} placeholder="Support Concierge" />
          </Field>
          <Field label="Business / Brand Name">
            <input className={fieldInput} value={bot.business_name ?? ''} onChange={(e) => set({ business_name: e.target.value })} placeholder="Marbee" />
          </Field>
          <Field label="Avatar URL" className="col-span-2" hint="Square image works best. Leave blank for a default bot icon.">
            <input className={fieldInput} value={bot.avatar_url ?? ''} onChange={(e) => set({ avatar_url: e.target.value })} placeholder="https://…" />
          </Field>
          <Field label="Description" className="col-span-2" hint="Internal note — visitors never see this.">
            <textarea className={fieldInput} rows={2} value={bot.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard icon={MessageCircle} title="Greeting & Language" description="First impression and the languages this bot speaks.">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Welcome Message" className="col-span-2" required>
            <textarea className={fieldInput} rows={2} value={bot.welcome_message} onChange={(e) => set({ welcome_message: e.target.value })} />
          </Field>
          <Field label="Input Placeholder">
            <input className={fieldInput} value={bot.placeholder_text} onChange={(e) => set({ placeholder_text: e.target.value })} />
          </Field>
          <Field label="Primary Language">
            <select className={fieldInput} value={bot.primary_language} onChange={(e) => set({ primary_language: e.target.value })}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </Field>
          <Field label="Supported Languages" className="col-span-2" hint="Ctrl/Cmd-click to select multiple.">
            <select
              multiple
              className={`${fieldInput} h-24`}
              value={bot.supported_languages}
              onChange={(e) => set({ supported_languages: Array.from(e.target.selectedOptions).map((o) => o.value) })}
            >
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard icon={Timer} title="Conversation Behavior" description="Limits and capabilities applied to every conversation.">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Conversation Timeout (minutes)" hint="Idle sessions expire after this.">
            <input type="number" min={1} className={fieldInput} value={bot.conversation_timeout_minutes} onChange={(e) => set({ conversation_timeout_minutes: Number(e.target.value) })} />
          </Field>
          <Field label="Max Conversation Length (messages)">
            <input type="number" min={1} className={fieldInput} value={bot.max_conversation_length} onChange={(e) => set({ max_conversation_length: Number(e.target.value) })} />
          </Field>
          <div className="col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Toggle checked={bot.enable_conversation_history} onChange={(v) => set({ enable_conversation_history: v })} label="Conversation History" />
            <Toggle checked={bot.enable_sentiment_analysis} onChange={(v) => set({ enable_sentiment_analysis: v })} label="Sentiment Analysis" />
            <Toggle checked={bot.enable_data_capture} onChange={(v) => set({ enable_data_capture: v })} label="Data Capture" />
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={Shield} title="Branding & Retention" description="Platform branding and how long data is kept.">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Powered By Text">
              <input className={fieldInput} value={bot.powered_by_text} onChange={(e) => set({ powered_by_text: e.target.value })} />
            </Field>
            <div className="flex items-end">
              <Toggle checked={bot.show_powered_by} onChange={(v) => set({ show_powered_by: v })} label={`Show "${bot.powered_by_text}"`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Conversations (days)">
              <input type="number" min={1} className={fieldInput} value={bot.conversation_retention_days} onChange={(e) => set({ conversation_retention_days: Number(e.target.value) })} />
            </Field>
            <Field label="Messages (days)">
              <input type="number" min={1} className={fieldInput} value={bot.message_retention_days} onChange={(e) => set({ message_retention_days: Number(e.target.value) })} />
            </Field>
            <Field label="Captured (days)">
              <input type="number" min={1} className={fieldInput} value={bot.captured_data_retention_days} onChange={(e) => set({ captured_data_retention_days: Number(e.target.value) })} />
            </Field>
            <Field label="Anon session (days)">
              <input type="number" min={1} className={fieldInput} value={bot.anonymous_session_retention_days} onChange={(e) => set({ anonymous_session_retention_days: Number(e.target.value) })} />
            </Field>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
