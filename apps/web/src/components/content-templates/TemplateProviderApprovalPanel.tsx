import { ExternalLink, Info } from 'lucide-react';
import { Badge } from '@/components/ui';
import { TemplateBuilderSection } from '@/components/content-templates/TemplateBuilderSection';
import type { ContentChannel } from '@/lib/content-templates';
import {
  APPROVAL_STATUS_OPTIONS,
  approvalStatusBadgeVariant,
  getProviderApprovalForChannel,
  mergeProviderApproval,
  normalizeProviderApproval,
  providerApprovalTabLabel,
  type ProviderApprovalStatus,
  type RcsProviderApproval,
  type SmsDltApproval,
  type TemplateProviderApproval,
  type WhatsAppMetaApproval,
} from '@/lib/template-provider-approval';

const inputClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100';
const labelClass = 'mb-1 block text-xs font-medium text-slate-600';

type Props = {
  channel: ContentChannel;
  approval: TemplateProviderApproval | undefined;
  onChange: (approval: TemplateProviderApproval) => void;
};

function StatusField({
  status,
  onChange,
}: {
  status: ProviderApprovalStatus;
  onChange: (status: ProviderApprovalStatus) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {APPROVAL_STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`rounded-xl border p-3 text-left transition-all ${
            status === opt.id
              ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <p className="text-sm font-semibold text-slate-900">{opt.label}</p>
          <p className="mt-0.5 text-xs text-slate-500">{opt.description}</p>
        </button>
      ))}
    </div>
  );
}

function ExternalNotice({ channel }: { channel: ContentChannel }) {
  const copy =
    channel === 'sms'
      ? 'DLT registration happens on your telecom principal entity portal (e.g. Jio, Airtel, Vi) or via your SMS aggregator. Enter the approved IDs here so journeys can reference them at send time.'
      : channel === 'whatsapp'
        ? 'Meta reviews WhatsApp templates in WhatsApp Business Manager. Marbee does not submit templates to Meta — record the approved template name and ID after approval.'
        : 'RCS templates are approved by your RCS service provider (Google RBM, Jio, etc.). Link the approved template ID here for delivery routing.';

  const links =
    channel === 'whatsapp'
      ? [{ label: 'WhatsApp Business Manager', href: 'https://business.facebook.com/wa/manage/message-templates/' }]
      : channel === 'sms'
        ? [{ label: 'TRAI DLT guidelines', href: 'https://www.trai.gov.in/' }]
        : [{ label: 'Google RBM console', href: 'https://rbm.google.com/' }];

  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
      <div className="flex gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div>
          <p className="text-sm font-semibold text-amber-900">Approval happens outside Marbee</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/80">{copy}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 underline hover:text-amber-950"
              >
                {l.label}
                <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DateFields({
  registeredLabel,
  registeredAt,
  approvedAt,
  onRegisteredChange,
  onApprovedChange,
}: {
  registeredLabel: string;
  registeredAt?: string;
  approvedAt?: string;
  onRegisteredChange: (v: string) => void;
  onApprovedChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label>
        <span className={labelClass}>{registeredLabel}</span>
        <input type="date" value={registeredAt ?? ''} onChange={(e) => onRegisteredChange(e.target.value)} className={inputClass} />
      </label>
      <label>
        <span className={labelClass}>Approved on</span>
        <input type="date" value={approvedAt ?? ''} onChange={(e) => onApprovedChange(e.target.value)} className={inputClass} />
      </label>
    </div>
  );
}

function SmsDltForm({
  data,
  onChange,
}: {
  data: SmsDltApproval;
  onChange: (data: SmsDltApproval) => void;
}) {
  const patch = (next: Partial<SmsDltApproval>) => onChange({ ...data, ...next });

  return (
    <div className="space-y-4">
      <TemplateBuilderSection title="Registration status" description="Track DLT approval state for this SMS template">
        <StatusField status={data.status} onChange={(status) => patch({ status })} />
      </TemplateBuilderSection>

      <TemplateBuilderSection title="DLT template details" description="IDs from your principal entity / aggregator portal">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={labelClass}>Registered template name</span>
            <input
              value={data.template_name ?? ''}
              onChange={(e) => patch({ template_name: e.target.value })}
              placeholder="As shown on DLT portal"
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>DLT template ID</span>
            <input
              value={data.dlt_template_id ?? ''}
              onChange={(e) => patch({ dlt_template_id: e.target.value })}
              placeholder="1707xxxxxxxxx"
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
          <label>
            <span className={labelClass}>DLT entity ID (PE)</span>
            <input
              value={data.dlt_entity_id ?? ''}
              onChange={(e) => patch({ dlt_entity_id: e.target.value })}
              placeholder="1701xxxxxx"
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
          <label>
            <span className={labelClass}>Principal entity ID</span>
            <input
              value={data.principal_entity_id ?? ''}
              onChange={(e) => patch({ principal_entity_id: e.target.value })}
              placeholder="Optional PE reference"
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Sender ID / header</span>
            <input
              value={data.sender_id ?? ''}
              onChange={(e) => patch({ sender_id: e.target.value })}
              placeholder="MRBEE"
              maxLength={6}
              className={`${inputClass} uppercase`}
            />
          </label>
          <label>
            <span className={labelClass}>Message type</span>
            <select
              value={data.message_type ?? 'promotional'}
              onChange={(e) => patch({ message_type: e.target.value as SmsDltApproval['message_type'] })}
              className={inputClass}
            >
              <option value="promotional">Promotional</option>
              <option value="transactional">Transactional</option>
              <option value="service_implicit">Service implicit</option>
              <option value="service_explicit">Service explicit</option>
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>Operator / aggregator</span>
            <input
              value={data.operator ?? ''}
              onChange={(e) => patch({ operator: e.target.value })}
              placeholder="e.g. Jio, Airtel, MSG91, Gupshup"
              className={inputClass}
            />
          </label>
        </div>
      </TemplateBuilderSection>

      <TemplateBuilderSection title="Timeline & notes">
        <div className="space-y-3">
          <DateFields
            registeredLabel="Registered on"
            registeredAt={data.registered_at}
            approvedAt={data.approved_at}
            onRegisteredChange={(v) => patch({ registered_at: v })}
            onApprovedChange={(v) => patch({ approved_at: v })}
          />
          {data.status === 'rejected' && (
            <label>
              <span className={labelClass}>Rejection reason</span>
              <textarea
                value={data.rejection_reason ?? ''}
                onChange={(e) => patch({ rejection_reason: e.target.value })}
                rows={2}
                className={inputClass}
              />
            </label>
          )}
          <label>
            <span className={labelClass}>Internal notes</span>
            <textarea
              value={data.notes ?? ''}
              onChange={(e) => patch({ notes: e.target.value })}
              rows={2}
              placeholder="Portal reference, ticket ID, contact at aggregator…"
              className={inputClass}
            />
          </label>
        </div>
      </TemplateBuilderSection>
    </div>
  );
}

function WhatsAppMetaForm({
  data,
  onChange,
}: {
  data: WhatsAppMetaApproval;
  onChange: (data: WhatsAppMetaApproval) => void;
}) {
  const patch = (next: Partial<WhatsAppMetaApproval>) => onChange({ ...data, ...next });

  return (
    <div className="space-y-4">
      <TemplateBuilderSection title="Meta approval status">
        <StatusField status={data.status} onChange={(status) => patch({ status })} />
      </TemplateBuilderSection>

      <TemplateBuilderSection title="WhatsApp Business template" description="From Meta Business Manager → Message templates">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={labelClass}>Template name (Meta)</span>
            <input
              value={data.template_name ?? ''}
              onChange={(e) => patch({ template_name: e.target.value })}
              placeholder="order_shipped_v2"
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Meta template ID</span>
            <input
              value={data.meta_template_id ?? ''}
              onChange={(e) => patch({ meta_template_id: e.target.value })}
              placeholder="1234567890123456"
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
          <label>
            <span className={labelClass}>WABA ID</span>
            <input
              value={data.waba_id ?? ''}
              onChange={(e) => patch({ waba_id: e.target.value })}
              placeholder="WhatsApp Business Account ID"
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
          <label>
            <span className={labelClass}>Business account ID</span>
            <input
              value={data.business_account_id ?? ''}
              onChange={(e) => patch({ business_account_id: e.target.value })}
              placeholder="Meta Business portfolio ID"
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
          <label>
            <span className={labelClass}>Namespace</span>
            <input
              value={data.namespace ?? ''}
              onChange={(e) => patch({ namespace: e.target.value })}
              placeholder="Optional BSP namespace"
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Language</span>
            <input
              value={data.language ?? 'en'}
              onChange={(e) => patch({ language: e.target.value })}
              placeholder="en, en_US"
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Category</span>
            <select
              value={data.category ?? 'MARKETING'}
              onChange={(e) => patch({ category: e.target.value as WhatsAppMetaApproval['category'] })}
              className={inputClass}
            >
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
              <option value="AUTHENTICATION">Authentication</option>
            </select>
          </label>
          <label>
            <span className={labelClass}>Quality rating</span>
            <select
              value={data.quality_rating ?? 'UNKNOWN'}
              onChange={(e) => patch({ quality_rating: e.target.value as WhatsAppMetaApproval['quality_rating'] })}
              className={inputClass}
            >
              <option value="UNKNOWN">Unknown</option>
              <option value="GREEN">Green</option>
              <option value="YELLOW">Yellow</option>
              <option value="RED">Red</option>
            </select>
          </label>
        </div>
      </TemplateBuilderSection>

      <TemplateBuilderSection title="Timeline & notes">
        <div className="space-y-3">
          <DateFields
            registeredLabel="Submitted on"
            registeredAt={data.submitted_at}
            approvedAt={data.approved_at}
            onRegisteredChange={(v) => patch({ submitted_at: v })}
            onApprovedChange={(v) => patch({ approved_at: v })}
          />
          {data.status === 'rejected' && (
            <label>
              <span className={labelClass}>Rejection reason (from Meta)</span>
              <textarea
                value={data.rejection_reason ?? ''}
                onChange={(e) => patch({ rejection_reason: e.target.value })}
                rows={2}
                className={inputClass}
              />
            </label>
          )}
          <label>
            <span className={labelClass}>Internal notes</span>
            <textarea
              value={data.notes ?? ''}
              onChange={(e) => patch({ notes: e.target.value })}
              rows={2}
              placeholder="BSP ticket, resubmission notes…"
              className={inputClass}
            />
          </label>
        </div>
      </TemplateBuilderSection>
    </div>
  );
}

function RcsProviderForm({
  data,
  onChange,
}: {
  data: RcsProviderApproval;
  onChange: (data: RcsProviderApproval) => void;
}) {
  const patch = (next: Partial<RcsProviderApproval>) => onChange({ ...data, ...next });

  return (
    <div className="space-y-4">
      <TemplateBuilderSection title="Provider approval status">
        <StatusField status={data.status} onChange={(status) => patch({ status })} />
      </TemplateBuilderSection>

      <TemplateBuilderSection title="RCS template registration" description="From your RCS service provider console">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={labelClass}>Service provider</span>
            <input
              value={data.provider_name ?? ''}
              onChange={(e) => patch({ provider_name: e.target.value })}
              placeholder="Google RBM, Jio RCS, Vodafone…"
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Registered template name</span>
            <input
              value={data.template_name ?? ''}
              onChange={(e) => patch({ template_name: e.target.value })}
              placeholder="welcome_rich_card_v1"
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Template ID</span>
            <input
              value={data.template_id ?? ''}
              onChange={(e) => patch({ template_id: e.target.value })}
              placeholder="Provider-assigned template ID"
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
          <label>
            <span className={labelClass}>Agent / bot ID</span>
            <input
              value={data.agent_id ?? ''}
              onChange={(e) => patch({ agent_id: e.target.value })}
              placeholder="RCS agent identifier"
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
          <label>
            <span className={labelClass}>Route / campaign ID</span>
            <input
              value={data.route_id ?? ''}
              onChange={(e) => patch({ route_id: e.target.value })}
              placeholder="Routing reference for sends"
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Template type</span>
            <select
              value={data.template_type ?? 'rich_card'}
              onChange={(e) => patch({ template_type: e.target.value as RcsProviderApproval['template_type'] })}
              className={inputClass}
            >
              <option value="text">Text</option>
              <option value="rich_card">Rich card</option>
              <option value="carousel">Carousel</option>
              <option value="suggested_reply">Suggested reply</option>
            </select>
          </label>
        </div>
      </TemplateBuilderSection>

      <TemplateBuilderSection title="Timeline & notes">
        <div className="space-y-3">
          <DateFields
            registeredLabel="Submitted on"
            registeredAt={data.submitted_at}
            approvedAt={data.approved_at}
            onRegisteredChange={(v) => patch({ submitted_at: v })}
            onApprovedChange={(v) => patch({ approved_at: v })}
          />
          {data.status === 'rejected' && (
            <label>
              <span className={labelClass}>Rejection reason</span>
              <textarea
                value={data.rejection_reason ?? ''}
                onChange={(e) => patch({ rejection_reason: e.target.value })}
                rows={2}
                className={inputClass}
              />
            </label>
          )}
          <label>
            <span className={labelClass}>Internal notes</span>
            <textarea
              value={data.notes ?? ''}
              onChange={(e) => patch({ notes: e.target.value })}
              rows={2}
              placeholder="Provider contact, approval ticket…"
              className={inputClass}
            />
          </label>
        </div>
      </TemplateBuilderSection>
    </div>
  );
}

export function TemplateProviderApprovalPanel({ channel, approval, onChange }: Props) {
  const normalized = normalizeProviderApproval(approval, channel);
  const record = getProviderApprovalForChannel(normalized, channel);
  const status = record?.status;

  const handleChange = (patch: SmsDltApproval | WhatsAppMetaApproval | RcsProviderApproval) => {
    onChange(mergeProviderApproval(normalized, channel, patch));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{providerApprovalTabLabel(channel)}</h2>
          <p className="mt-0.5 text-sm text-slate-500">Link externally approved template IDs to this Marbee template.</p>
        </div>
        {status && (
          <Badge variant={approvalStatusBadgeVariant(status)}>
            {APPROVAL_STATUS_OPTIONS.find((o) => o.id === status)?.label ?? status}
          </Badge>
        )}
      </div>

      <ExternalNotice channel={channel} />

      {channel === 'sms' && record && (
        <SmsDltForm data={record as SmsDltApproval} onChange={handleChange} />
      )}
      {channel === 'whatsapp' && record && (
        <WhatsAppMetaForm data={record as WhatsAppMetaApproval} onChange={handleChange} />
      )}
      {channel === 'rcs' && record && (
        <RcsProviderForm data={record as RcsProviderApproval} onChange={handleChange} />
      )}
    </div>
  );
}

export function providerApprovalSummary(
  channel: ContentChannel,
  approval: TemplateProviderApproval | undefined,
): string | null {
  if (!approval) return null;
  const record = getProviderApprovalForChannel(approval, channel);
  if (!record) return null;

  if (channel === 'sms') {
    const d = record as SmsDltApproval;
    return d.dlt_template_id ? `DLT ${d.dlt_template_id}` : null;
  }
  if (channel === 'whatsapp') {
    const w = record as WhatsAppMetaApproval;
    return w.meta_template_id ? `Meta ${w.meta_template_id}` : w.template_name ?? null;
  }
  if (channel === 'rcs') {
    const r = record as RcsProviderApproval;
    return r.template_id ? `RCS ${r.template_id}` : r.template_name ?? null;
  }
  return null;
}
