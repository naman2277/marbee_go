import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  Eye,
  Filter,
  KeyRound,
  Lock,
  Search,
  Shield,
  Sparkles,
  Tag,
  User,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui';
import type { ColumnClassification, TableHealthProfile } from '@/lib/data-health-engine';

type Props = {
  profiles: TableHealthProfile[];
  selectedProfile: TableHealthProfile;
  onSelectProfile: (p: TableHealthProfile) => void;
};

const CLASSIFICATION_OPTIONS: { id: ColumnClassification; label: string }[] = [
  { id: 'email', label: 'Email Address' },
  { id: 'mobile', label: 'Mobile / Phone' },
  { id: 'customer_id', label: 'Customer ID' },
  { id: 'loyalty_id', label: 'Loyalty ID' },
  { id: 'booking_id', label: 'Booking ID' },
  { id: 'first_name', label: 'First Name' },
  { id: 'last_name', label: 'Last Name' },
  { id: 'dob', label: 'Date of Birth' },
  { id: 'country', label: 'Country / Geo' },
  { id: 'amount', label: 'Monetary Amount' },
  { id: 'consent', label: 'Consent / Opt-In' },
  { id: 'device_id', label: 'Device / Push Token' },
  { id: 'timestamp', label: 'Timestamp' },
  { id: 'status', label: 'Lifecycle Status' },
  { id: 'generic', label: 'Generic Attribute' },
];

