import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  FileCode,
  FilePlus,
  LayoutTemplate,
  Mail,
  MessageSquare,
  Smartphone,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui';
import {
  createContentTemplate,
  emptyContentForChannel,
  type ContentChannel,
  type TemplateContent,
} from '@/lib/content-templates';
import { useTenantScope } from '@/contexts/AuthContext';
import { PREBUILT_EMAIL_TEMPLATES } from '@/lib/email-templates-library';

type Props = {
  open: boolean;
  onClose: () => void;
};

type CreationMethod = 'empty' | 'basic' | 'import';

export function CreateTemplateModal({ open, onClose }: Props) {
  const { tenantId, environment } = useTenantScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Wizard Step: 1 = Channel, 2 = Email Config (Name + Versions), 3 = Starter Method
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [channel, setChannel] = useState<ContentChannel>('email');
  const [name, setName] = useState('');

  // Version Checkboxes (HTML, AMP, Text)
  const [enableHtml, setEnableHtml] = useState(true);
  const [enableAmp, setEnableAmp] = useState(true);
  const [enableText, setEnableText] = useState(true);

  // Starter Method
  const [method, setMethod] = useState<CreationMethod>('empty');
  const [importedHtml, setImportedHtml] = useState('');
  const [error, setError] = useState('');

  // Every time the modal opens, start a brand-new template from scratch.
  useEffect(() => {
    if (open) {
      setStep(1);
      setChannel('email');
      setName('');
      setEnableHtml(true);
      setEnableAmp(true);
      setEnableText(true);
      setMethod('empty');
      setImportedHtml('');
      setError('');
    }
  }, [open]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const templateName = name.trim() || `New ${channel.toUpperCase()} Template`;
      const enabledVersions: Array<'html' | 'amp' | 'text'> = [];
      if (enableHtml) enabledVersions.push('html');
      if (enableAmp) enabledVersions.push('amp');
      if (enableText) enabledVersions.push('text');

      let initialContent: TemplateContent;

      if (channel === 'email') {
        if (method === 'basic') {
          // Prebuilt basic template
          const base = PREBUILT_EMAIL_TEMPLATES[0];
          initialContent = {
            subject: base.subject || 'Welcome to our newsletter',
            preheader: base.preheader || 'Discover the latest updates',
            html_body: '',
            text_body: 'Discover the latest updates at Marbee.',
            amp_html: '<!doctype html><html ⚡4email><head><meta charset="utf-8"></head><body><h1>Welcome</h1></body></html>',
            enabled_versions: enabledVersions.length > 0 ? enabledVersions : ['html', 'amp', 'text'],
            builder_state: {
              blocks: base.blocks,
              theme: base.theme,
            },
          };
        } else if (method === 'import' && importedHtml.trim()) {
          // Imported HTML
          initialContent = {
            subject: templateName,
            html_body: importedHtml,
            text_body: '',
            amp_html: '',
            enabled_versions: enabledVersions.length > 0 ? enabledVersions : ['html'],
          };
        } else {
          // Empty Email from scratch with clean empty canvas
          initialContent = {
            subject: '',
            preheader: '',
            html_body: '',
            text_body: '',
            amp_html: '',
            enabled_versions: enabledVersions.length > 0 ? enabledVersions : ['html', 'amp', 'text'],
            builder_state: {
              blocks: [],
            },
          };
        }
      } else {
        // SMS / WhatsApp / Web Push / RCS — always start empty, from scratch.
        initialContent = emptyContentForChannel(channel);
      }

      return createContentTemplate(tenantId, environment, templateName, channel, {
        content: initialContent,
      });
    },
    onSuccess: (res) => {
      if (res.template) {
        queryClient.invalidateQueries({ queryKey: ['content-templates'] });
        onClose();
        navigate(`/content/templates/${res.template.id}`);
      }
    },
    onError: (err: any) => {
      setError(err?.message || 'Failed to create template');
    },
  });

  const CHANNELS: Array<{ id: ContentChannel; label: string; icon: typeof Mail; desc: string; color: string; bg: string }> = [
    { id: 'email', label: 'Email', icon: Mail, desc: 'Responsive HTML, AMP & Plain Text Studio', color: 'text-violet-600', bg: 'bg-violet-50' },
    { id: 'rcs', label: 'RCS', icon: Smartphone, desc: 'Android Messages Rich Cards & Carousels', color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'sms', label: 'SMS', icon: Smartphone, desc: 'DLT Registered Carrier SMS Text', color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, desc: 'Meta Cloud API Verified Templates', color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { id: 'web_push', label: 'Web Push', icon: Bell, desc: 'Browser Push Notifications', color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in select-none">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((step - 1) as any)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h2 className="text-base font-black text-slate-900">
                {step === 1
                  ? 'Select Message Channel'
                  : step === 2
                  ? 'Template Name & Versions'
                  : 'Choose Starter Template'}
              </h2>
              <p className="text-xs text-slate-500">Step {step} of {channel === 'email' ? 3 : 2}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* STEP 1: CHANNEL SELECTOR */}
          {step === 1 && (
            <div className="space-y-4">
              <span className="text-xs font-bold text-slate-700">Choose message channel:</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {CHANNELS.map((c) => {
                  const Icon = c.icon;
                  const isSel = channel === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setChannel(c.id)}
                      className={`group cursor-pointer rounded-2xl border p-4 transition-all ${
                        isSel
                          ? 'border-violet-500 bg-violet-50/50 ring-2 ring-violet-200 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.bg} ${c.color}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs text-slate-900 group-hover:text-violet-700">
                            {c.label}
                          </h4>
                          <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">{c.desc}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: TEMPLATE NAME & VERSIONS CHECKBOXES */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Name Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Template Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Welcome Series, Product Launch Digest"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-violet-500 focus:outline-hidden"
                  autoFocus
                />
              </div>

              {/* Version Checkboxes (Only for Email) */}
              {channel === 'email' ? (
                <div className="space-y-3 rounded-2xl border border-slate-200/90 bg-slate-50/60 p-4">
                  <div>
                    <span className="text-xs font-bold text-slate-800">Select Versions to Enable</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Check which email formats and editor views you want to activate for this template:
                    </p>
                  </div>

                  <div className="space-y-2 pt-1">
                    {/* HTML Checkbox */}
                    <div
                      onClick={() => setEnableHtml(!enableHtml)}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white cursor-pointer hover:border-violet-400 transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`flex h-5 w-5 items-center justify-center rounded-md border ${enableHtml ? 'bg-violet-600 border-violet-600 text-white' : 'border-slate-300 bg-white'}`}>
                          {enableHtml && <Check className="h-3.5 w-3.5" />}
                        </div>
                        <div>
                          <span className="font-bold text-xs text-slate-900">HTML Version</span>
                          <span className="block text-[10px] text-slate-400">Standard responsive HTML email with visual designer</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded">Required</span>
                    </div>

                    {/* AMP Checkbox */}
                    <div
                      onClick={() => setEnableAmp(!enableAmp)}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white cursor-pointer hover:border-violet-400 transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`flex h-5 w-5 items-center justify-center rounded-md border ${enableAmp ? 'bg-violet-600 border-violet-600 text-white' : 'border-slate-300 bg-white'}`}>
                          {enableAmp && <Check className="h-3.5 w-3.5" />}
                        </div>
                        <div>
                          <span className="font-bold text-xs text-slate-900">AMP Version</span>
                          <span className="block text-[10px] text-slate-400">Interactive dynamic AMP for Gmail, Yahoo & Mail.ru</span>
                        </div>
                      </div>
                      <Zap className="h-4 w-4 text-amber-500" />
                    </div>

                    {/* Text Version Checkbox */}
                    <div
                      onClick={() => setEnableText(!enableText)}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white cursor-pointer hover:border-violet-400 transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`flex h-5 w-5 items-center justify-center rounded-md border ${enableText ? 'bg-violet-600 border-violet-600 text-white' : 'border-slate-300 bg-white'}`}>
                          {enableText && <Check className="h-3.5 w-3.5" />}
                        </div>
                        <div>
                          <span className="font-bold text-xs text-slate-900">Text Version</span>
                          <span className="block text-[10px] text-slate-400">Clean plain text fallback for accessibility and deliverability</span>
                        </div>
                      </div>
                      <FileCode className="h-4 w-4 text-slate-400" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                  Ready to launch into the <strong>{channel.toUpperCase()}</strong> visual editor.
                </div>
              )}
            </div>
          )}

          {/* STEP 3 (FOR EMAIL): STARTER METHOD OPTIONS (Matching User Specification) */}
          {step === 3 && channel === 'email' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4 space-y-1">
                <p className="text-xs font-semibold text-violet-950 leading-relaxed">
                  To get started on your campaign, just select a template, update its content, and your email is ready to go. Export it to the ESP of your choice.
                </p>
              </div>

              <div className="space-y-3">
                {/* Option 1: Empty Email */}
                <div
                  onClick={() => setMethod('empty')}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                    method === 'empty'
                      ? 'border-violet-500 bg-violet-50/40 ring-2 ring-violet-200 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                      <FilePlus className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">Empty Email</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Create an email from scratch by using Blocks and Modules
                      </p>
                    </div>
                  </div>
                </div>

                {/* Option 2: Create from Basic Templates */}
                <div
                  onClick={() => setMethod('basic')}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                    method === 'basic'
                      ? 'border-violet-500 bg-violet-50/40 ring-2 ring-violet-200 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                      <LayoutTemplate className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">Create from Basic Templates</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Quick start with basic templates
                      </p>
                    </div>
                  </div>
                </div>

                {/* Option 3: Browse / Import Design */}
                <div
                  onClick={() => setMethod('import')}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                    method === 'import'
                      ? 'border-violet-500 bg-violet-50/40 ring-2 ring-violet-200 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <Upload className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-xs text-slate-900">Browse : Import design</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Continue working with your existing email designs
                      </p>

                      {method === 'import' && (
                        <div className="mt-3 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                          <label className="text-[10px] font-bold text-slate-600">Paste HTML Code:</label>
                          <textarea
                            value={importedHtml}
                            onChange={(e) => setImportedHtml(e.target.value)}
                            rows={3}
                            placeholder="<html><body><h1>Your custom HTML</h1></body></html>"
                            className="w-full rounded-xl border border-slate-200 p-2 font-mono text-[11px] text-slate-800 focus:outline-hidden"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 px-6 py-4 bg-slate-50/60">
          <Button variant="ghost" onClick={onClose} className="h-9 px-4 text-xs font-semibold">
            Cancel
          </Button>

          {step === 1 ? (
            <Button
              onClick={() => setStep(2)}
              className="h-9 px-5 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-500/20 flex items-center gap-1"
            >
              <span>Next</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : step === 2 && channel === 'email' ? (
            <Button
              onClick={() => {
                if (!name.trim()) setName('New email template');
                setStep(3);
              }}
              className="h-9 px-5 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-500/20 flex items-center gap-1"
            >
              <span>Next</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="h-9 px-6 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-500/20"
            >
              {createMutation.isPending ? 'Launching Studio…' : 'Create & Open Studio →'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
