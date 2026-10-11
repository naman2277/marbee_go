import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Mail, Sparkles, Layout, Search, Check, X, ArrowRight,
  Shield, AlertTriangle, UserCheck, Zap, Palette,
  ExternalLink, Filter, Plus, RefreshCw, FileText, CheckCircle2,
  Lock, Eye, Trash2, ChevronRight, HelpCircle, ArrowLeft
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  CONTENT_TEMPLATE_LIBRARY,
  fetchContentTemplates,
  type MarbeeContentTemplate,
  type EmailContent,
} from '@/lib/content-templates';
import { EmailTemplateStudio } from '@/components/content-templates/EmailTemplateStudio';

export type SendEmailConfig = {
  // Activity Metadata
  activity_name?: string;
  // Template Linking
  content_template_id?: string;
  content_template_name?: string;
  template_status?: 'draft' | 'published' | 'library';
  // Message Details
  subject?: string;
  preheader?: string;
  html_body?: string;
  text_body?: string;
  // Sender Account & Identity (configured in Studio or attached template)
  sender_account_id?: string;
  sender_account_name?: string;
  from_name?: string;
  from_email?: string;
  reply_to?: string;
  // Suppression & Exclusions
  suppression_lists?: string[];
  enforce_global_unsubscribe?: boolean;
  suppress_hard_bounces?: boolean;
  suppress_spam_complaints?: boolean;
  suppress_quiet_hours?: boolean;
  frequency_cap_hours?: number;
  [key: string]: unknown;
};

type Props = {
  activityName: string;
  onActivityNameChange: (name: string) => void;
  config: SendEmailConfig;
  onChange: (updatedConfig: SendEmailConfig) => void;
  tenantId?: string;
  environment?: string;
  readOnly?: boolean;
  onStudioOpenChange?: (isOpen: boolean) => void;
};

const DEFAULT_SUPPRESSION_OPTIONS = [
  {
    id: 'global_unsubscribe',
    label: 'Global Unsubscribes (Opt-outs)',
    desc: 'Automatically excludes any contact who opted out or unsubscribed from email marketing.',
    defaultChecked: true,
    required: true,
  },
  {
    id: 'hard_bounces',
    label: 'Hard Bounces & Invalid Addresses',
    desc: 'Excludes email addresses with past permanent delivery failures (5xx bounce logs).',
    defaultChecked: true,
    required: false,
  },
  {
    id: 'spam_complaints',
    label: 'Spam Complaints & High Risk',
    desc: 'Excludes contacts who marked previous campaigns as spam to protect sender domain reputation.',
    defaultChecked: true,
    required: false,
  },
  {
    id: 'quiet_hours',
    label: 'DND Quiet Hours (10 PM - 8 AM)',
    desc: 'Holds or suppresses sends falling inside recipient local night hours.',
    defaultChecked: false,
    required: false,
  },
  {
    id: 'frequency_cap',
    label: 'Frequency Cap (>3 emails / 24h)',
    desc: 'Excludes contacts who have already received 3 or more messages in the last 24 hours.',
    defaultChecked: false,
    required: false,
  },
  {
    id: 'vip_holdout',
    label: 'VIP Control Holdout Group',
    desc: 'Excludes a random 5% control group for true campaign lift & conversion calculation.',
    defaultChecked: false,
    required: false,
  },
];

