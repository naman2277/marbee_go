import { useState } from 'react';
import {
  Edit2,
  MapPin,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import {
  getCustomerTesterProfiles,
  saveCustomerTesterProfiles,
  resetCustomerTesterProfiles,
  type CustomerTesterProfile,
} from '@/lib/customer-testers';
import { useAuth } from '@/contexts/AuthContext';

export function CustomerTestersPanel() {
  const { tenantId } = useAuth();
  const [testers, setTesters] = useState<CustomerTesterProfile[]>(() =>
    getCustomerTesterProfiles(tenantId),
  );
  const [editingTester, setEditingTester] = useState<CustomerTesterProfile | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [feedback, setFeedback] = useState('');

  const showNotification = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 3000);
  };

  const handleSave = (updated: CustomerTesterProfile) => {
    let next: CustomerTesterProfile[];
    if (isCreating) {
      next = [...testers, { ...updated, id: `tester-${Date.now()}` }];
    } else {
      next = testers.map((t) => (t.id === updated.id ? updated : t));
    }
    setTesters(next);
    saveCustomerTesterProfiles(next, tenantId);
    setEditingTester(null);
    setIsCreating(false);
    showNotification(isCreating ? 'Tester profile created' : 'Tester profile updated');
  };

  const handleDelete = (id: string) => {
    const next = testers.filter((t) => t.id !== id);
    setTesters(next);
    saveCustomerTesterProfiles(next, tenantId);
    showNotification('Tester profile removed');
  };

  const handleReset = () => {
    const next = resetCustomerTesterProfiles(tenantId);
    setTesters(next);
    showNotification('Reset to standard test profiles');
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm">
              Tester Customer Profiles (Matching All Customer Schema Columns)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              These profiles populate real customer profile schema fields (demographics, location, loyalty, consents) in template testing, and allow defining where test communications are actually dispatched.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReset}
            className="rounded-xl shadow-2xs text-xs font-semibold"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset Defaults
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setIsCreating(true);
              setEditingTester({
                id: '',
                name: 'Custom Test Customer',
                title: 'Ms.',
                first_name: 'Jane',
                middle_name: '',
                last_name: 'Doe',
                email: 'jane.doe@example.com',
                mobile: '+1 555-0100',
                mobile_country_code: '+1',
                dob: '1992-06-15',
                gender: 'female',
                city: 'San Francisco',
                state: 'California',
                country: 'United States',
                pincode: '94105',
                status: 'active',
                consent_email: true,
                consent_sms: true,
                consent_whatsapp: true,
                consent_web_push: true,
                loyalty_member: true,
                loyalty_program_name: 'Marbee Rewards',
                loyalty_tier_name: 'Gold Tier',
                loyalty_tier_slug: 'gold',
                loyalty_points_balance: 500,
                loyalty_lifetime_points: 1200,
                loyalty_status: 'active',
                order_id: 'ORD-5001',
                order_total: '$99.00',
                discount_code: 'TEST20',
                target_test_email: 'tester@marbee.io',
                target_test_phone: '+1 555-0100',
              });
            }}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Test Profile
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 animate-in fade-in">
          {feedback}
        </div>
      )}

      {/* Testers Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {testers.map((t) => (
          <div
            key={t.id}
            className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs hover:border-slate-300 hover:shadow-md transition"
          >
            <div>
              {/* Header */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700 text-xs">
                    {(t.first_name || 'T').slice(0, 1)}
                    {(t.last_name || '').slice(0, 1)}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">{t.name || 'Test Profile'}</h4>
                    <p className="text-[10px] text-slate-400 font-mono">{t.email || '—'}</p>
                  </div>
                </div>

                <Badge
                  variant={t.status === 'active' ? 'success' : 'default'}
                  className="text-[10px] uppercase font-bold"
                >
                  {t.status || 'active'}
                </Badge>
              </div>

              {/* Exact Customer Table Columns Display */}
              <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600 space-y-1.5 font-medium border border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-400">Full Name:</span>
                  <span className="font-semibold text-slate-800">
                    {t.title ? `${t.title} ` : ''}{t.first_name} {t.middle_name ? `${t.middle_name} ` : ''}{t.last_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Mobile Phone:</span>
                  <span className="font-mono text-slate-800">{t.mobile}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">DOB & Gender:</span>
                  <span className="text-slate-700 capitalize">{t.dob || '—'} · {t.gender || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Location / Pincode:</span>
                  <span className="font-semibold text-slate-800">{t.city}, {t.state} ({t.pincode})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Loyalty Tier & Balance:</span>
                  <span className="font-bold text-indigo-600">
                    {t.loyalty_tier_name} · {t.loyalty_points_balance} pts
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Order / Voucher:</span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    {t.order_id} · {t.discount_code}
                  </span>
                </div>
              </div>

              {/* Real Dispatch Target */}
              <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-2.5 text-[10px] text-indigo-950 space-y-1">
                <span className="font-bold flex items-center gap-1">
                  <Send className="h-3 w-3 text-indigo-600" />
                  Real Dispatch Destination:
                </span>
                <p className="truncate">Email: <strong>{t.target_test_email || 'Not set'}</strong></p>
                <p className="truncate">Phone: <strong>{t.target_test_phone || 'Not set'}</strong></p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-mono">ID: {t.id}</span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingTester(t);
                  }}
                  className="rounded-lg text-xs font-semibold py-1 px-2.5"
                >
                  <Edit2 className="h-3 w-3 mr-1" />
                  Edit Profile
                </Button>
                <button
                  type="button"
                  onClick={() => handleDelete(t.id)}
                  title="Delete tester profile"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit / Create Modal Matching Customer Schema Columns */}
      {editingTester && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl overflow-y-auto max-h-[90vh] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white">
                  <UserCheck className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {isCreating ? 'Create Tester Customer Profile' : 'Edit Tester Customer Profile'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingTester(null)}
                className="rounded-xl p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave(editingTester);
              }}
              className="space-y-4 text-xs"
            >
              {/* Profile Label */}
              <div>
                <label className="mb-1 block font-bold text-slate-700">Tester Profile Display Name</label>
                <input
                  type="text"
                  required
                  value={editingTester.name}
                  onChange={(e) => setEditingTester({ ...editingTester, name: e.target.value })}
                  placeholder="e.g. Sarah Connor (Platinum VIP)"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Exact Customer Columns: Identity */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
                <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-indigo-600" />
                  Customer Identity Columns
                </span>

                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-600">Title</label>
                    <select
                      value={editingTester.title ?? 'Mr.'}
                      onChange={(e) => setEditingTester({ ...editingTester, title: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-2 py-1.5 text-xs bg-white"
                    >
                      <option value="Mr.">Mr.</option>
                      <option value="Ms.">Ms.</option>
                      <option value="Mrs.">Mrs.</option>
                      <option value="Dr.">Dr.</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-600">First Name</label>
                    <input
                      type="text"
                      required
                      value={editingTester.first_name}
                      onChange={(e) => setEditingTester({ ...editingTester, first_name: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-600">Middle Name</label>
                    <input
                      type="text"
                      value={editingTester.middle_name ?? ''}
                      onChange={(e) => setEditingTester({ ...editingTester, middle_name: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-600">Last Name</label>
                    <input
                      type="text"
                      required
                      value={editingTester.last_name}
                      onChange={(e) => setEditingTester({ ...editingTester, last_name: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-600">Email (Customer Column)</label>
                    <input
                      type="email"
                      required
                      value={editingTester.email}
                      onChange={(e) => setEditingTester({ ...editingTester, email: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-600">Mobile (Customer Column)</label>
                    <input
                      type="text"
                      required
                      value={editingTester.mobile}
                      onChange={(e) => setEditingTester({ ...editingTester, mobile: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-600">Date of Birth (DOB)</label>
                    <input
                      type="date"
                      value={editingTester.dob ?? ''}
                      onChange={(e) => setEditingTester({ ...editingTester, dob: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-600">Gender</label>
                    <select
                      value={editingTester.gender ?? 'female'}
                      onChange={(e) => setEditingTester({ ...editingTester, gender: e.target.value as any })}
                      className="w-full rounded-xl border border-slate-200 px-2 py-1.5 text-xs bg-white capitalize"
                    >
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                      <option value="undisclosed">Undisclosed</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Exact Customer Columns: Location */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
                <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-indigo-600" />
                  Location Columns (City, State, Country, Pincode)
                </span>

                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-600">City</label>
                    <input
                      type="text"
                      value={editingTester.city}
                      onChange={(e) => setEditingTester({ ...editingTester, city: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-600">State</label>
                    <input
                      type="text"
                      value={editingTester.state}
                      onChange={(e) => setEditingTester({ ...editingTester, state: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-600">Country</label>
                    <input
                      type="text"
                      value={editingTester.country}
                      onChange={(e) => setEditingTester({ ...editingTester, country: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-600">Pincode</label>
                    <input
                      type="text"
                      value={editingTester.pincode}
                      onChange={(e) => setEditingTester({ ...editingTester, pincode: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Exact Customer Columns: Loyalty */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
                <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                  Loyalty Columns (Program, Tier, Points Balance)
                </span>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-600">Tier Name</label>
                    <input
                      type="text"
                      value={editingTester.loyalty_tier_name}
                      onChange={(e) => setEditingTester({ ...editingTester, loyalty_tier_name: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-600">Points Balance</label>
                    <input
                      type="number"
                      value={editingTester.loyalty_points_balance}
                      onChange={(e) => setEditingTester({ ...editingTester, loyalty_points_balance: Number(e.target.value) })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-600">Order ID</label>
                    <input
                      type="text"
                      value={editingTester.order_id}
                      onChange={(e) => setEditingTester({ ...editingTester, order_id: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Real Destination Override */}
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
                <span className="font-bold text-indigo-950 text-xs flex items-center gap-1.5">
                  <Send className="h-3.5 w-3.5 text-indigo-600" />
                  Target Delivery Destination (Where real test emails / SMS are sent)
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Target Test Email</label>
                    <input
                      type="email"
                      required
                      value={editingTester.target_test_email}
                      onChange={(e) =>
                        setEditingTester({ ...editingTester, target_test_email: e.target.value })
                      }
                      placeholder="you@company.com"
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Target Test Phone</label>
                    <input
                      type="text"
                      value={editingTester.target_test_phone}
                      onChange={(e) =>
                        setEditingTester({ ...editingTester, target_test_phone: e.target.value })
                      }
                      placeholder="+1 555-0100"
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <Button variant="secondary" type="button" onClick={() => setEditingTester(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl">
                  Save Tester Profile
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
