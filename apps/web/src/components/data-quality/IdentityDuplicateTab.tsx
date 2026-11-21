import { useState } from 'react';
import {
  ArrowRight,
  GitMerge,
  Link2,
  Mail,
  Merge,
  Smartphone,
  Tag,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui';
import type { TableHealthProfile } from '@/lib/data-health-engine';

type Props = {
  profile: TableHealthProfile;
};

export function IdentityDuplicateTab({ profile }: Props) {
  const [matchMode, setMatchMode] = useState<'email' | 'mobile' | 'email_mobile' | 'fuzzy'>('email');
  const [selectedClusterIdx, setSelectedClusterIdx] = useState(0);
  const [resolvedClusters, setResolvedClusters] = useState<number[]>([]);

  const clusters = profile.duplicateClusters;
  const currentCluster = clusters[selectedClusterIdx] || clusters[0];

  const handleMerge = (idx: number) => {
    if (!resolvedClusters.includes(idx)) {
      setResolvedClusters([...resolvedClusters, idx]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Identity Matching Config */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <GitMerge className="h-4 w-4 text-purple-600" />
              <h3 className="text-sm font-bold text-slate-900">Duplicate & Identity Intelligence Engine</h3>
            </div>
            <p className="text-xs text-slate-500">
              Detect cross-channel customer duplicates with exact, normalized, and fuzzy matching.
            </p>
          </div>

          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-2xs">
            {([
              { id: 'email', label: 'Email Exact' },
              { id: 'mobile', label: 'Mobile Exact' },
              { id: 'email_mobile', label: 'Email + Mobile' },
              { id: 'fuzzy', label: 'Fuzzy Match' },
            ] as const).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMatchMode(m.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  matchMode === m.id
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Visual Customer Identity Graph */}
        <div className="rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50/50 via-indigo-50/30 to-slate-50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-purple-700" />
              <h4 className="text-xs font-bold text-purple-950 uppercase tracking-wider">
                Unified Customer Identity Graph
              </h4>
            </div>
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-800">
              Deterministic + Probabilistic Links
            </span>
          </div>

          {/* Node Graph Flow */}
          <div className="flex flex-wrap items-center justify-center gap-3 py-4">
            <div className="flex items-center gap-2 rounded-2xl border-2 border-indigo-500 bg-white px-4 py-2.5 shadow-sm">
              <User className="h-4 w-4 text-indigo-600" />
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Master Identifier</p>
                <p className="font-mono text-xs font-black text-slate-900">CUST-849201</p>
              </div>
            </div>

            <ArrowRight className="h-4 w-4 text-purple-400" />

            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 shadow-2xs">
              <Mail className="h-3.5 w-3.5 text-brand-600" />
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Email (Verified)</p>
                <p className="font-mono text-xs font-bold text-slate-800">sarah.j@example.com</p>
              </div>
            </div>

            <ArrowRight className="h-4 w-4 text-purple-400" />

            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 shadow-2xs">
              <Smartphone className="h-3.5 w-3.5 text-emerald-600" />
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Mobile (E.164)</p>
                <p className="font-mono text-xs font-bold text-slate-800">+1 415-555-0199</p>
              </div>
            </div>

            <ArrowRight className="h-4 w-4 text-purple-400" />

            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 shadow-2xs">
              <Tag className="h-3.5 w-3.5 text-amber-600" />
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Loyalty ID</p>
                <p className="font-mono text-xs font-bold text-slate-800">GOLD-9941</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Duplicate Cluster Resolution Center */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left List of Duplicate Clusters */}
        <div className="space-y-3 lg:col-span-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Detected Duplicate Clusters ({clusters.length})
          </h4>

          {clusters.map((cl, idx) => {
            const isSelected = selectedClusterIdx === idx;
            const isResolved = resolvedClusters.includes(idx);

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedClusterIdx(idx)}
                className={`w-full rounded-2xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-purple-600 bg-purple-50/40 shadow-sm ring-2 ring-purple-600/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900">{cl.matchType}</span>
                  {isResolved ? (
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      ✓ Merged
                    </span>
                  ) : (
                    <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800">
                      {cl.duplicateCount} Duplicates
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {cl.affectedRecords} affected customer records ready for unification.
                </p>
              </button>
            );
          })}
        </div>

        {/* Right Master Record vs Duplicate Comparison Box */}
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Merge & Conflict Resolution</h4>
                <p className="text-xs text-slate-500">Recommended Master Record vs Conflicting Secondary Profiles</p>
              </div>
              <Button
                size="sm"
                onClick={() => handleMerge(selectedClusterIdx)}
                disabled={resolvedClusters.includes(selectedClusterIdx)}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs"
              >
                <Merge className="mr-1.5 h-3.5 w-3.5" />
                {resolvedClusters.includes(selectedClusterIdx) ? 'Merged' : 'Merge to Master'}
              </Button>
            </div>

            <div className="space-y-3">
              {/* Master Record Card */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                    Master Record (Retain)
                  </span>
                  <span className="font-mono text-xs font-bold text-emerald-950">
                    ID: {currentCluster?.sampleGroup.masterId}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400">Name:</span> <strong className="text-slate-800">Sarah Jenkins</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Email:</span> <strong className="text-slate-800">sarah@domain.com</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">City:</span> <strong className="text-slate-800">San Francisco</strong>
                  </div>
                </div>
              </div>

              {/* Duplicate Secondary Cards */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Conflicting Secondary Records (To Merge)</p>
                {currentCluster?.sampleGroup.duplicates.map((dupId, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-bold text-slate-800">ID: {dupId}</span>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Conflicting fields: {currentCluster.sampleGroup.conflictFields.join(', ')}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      98% Confidence Match
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