export function SendEmailActivityConfigurator({
  activityName,
  onActivityNameChange,
  config,
  onChange,
  tenantId = '00000000-0000-0000-0000-000000000001',
  environment = 'production',
  readOnly = false,
  onStudioOpenChange,
}: Props) {
  // Modal states
  const [templateExplorerOpen, setTemplateExplorerOpen] = useState(false);
  const [emailStudioOpen, setEmailStudioOpen] = useState(false);

  // Template fetching
  const [templates, setTemplates] = useState<MarbeeContentTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateTab, setTemplateTab] = useState<'all' | 'published' | 'draft' | 'library'>('all');

  // Load custom templates from Supabase
  useEffect(() => {
    async function load() {
      setLoadingTemplates(true);
      try {
        const fetched = await fetchContentTemplates(tenantId, environment);
        const emailTemplates = fetched.filter((t) => t.channel === 'email');
        setTemplates(emailTemplates);
      } catch (e) {
        console.warn('Could not fetch database email templates:', e);
      } finally {
        setLoadingTemplates(false);
      }
    }
    load();
  }, [tenantId, environment]);

  // Stable ref for the callback to avoid useEffect dep array changes
  const studioOpenChangeRef = useRef(onStudioOpenChange);
  studioOpenChangeRef.current = onStudioOpenChange;

  // Notify parent components and mark body when studio/explorer is open
  // so canvas click handlers can avoid deselecting the node
  useEffect(() => {
    const isOpen = emailStudioOpen || templateExplorerOpen;
    studioOpenChangeRef.current?.(isOpen);
    if (isOpen) {
      document.body.setAttribute('data-email-studio-active', 'true');
    } else {
      document.body.removeAttribute('data-email-studio-active');
    }
    return () => {
      document.body.removeAttribute('data-email-studio-active');
    };
  }, [emailStudioOpen, templateExplorerOpen]);

  const selectedTemplate = useMemo(() => {
    if (!config.content_template_id) return null;
    const fromDb = templates.find((t) => t.id === config.content_template_id);
    if (fromDb) return { id: fromDb.id, name: fromDb.name, status: fromDb.status, source: 'database' as const, content: fromDb.content };
    const fromLib = CONTENT_TEMPLATE_LIBRARY.find((t) => t.id === config.content_template_id);
    if (fromLib) return { id: fromLib.id, name: fromLib.name, status: 'published' as const, source: 'library' as const, content: fromLib.content };
    return { id: config.content_template_id, name: config.content_template_name || 'Linked Template', status: config.template_status || 'published', source: 'database' as const, content: null };
  }, [config.content_template_id, config.content_template_name, config.template_status, templates]);

  const filteredTemplates = useMemo(() => {
    let list: Array<{ id: string; name: string; status: 'draft' | 'published'; channel: string; category?: string; subject?: string; description?: string; isLibrary?: boolean; itemRaw?: any }> = [];

    // Add DB templates
    templates.forEach((t) => {
      const emailContent = t.content as EmailContent;
      list.push({
        id: t.id,
        name: t.name,
        status: t.status === 'published' ? 'published' : 'draft',
        channel: 'email',
        category: t.settings?.category || 'Custom Email',
        subject: emailContent?.subject || '',
        description: `Last edited ${new Date(t.updated_at).toLocaleDateString()}`,
        isLibrary: false,
        itemRaw: t,
      });
    });

    // Add Library Starters
    CONTENT_TEMPLATE_LIBRARY.filter((l) => l.channel === 'email').forEach((l) => {
      const emailContent = l.content as EmailContent;
      list.push({
        id: l.id,
        name: l.name,
        status: 'published',
        channel: 'email',
        category: l.category || 'Starter Library',
        subject: emailContent?.subject || '',
        description: l.description,
        isLibrary: true,
        itemRaw: l,
      });
    });

    if (templateTab === 'published') list = list.filter((t) => t.status === 'published');
    if (templateTab === 'draft') list = list.filter((t) => t.status === 'draft' && !t.isLibrary);
    if (templateTab === 'library') list = list.filter((t) => t.isLibrary);

    const q = templateSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => t.name.toLowerCase().includes(q) || (t.subject && t.subject.toLowerCase().includes(q)) || (t.category && t.category.toLowerCase().includes(q)));
    }
    return list;
  }, [templates, templateTab, templateSearch]);

  const handleSelectTemplate = (item: any) => {
    let subject = config.subject || '';
    let preheader = config.preheader || '';
    let htmlBody = config.html_body || '';
    let fromName = config.from_name || '';
    let fromEmail = config.from_email || '';
    let replyTo = config.reply_to || '';

    if (item.itemRaw?.content) {
      const emailContent = item.itemRaw.content as EmailContent;
      if (emailContent.subject) subject = emailContent.subject;
      if (emailContent.preheader) preheader = emailContent.preheader;
      if (emailContent.html_body) htmlBody = emailContent.html_body;
      if ((emailContent as any).from_name) fromName = (emailContent as any).from_name;
      if ((emailContent as any).from_email) fromEmail = (emailContent as any).from_email;
      if ((emailContent as any).reply_to) replyTo = (emailContent as any).reply_to;
    }

    onChange({
      ...config,
      content_template_id: item.id,
      content_template_name: item.name,
      template_status: item.status,
      subject,
      preheader,
      html_body: htmlBody,
      from_name: fromName,
      from_email: fromEmail,
      reply_to: replyTo,
    });
    setTemplateExplorerOpen(false);
  };

  const handleClearTemplate = () => {
    onChange({
      ...config,
      content_template_id: undefined,
      content_template_name: undefined,
      template_status: undefined,
    });
  };

  const toggleSuppressionList = (listId: string) => {
    const current = config.suppression_lists || ['global_unsubscribe', 'hard_bounces', 'spam_complaints'];
    const exists = current.includes(listId);
    const updated = exists ? current.filter((id) => id !== listId) : [...current, listId];
    onChange({ ...config, suppression_lists: updated });
  };

  const currentEmailContent: EmailContent = useMemo(() => ({
    subject: config.subject || 'Special Update',
    preheader: config.preheader || '',
    html_body: config.html_body || '<p>Hello {{customer.first_name}},</p><p>Thank you for being a valued customer.</p>',
    text_body: config.text_body || '',
    from_name: config.from_name || 'Marbee Marketing',
    from_email: config.from_email || 'hello@marbee.io',
    reply_to: config.reply_to || 'support@marbee.io',
    builder_state: config.builder_state as any,
  } as any), [config.subject, config.preheader, config.html_body, config.text_body, config.from_name, config.from_email, config.reply_to, config.builder_state]);

  const handleStudioSave = (updatedContent: EmailContent) => {
    onChange({
      ...config,
      subject: updatedContent.subject || config.subject,
      preheader: updatedContent.preheader || config.preheader,
      html_body: updatedContent.html_body || config.html_body,
      text_body: updatedContent.text_body || config.text_body,
      from_name: (updatedContent as any).from_name || config.from_name,
      from_email: (updatedContent as any).from_email || config.from_email,
      reply_to: (updatedContent as any).reply_to || config.reply_to,
      builder_state: updatedContent.builder_state || config.builder_state,
    });
    setEmailStudioOpen(false);
  };

  const activeSuppressionCount = (config.suppression_lists || ['global_unsubscribe', 'hard_bounces', 'spam_complaints']).length;

  return (
    <div className="space-y-5">
      {/* ─── 1. ACTIVITY NAME ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3.5 space-y-2 transition-all hover:border-slate-300">
        <label className="block">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Zap className="h-4 w-4 text-amber-500 fill-amber-500/20" />
              Activity Name
            </span>
            <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">Node Label</span>
          </div>
          <input
            type="text"
            value={activityName}
            disabled={readOnly}
            onChange={(e) => onActivityNameChange(e.target.value)}
            placeholder="e.g. Send Welcome Email"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 shadow-2xs outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
      </div>

      {/* ─── 2. EMAIL DESIGN & STUDIO LAUNCHER ──────────────────────────── */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/40 via-white to-purple-50/20 p-4 space-y-3.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
            <Palette className="h-4 w-4 text-indigo-600" />
            Email Content & Design
          </span>
          {selectedTemplate ? (
            <span className="rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 flex items-center gap-1.5 shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Template Linked
            </span>
          ) : (
            <span className="rounded-full bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 shadow-2xs">
              Inline Email Design
            </span>
          )}
        </div>

        {/* Email Overview Card */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold shadow-xs">
                <Mail className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-900">
                  {selectedTemplate?.name || activityName || 'Send Email Activity'}
                </p>
                <p className="truncate text-[11px] text-slate-500 mt-0.5">
                  Subject: <span className="font-semibold text-slate-800">{config.subject || 'Not set (configure in studio)'}</span>
                </p>
              </div>
            </div>
            {selectedTemplate && !readOnly && (
              <button
                type="button"
                onClick={handleClearTemplate}
                className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                title="Unlink template"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {(config.from_name || config.from_email) && (
            <div className="border-t border-slate-100 pt-2 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Sender: <strong className="text-slate-700 font-semibold">{config.from_name || 'Default'}</strong></span>
              <span className="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">&lt;{config.from_email || 'hello@marbee.io'}&gt;</span>
            </div>
          )}
        </div>

        {/* Main CTA Buttons */}
        {!readOnly && (
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => setEmailStudioOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 px-4 py-3 text-xs font-bold text-white shadow-md shadow-indigo-600/20 transition hover:shadow-lg hover:shadow-indigo-600/30 active:scale-[0.99] cursor-pointer"
            >
              <Palette className="h-4 w-4" />
              Open Full Email Studio
            </button>

            <button
              type="button"
              onClick={() => setTemplateExplorerOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:border-slate-300 active:scale-[0.99] cursor-pointer"
            >
              <Search className="h-3.5 w-3.5 text-slate-500" />
              {selectedTemplate ? 'Change Linked Template' : 'Select From Template Library'}
            </button>
          </div>
        )}
      </div>

      {/* ─── 3. SUPPRESSION LISTS & EXCLUSIONS ───────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-bold text-slate-900">
              Recipient Exclusions & Suppression
            </span>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/80">
            {activeSuppressionCount} Active
          </span>
        </div>

        {/* Informational Banner */}
        <div className="rounded-xl border border-amber-200/70 bg-amber-50/60 p-3 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">
            <strong>Exclusion Rule:</strong> Any contact in selected list(s) below will be <strong>automatically excluded</strong> before send.
          </p>
        </div>

        {/* Checkboxes */}
        <div className="space-y-2 pt-1">
          {DEFAULT_SUPPRESSION_OPTIONS.map((opt) => {
            const activeLists = config.suppression_lists || ['global_unsubscribe', 'hard_bounces', 'spam_complaints'];
            const isChecked = activeLists.includes(opt.id);

            return (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-start justify-between rounded-xl border p-3 transition ${
                  isChecked
                    ? 'border-emerald-200/90 bg-emerald-50/30'
                    : 'border-slate-200/80 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={readOnly || opt.required}
                    onChange={() => toggleSuppressionList(opt.id)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">{opt.label}</span>
                      {opt.required && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800 uppercase tracking-wide">
                          Opt-outs Excluded
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 leading-normal">{opt.desc}</p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* ─── POPUP MODAL 1: TEMPLATE EXPLORER MODAL (PORTAL) ──────────────── */}
      {templateExplorerOpen && createPortal(
        <div
          className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
        >
          <div className="flex h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Layout className="h-5 w-5 text-indigo-600" />
                  Select Email Template
                </h3>
                <p className="text-xs text-slate-500">Browse published templates, active drafts, or prebuilt starters.</p>
              </div>
              <button
                type="button"
                onClick={() => setTemplateExplorerOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Filter Tabs & Search */}
            <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-3 space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="Search templates by name, subject, or category…"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-medium shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-2">
                {[
                  { id: 'all', label: 'All Templates' },
                  { id: 'published', label: 'Published Only' },
                  { id: 'draft', label: 'Drafts' },
                  { id: 'library', label: 'Prebuilt Starters' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTemplateTab(tab.id as any)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      templateTab === tab.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Template Grid */}
            <div className="flex-1 overflow-y-auto p-6">
              {filteredTemplates.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {filteredTemplates.map((t) => {
                    const isCurrent = config.content_template_id === t.id;
                    return (
                      <div
                        key={t.id}
                        className={`group relative flex flex-col justify-between rounded-xl border p-4 transition-all ${
                          isCurrent
                            ? 'border-indigo-500 bg-indigo-50/20 ring-2 ring-indigo-500/20 shadow-md'
                            : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md'
                        }`}
                      >
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                                t.status === 'published'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}
                            >
                              {t.status === 'published' ? 'Published' : 'Draft'}
                            </span>
                            <span className="text-[10px] font-medium text-slate-400">{t.category}</span>
                          </div>

                          <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition">{t.name}</h4>
                          <p className="mt-1 text-xs text-slate-600 line-clamp-2">{t.subject || 'No subject line'}</p>
                          <p className="mt-2 text-[11px] text-slate-400">{t.description}</p>
                        </div>

                        <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={() => handleSelectTemplate(t)}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                              isCurrent
                                ? 'bg-emerald-600 text-white'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                            }`}
                          >
                            {isCurrent ? (
                              <>
                                <Check className="h-3.5 w-3.5" /> Selected
                              </>
                            ) : (
                              <>
                                Select Template <ArrowRight className="h-3.5 w-3.5" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-16 text-center">
                  <Mail className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-600">No email templates found</p>
                  <p className="text-xs text-slate-400">Try adjusting your search or tab filter.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3">
              <span className="text-xs text-slate-500">{filteredTemplates.length} email templates available</span>
              <button
                type="button"
                onClick={() => setTemplateExplorerOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── POPUP MODAL 2: FULL SCREEN EMAIL STUDIO (PORTAL DIRECT TO BODY) ──── */}
      {emailStudioOpen && createPortal(
        <div
          className="fixed inset-0 z-[999999] flex flex-col bg-white w-screen h-screen overflow-hidden animate-in fade-in duration-150"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
        >
          <EmailTemplateStudio
            templateName={activityName || 'Send Email Activity'}
            content={currentEmailContent}
            onChange={(updated) => {
              onChange({
                ...config,
                subject: updated.subject || config.subject,
                preheader: updated.preheader || config.preheader,
                html_body: updated.html_body || config.html_body,
                text_body: updated.text_body || config.text_body,
                from_name: (updated as any).from_name || config.from_name,
                from_email: (updated as any).from_email || config.from_email,
                reply_to: (updated as any).reply_to || config.reply_to,
                builder_state: updated.builder_state || config.builder_state,
              });
            }}
            onSave={(updated) => {
              if (updated) handleStudioSave(updated);
              else setEmailStudioOpen(false);
            }}
            onBack={() => setEmailStudioOpen(false)}
          />
        </div>,
        document.body
      )}
    </div>
  );
}
