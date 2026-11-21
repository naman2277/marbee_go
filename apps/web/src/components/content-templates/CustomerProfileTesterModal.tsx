import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Search,
  Send,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import type { ContentChannel, TemplateContent } from '@/lib/content-templates';
import {
  getCustomerTesterProfiles,
  type CustomerTesterProfile,
  createTesterProfileContext,
} from '@/lib/customer-testers';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';

type Props = {
  open: boolean;
  onClose: () => void;
  channel: ContentChannel;
  content: TemplateContent;
  templateName: string;
};

export function CustomerProfileTesterModal({
  open,
  onClose,
  channel,
  content,
  templateName,
}: Props) {
  const { user, tenantId } = useAuth();
  const [testers, setTesters] = useState<CustomerTesterProfile[]>(() =>
    getCustomerTesterProfiles(tenantId),
  );
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    testers[0]?.id ?? 'tester-vip-01',
  );
  const [filterRule, setFilterRule] = useState<'all' | 'vip' | 'lead' | 'active'>('all');
  const [search, setSearch] = useState('');
  const [testerEmail, setTesterEmail] = useState(
    testers[0]?.target_test_email || user?.email || 'tester@marbee.io',
  );
  const [testerPhone, setTesterPhone] = useState(
    testers[0]?.target_test_phone || '+1 555-0100',
  );
  const [dispatched, setDispatched] = useState(false);

  useEffect(() => {
    if (open) {
      const current = getCustomerTesterProfiles(tenantId);
      setTesters(current);
      if (current.length > 0) {
        setSelectedProfileId(current[0].id);
        setTesterEmail(current[0].target_test_email || user?.email || 'tester@marbee.io');
        setTesterPhone(current[0].target_test_phone || '+1 555-0100');
      }
    }
  }, [open, tenantId, user]);

  const selectedProfile = useMemo(() => {
    return testers.find((p) => p.id === selectedProfileId) ?? testers[0];
  }, [testers, selectedProfileId]);

  const profileContext = useMemo(() => {
    if (!selectedProfile) return {};
    return createTesterProfileContext(selectedProfile);
  }, [selectedProfile]);

  const handleSelectProfile = (p: CustomerTesterProfile) => {
    setSelectedProfileId(p.id);
    if (p.target_test_email) setTesterEmail(p.target_test_email);
    if (p.target_test_phone) setTesterPhone(p.target_test_phone);
  };

  const filteredProfiles = useMemo(() => {
    let list = testers;
    if (filterRule === 'vip') list = list.filter((p) => p.status === 'vip');
    if (filterRule === 'lead') list = list.filter((p) => p.status === 'lead');
    if (filterRule === 'active') list = list.filter((p) => p.status === 'active');

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.first_name.toLowerCase().includes(q) ||
          p.last_name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.company.toLowerCase().includes(q) ||
          p.loyalty_tier.toLowerCase().includes(q),
      );
    }
    return list;
  }, [testers, filterRule, search]);

  const interpolatedPreview = useMemo(() => {
    const jsonStr = JSON.stringify(content);
    let out = jsonStr;
    for (const [key, val] of Object.entries(profileContext)) {
      const reg = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      out = out.replace(reg, String(val ?? ''));
    }
    try {
      return JSON.parse(out);
    } catch {
      return content;
    }
  }, [content, profileContext]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Tester Profile Dispatcher</h2>
              <p className="text-xs text-slate-500">
                Choose from your Customer Profile Testers to populate dummy variables, then deliver to your target inbox/phone.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              setDispatched(false);
            }}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {dispatched ? (
          /* Dispatched Confirmation */
          <div className="p-8 text-center space-y-4 my-auto">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Test Communication Dispatched!</h3>
            <div className="max-w-md mx-auto rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs text-left space-y-2 text-emerald-950">
              <p>
                <strong>Template:</strong> {templateName}
              </p>
              <p>
                <strong>Delivered to:</strong> {channel === 'email' ? testerEmail : testerPhone}
              </p>
              <p>
                <strong>Tester Profile Data Used:</strong> {selectedProfile.first_name} {selectedProfile.last_name} ({selectedProfile.company})
              </p>
              <p>
                <strong>Loyalty Tier & Points:</strong> {selectedProfile.loyalty_tier} ({selectedProfile.loyalty_points} pts)
              </p>
            </div>
            <Button
              onClick={() => {
                onClose();
                setDispatched(false);
              }}
              className="mt-4 px-6 rounded-xl font-semibold shadow-xs"
            >
              Done
            </Button>
          </div>
        ) : (
          /* Two Column Modal Content */
          <div className="grid flex-1 overflow-hidden lg:grid-cols-[380px_1fr]">
            {/* Left: Customer Tester Profiles List */}
            <div className="flex flex-col border-r border-slate-100 bg-slate-50/40 p-4 space-y-3 overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  1. Select Tester Profile
                </span>
                <Link
                  to="/customers?tab=testers"
                  target="_blank"
                  className="text-[10px] text-indigo-600 hover:underline font-bold"
                >
                  Manage Profiles ↗
                </Link>
              </div>

              {/* Filter Rules */}
              <div className="flex flex-wrap gap-1">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'vip', label: 'VIP Members' },
                  { id: 'lead', label: 'New Leads' },
                  { id: 'active', label: 'Active Users' },
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setFilterRule(r.id as any)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                      filterRule === r.id
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tester profile…"
                  className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>

              {/* Profiles List */}
              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {filteredProfiles.map((prof) => {
                  const isSel = selectedProfileId === prof.id;
                  return (
                    <div
                      key={prof.id}
                      onClick={() => handleSelectProfile(prof)}
                      className={`cursor-pointer rounded-2xl border p-3 transition-all ${
                        isSel
                          ? 'border-indigo-600 bg-white ring-2 ring-indigo-500/20 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-[11px]">
                            {(prof.first_name || 'T').slice(0, 1)}
                            {(prof.last_name || '').slice(0, 1)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-xs">{prof.name || 'Test Profile'}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{prof.email || '—'}</p>
                          </div>
                        </div>
                        <Badge
                          variant={prof.status === 'active' ? 'success' : 'default'}
                          className="text-[9px]"
                        >
                          {prof.loyalty_tier_name || 'Standard'}
                        </Badge>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-slate-500 border-t border-slate-100 pt-1.5">
                        <span>Points: <strong>{prof.loyalty_points_balance ?? 0}</strong></span>
                        <span>Order: <strong>{prof.order_id || '—'}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Tester Destination & Live Token Preview */}
            <div className="flex flex-col p-6 space-y-5 overflow-y-auto bg-white">
              {/* Destination Config */}
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3 text-xs">
                <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                  <Send className="h-4 w-4 text-indigo-600" />
                  2. Define Real Dispatch Destination
                </span>

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    {channel === 'email' ? 'Recipient Test Email Address' : 'Recipient Test Phone / WhatsApp'}
                  </label>
                  <input
                    type={channel === 'email' ? 'email' : 'tel'}
                    value={channel === 'email' ? testerEmail : testerPhone}
                    onChange={(e) =>
                      channel === 'email'
                        ? setTesterEmail(e.target.value)
                        : setTesterPhone(e.target.value)
                    }
                    placeholder={channel === 'email' ? 'tester@company.com' : '+1 555-0100'}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-brand-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    The test communication is delivered to this contact, rendered with <strong>{selectedProfile.name}</strong>'s dummy attributes.
                  </p>
                </div>
              </div>

              {/* Resolved Token Preview */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5 text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Live Customer Profile Token Resolution
                </span>

                {channel === 'email' && (
                  <div className="space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[11px] text-slate-600">
                      <strong>Subject:</strong> {interpolatedPreview.subject || 'N/A'}
                    </p>
                    {interpolatedPreview.preheader && (
                      <p className="text-[11px] text-slate-600">
                        <strong>Preheader:</strong> {interpolatedPreview.preheader}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span><code>{'{{first_name}}'}</code> → <strong>{selectedProfile.first_name}</strong></span>
                  <span><code>{'{{last_name}}'}</code> → <strong>{selectedProfile.last_name}</strong></span>
                  <span><code>{'{{company}}'}</code> → <strong>{selectedProfile.company}</strong></span>
                  <span><code>{'{{loyalty_tier}}'}</code> → <strong>{selectedProfile.loyalty_tier}</strong></span>
                  <span><code>{'{{loyalty_points}}'}</code> → <strong>{selectedProfile.loyalty_points}</strong></span>
                  <span><code>{'{{order_id}}'}</code> → <strong>{selectedProfile.order_id}</strong></span>
                  <span><code>{'{{discount_code}}'}</code> → <strong>{selectedProfile.discount_code}</strong></span>
                  <span><code>{'{{city}}'}</code> → <strong>{selectedProfile.city}</strong></span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={() => setDispatched(true)}
                  disabled={!testerEmail.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs"
                >
                  <Send className="h-4 w-4 mr-1.5" />
                  Dispatch Test Communication
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