export function DataAssetProfilerTab({
  profiles,
  selectedProfile,
  onSelectProfile,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCol, setExpandedCol] = useState<string | null>(null);
  const [approvedCols, setApprovedCols] = useState<Record<string, ColumnClassification>>({});

  const filteredColumns = selectedProfile.columns.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.classification.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.declaredType.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleApprove = (colName: string, classification: ColumnClassification) => {
    setApprovedCols((prev) => ({ ...prev, [colName]: classification }));
  };

  return (
    <div className="space-y-6">
      {/* Top Tables Grid / Dataset Switcher */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Data Assets & Tables Catalog</h3>
          </div>
          <span className="text-xs font-bold text-slate-500">{profiles.length} Tracked Assets</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {profiles.map((p) => {
            const isSelected = p.schemaId === selectedProfile.schemaId;
            return (
              <button
                key={p.schemaId}
                type="button"
                onClick={() => onSelectProfile(p)}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/40 shadow-sm ring-2 ring-indigo-600/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-black text-slate-900">{p.tableName}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                      p.healthScore >= 90
                        ? 'bg-emerald-100 text-emerald-800'
                        : p.healthScore >= 75
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {p.healthScore}/100
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 truncate">{p.schemaName}</p>

                <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500 font-medium">
                  <span>{p.recordCount.toLocaleString()} rows</span>
                  <span>{p.columnCount} columns</span>
                  <span className="flex items-center gap-1 text-emerald-700">
                    <Clock className="h-3 w-3" /> Fresh
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Contaminated Records Callout */}
      {selectedProfile.contaminatedRecords && selectedProfile.contaminatedRecords.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 space-y-3 shadow-2xs animate-in fade-in">
          <div className="flex items-center justify-between border-b border-rose-200/60 pb-2.5">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <h4 className="text-xs font-bold text-rose-950 uppercase tracking-wider">
                Identified Field Contaminations & Data Anomalies ({selectedProfile.contaminatedRecords.length})
              </h4>
            </div>
            <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[9px] font-black uppercase text-white">
              Data Quality Violation
            </span>
          </div>

          <div className="space-y-2">
            {selectedProfile.contaminatedRecords.map((c, i) => (
              <div
                key={i}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-rose-200/80 bg-white p-3 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to={`/customers/${c.recordId}`}
                      className="font-bold text-slate-900 hover:text-brand-600 transition underline decoration-rose-300"
                    >
                      {c.customerName}
                    </Link>
                    <span className="font-mono text-[10px] text-slate-400">ID: {c.recordId.slice(0, 8)}…</span>
                    <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold text-rose-800">
                      {c.field}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-medium">⚠️ {c.issue}</p>
                </div>

                <Link
                  to={`/customers/${c.recordId}`}
                  className="inline-flex items-center justify-center rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold px-2.5 py-1 text-[11px] border border-rose-200 shrink-0 transition"
                >
                  View Profile & Fix →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deep-Dive Column Profiler & Intelligent Classification */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Automatic Profiling & Column Recognition: <span className="font-mono text-indigo-700">{selectedProfile.tableName}</span>
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Infer null rates, unique patterns, PII flags, and verify AI recognized column types.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search columns or types…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-brand-200"
            />
          </div>
        </div>

        {/* Column Profiler Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-3">Column Name</th>
                <th className="py-3 px-3">Declared / Inferred</th>
                <th className="py-3 px-3">Intelligent Recognition</th>
                <th className="py-3 px-3">Null %</th>
                <th className="py-3 px-3">Unique %</th>
                <th className="py-3 px-3">Flags</th>
                <th className="py-3 px-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredColumns.map((col) => {
                const isExpanded = expandedCol === col.name;
                const activeClassification = approvedCols[col.name] || col.classification;
                const isApproved = Boolean(approvedCols[col.name]);

                return (
                  <tbody key={col.name} className="group">
                    <tr className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">
                        {col.name}
                      </td>
                      <td className="py-3 px-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                          {col.declaredType}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={activeClassification}
                            onChange={(e) => handleApprove(col.name, e.target.value as ColumnClassification)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-900 shadow-2xs focus:border-brand-300 focus:outline-hidden"
                          >
                            {CLASSIFICATION_OPTIONS.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>

                          {isApproved ? (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">
                              <Check className="h-2.5 w-2.5" /> Approved
                            </span>
                          ) : (
                            <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">
                              {col.classificationConfidence}% AI
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <span className="font-mono font-bold text-slate-800">{col.nullPercent}%</span>
                          <div className="h-1 w-16 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full ${col.nullPercent > 20 ? 'bg-rose-500' : 'bg-slate-400'}`}
                              style={{ width: `${col.nullPercent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <span className="font-mono font-bold text-slate-800">{col.uniquePercent}%</span>
                          <div className="h-1 w-16 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${col.uniquePercent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {col.isPrimaryKeyCandidate && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-800">
                              PK
                            </span>
                          )}
                          {col.isForeignKeyCandidate && (
                            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-black text-purple-800">
                              FK
                            </span>
                          )}
                          {col.isPii && (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-black text-rose-800">
                              PII
                            </span>
                          )}
                          {col.isIdentity && (
                            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-black text-indigo-800">
                              Identity
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => setExpandedCol(isExpanded ? null : col.name)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>

                    {/* Detailed Distribution & Anomalies Drawer */}
                    {isExpanded && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={7} className="p-4">
                          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <h4 className="text-xs font-bold text-slate-800">
                                Top Value Distributions & Cardinality Patterns for <code className="font-mono text-indigo-700">{col.name}</code>
                              </h4>
                              <span className="text-[11px] text-slate-500">
                                Total Unique Values: <strong className="text-slate-800">{col.uniqueCount}</strong>
                              </span>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                              {/* Top Values */}
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Top Observed Values</p>
                                {col.topValues.length === 0 ? (
                                  <p className="text-[11px] text-slate-400 italic">No values sampled</p>
                                ) : (
                                  col.topValues.map((tv, idx) => (
                                    <div key={idx} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1 text-[11px]">
                                      <span className="font-mono text-slate-800 truncate max-w-xs">{tv.value}</span>
                                      <span className="font-bold text-slate-500">{tv.count} ({tv.percent}%)</span>
                                    </div>
                                  ))
                                )}
                              </div>

                              {/* Anomalies & Outliers */}
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Detected Anomalies / Outliers</p>
                                {col.anomalies.length === 0 ? (
                                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-2.5 text-[11px] text-emerald-800 font-medium">
                                    ✓ Zero data format anomalies detected in this column.
                                  </div>
                                ) : (
                                  col.anomalies.map((anom, idx) => (
                                    <div key={idx} className="rounded-lg border border-rose-100 bg-rose-50/60 p-2 text-[11px] text-rose-900 font-medium">
                                      ⚠️ {anom}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
