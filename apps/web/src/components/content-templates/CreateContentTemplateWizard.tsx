import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  FilePlus,
  LayoutTemplate,
  Mail,
  MessageSquare,
  Bell,
  Smartphone,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { ContentTemplateGallery } from '@/components/content-templates/ContentTemplateGallery';
import {
  createContentTemplate,
  createFromLibraryItem,
  type ContentChannel,
  type ContentTemplateLibraryItem,
} from '@/lib/content-templates';
import { useTenantScope } from '@/contexts/AuthContext';

type CreateMode = 'blank' | 'library';

const MODES: Array<{ id: CreateMode; label: string; description: string; icon: typeof FilePlus }> = [
  {
    id: 'blank',
    label: 'Start from scratch',
    description: 'Build an original message with visual drag-and-drop studio.',
    icon: FilePlus,
  },
  {
    id: 'library',
    label: 'Browse template library',
    description: 'Pick from 50+ prebuilt high-conversion SaaS & ecommerce templates.',
    icon: LayoutTemplate,
  },
];

const CHANNELS: Array<{ id: ContentChannel; label: string; icon: typeof Mail; desc: string }> = [
  { id: 'email', label: 'Email', icon: Mail, desc: 'Visual Responsive Email Studio' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, desc: 'Meta Business Cloud API' },
  { id: 'sms', label: 'SMS', icon: Smartphone, desc: 'DLT Registered Carrier SMS' },
  { id: 'web_push', label: 'Web Push', icon: Bell, desc: 'Chrome, Safari & Firefox Push' },
  { id: 'rcs', label: 'RCS', icon: Smartphone, desc: 'Rich Interactive Cards' },
];

type Props = {
  onClose: () => void;
  initialMode?: CreateMode;
};

export function CreateContentTemplateWizard({ onClose, initialMode = 'blank' }: Props) {
  const { tenantId, environment } = useTenantScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [mode, setMode] = useState<CreateMode>(initialMode);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<ContentChannel>('email');
  const [libraryItem, setLibraryItem] = useState<ContentTemplateLibraryItem | null>(null);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'library') {
        if (!libraryItem) throw new Error('Select a template from the library');
        const draft = createFromLibraryItem(libraryItem, name);
        return createContentTemplate(tenantId, environment, draft.name, draft.channel, {
          content: draft.content,
          settings: draft.settings,
          library_template_id: draft.library_template_id,
        });
      }

      const templateName = name.trim() || `New ${channel.toUpperCase()} Template`;
      return createContentTemplate(tenantId, environment, templateName, channel);
    },
    onSuccess: (result) => {
      if (result.error || !result.template) {
        setError(result.error ?? 'Failed to create template');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['content-templates', tenantId, environment] });
      onClose();
      navigate(`/content/templates/${result.template.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-black text-slate-900">Create Message Template</h2>
            <p className="text-xs text-slate-500">Choose your channel and launch into the unified studio</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="grid gap-3 border-b border-slate-100 px-6 py-3.5 sm:grid-cols-2 bg-slate-50/50">
          {MODES.map(({ id, label, description, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id);
                setError('');
              }}
              className={`rounded-2xl border p-3.5 text-left transition-all ${
                mode === id
                  ? 'border-violet-500 bg-white ring-2 ring-violet-200 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    mode === id ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-bold text-xs text-slate-900">{label}</p>
                  <p className="text-[11px] text-slate-500 leading-snug">{description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {mode === 'blank' && (
            <div className="space-y-4">
              {/* Template Name Input */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Template name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Fashion Editorial Hero, Flash Sale Alert"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-violet-500 focus:outline-hidden"
                  autoFocus
                />
              </div>

              {/* Channels Grid */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Select Channel</label>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {CHANNELS.map(({ id, label, icon: Icon, desc }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setChannel(id)}
                      className={`flex flex-col items-start p-3 rounded-2xl border text-left transition-all ${
                        channel === id
                          ? 'border-violet-500 bg-violet-50/50 ring-2 ring-violet-200'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`h-4 w-4 ${channel === id ? 'text-violet-600' : 'text-slate-500'}`} />
                        <span className="font-bold text-xs text-slate-900">{label}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium leading-tight">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {mode === 'library' && (
            <div className="space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Template name (optional — uses library name)"
                className="h-10 w-full rounded-xl border border-slate-200 px-3.5 text-xs font-semibold"
              />
              <ContentTemplateGallery
                selectedId={libraryItem?.id}
                onSelect={(tpl) => {
                  setLibraryItem(tpl);
                  if (!name.trim()) setName(tpl.name);
                }}
              />
            </div>
          )}

          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 px-6 py-4 bg-slate-50/60">
          <Button variant="ghost" onClick={onClose} className="h-9 px-4 text-xs font-semibold">
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="h-9 px-5 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-500/20"
          >
            {mutation.isPending ? 'Launching Studio…' : 'Open in Studio →'}
          </Button>
        </div>
      </div>
    </div>
  );
}
