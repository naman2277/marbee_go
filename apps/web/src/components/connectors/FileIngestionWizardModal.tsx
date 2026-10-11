import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Database,
  Download,
  Eye,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  Globe,
  KeyRound,
  Layers,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table,
  UploadCloud,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import type { SchemaWithFields } from '@/lib/fetch-schemas';
import {
  autoDetectColumnMapping,
  downloadSampleCsvTemplate,
  downloadSampleExcelTemplate,
  executeFileIngestionBatch,
  getSampleValueForField,
  parseUploadedFile,
  saveConnectorConnection,
  transformRow,
  type IngestionScheduleConfig,
  type IngestMappingField,
} from '@/lib/file-ingestion-engine';

function playSuccessPingSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.12);
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1320, now + 0.06);
    gain2.gain.setValueAtTime(0.22, now + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.65);
    osc2.start(now + 0.06);
    osc2.stop(now + 0.55);
  } catch (err) {
    console.warn('Audio playback error:', err);
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  schemas: SchemaWithFields[];
  onComplete?: () => void;
  editConnector?: {
    id: string;
    name: string;
    targetSchemaId?: string;
    config?: Record<string, unknown>;
    mapping?: unknown;
  } | null;
  initialStep?: WizardStep;
};

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'IST (India Standard Time - UTC+5:30)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time - UTC+0)' },
  { value: 'America/New_York', label: 'EST / EDT (Eastern Time - UTC-5)' },
  { value: 'America/Los_Angeles', label: 'PST / PDT (Pacific Time - UTC-8)' },
  { value: 'Europe/London', label: 'GMT / BST (London - UTC+1)' },
  { value: 'Asia/Singapore', label: 'SGT (Singapore Time - UTC+8)' },
  { value: 'Asia/Dubai', label: 'GST (Gulf Standard Time - UTC+4)' },
];

const DAYS_OF_WEEK = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

export function FileIngestionWizardModal({
  open,
  onClose,
  schemas,
  onComplete,
  editConnector,
  initialStep = 1,
}: Props) {
  const { tenantId, environment } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>(initialStep);
  const [connectionName, setConnectionName] = useState(
    editConnector?.name || 'Local File Ingest to Customer Master'
  );

  // Step 1: Target Schema Selection
  const initialSchema =
    (editConnector?.config?.target_schema_id as string) ||
    schemas.find((s) => s.slug === 'customer')?.id ||
    schemas[0]?.id ||
    '';

  const [selectedSchemaId, setSelectedSchemaId] = useState<string>(initialSchema);

  useEffect(() => {
    if (editConnector) {
      if (editConnector.name) setConnectionName(editConnector.name);
      if (editConnector.config?.target_schema_id) {
        setSelectedSchemaId(editConnector.config.target_schema_id as string);
      }
    }
  }, [editConnector]);

  useEffect(() => {
    if (!selectedSchemaId && schemas.length > 0) {
      const def =
        (editConnector?.config?.target_schema_id as string) ||
        schemas.find((s) => s.slug === 'customer')?.id ||
        schemas[0].id;
      setSelectedSchemaId(def);
    }
  }, [schemas, selectedSchemaId, editConnector]);

  const selectedSchema = useMemo(() => {
    return schemas.find((s) => s.id === selectedSchemaId) || schemas[0];
  }, [schemas, selectedSchemaId]);

  // Step 2: Uploaded File State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileStats, setFileStats] = useState<{
    headers: string[];
    rows: Record<string, unknown>[];
    rowCount: number;
    fileSizeFormatted: string;
  } | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Step 3: Column Mapping State
  const [mappings, setMappings] = useState<IngestMappingField[]>([]);

  // Step 5: Advanced Scheduler & Execution Settings
  const [scheduleConfig, setScheduleConfig] = useState<IngestionScheduleConfig>({
    mode: 'run_once',
    startDate: new Date().toISOString().split('T')[0],
    startTime: '09:30',
    timezone: 'Asia/Kolkata',
    cadence: 'daily',
    weeklyDays: [1, 2, 3, 4, 5],
    monthlyDay: 1,
    ingestMode: 'upsert',
    errorHandling: 'skip_and_continue',
  });

  // Step 6: Execution Progress & Results
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    totalProcessed: number;
    insertedCount: number;
    errorCount: number;
    errorMessages: string[];
  } | null>(null);

  // When Schema changes or Step 2 completes, calculate default auto-mapping
  const handleFileParsed = (parsed: {
    headers: string[];
    rows: Record<string, unknown>[];
    rowCount: number;
    fileSizeFormatted: string;
  }) => {
    setFileStats(parsed);
    if (selectedSchema) {
      const autoMapped = autoDetectColumnMapping(parsed.headers, selectedSchema);
      const savedList = (editConnector?.mapping ?? []) as Array<{
        source_field?: string | null;
        target_field?: string;
        type_cast?: IngestMappingField['typeCast'];
        transforms?: IngestMappingField['transform'];
      }>;

      if (savedList.length > 0) {
        const merged = autoMapped.map((m) => {
          const matchedSaved = savedList.find((s) => s.target_field === m.schemaField);
          if (matchedSaved) {
            return {
              ...m,
              sourceHeader:
                matchedSaved.source_field && parsed.headers.includes(matchedSaved.source_field)
                  ? matchedSaved.source_field
                  : m.sourceHeader,
              typeCast: matchedSaved.type_cast || m.typeCast,
              transform: matchedSaved.transforms ? { ...m.transform, ...matchedSaved.transforms } : m.transform,
              confidence: 100,
            };
          }
          return m;
        });
        setMappings(merged);
      } else {
        setMappings(autoMapped);
      }
    }
  };

  const handleFileUpload = async (file: File) => {
    setParseError(null);
    setIsParsing(true);
    try {
      setUploadedFile(file);
      const parsed = await parseUploadedFile(file);
      handleFileParsed(parsed);
      setConnectionName(`File Ingest: ${file.name} to ${selectedSchema?.name || 'Schema'}`);
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setIsParsing(false);
    }
  };

  // Transformation Live Preview Rows (First 3)
  const transformedPreviewRows = useMemo(() => {
    if (!fileStats?.rows?.length) return [];
    return fileStats.rows.slice(0, 3).map((r) => transformRow(r, mappings));
  }, [fileStats, mappings]);

  // Execute Batch Ingestion
  const handleRunIngestion = async () => {
    if (!selectedSchema || !fileStats?.rows?.length) return;

    setIsExecuting(true);
    setExecutionProgress(5);
    setExecutionResult(null);

    try {
      // 1. Save Connection Job in Supabase
      await saveConnectorConnection(
        tenantId,
        environment,
        connectionName,
        selectedSchema.id,
        uploadedFile?.name || 'uploaded_data.csv',
        mappings,
        scheduleConfig
      );

      // 2. Ingest Rows in Batches
      const res = await executeFileIngestionBatch(
        tenantId,
        environment,
        selectedSchema,
        fileStats.rows,
        mappings,
        scheduleConfig,
        (pct) => setExecutionProgress(pct)
      );

      setExecutionResult(res);
      playSuccessPingSound();

      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['schemas-health'] });
    } catch (err: unknown) {
      setExecutionResult({
        success: false,
        totalProcessed: fileStats.rowCount,
        insertedCount: 0,
        errorCount: fileStats.rowCount,
        errorMessages: [err instanceof Error ? err.message : 'Ingestion execution failed'],
      });
    } finally {
      setIsExecuting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/60"
        aria-label="Close modal"
        onClick={onClose}
      />

      <div className="relative flex flex-col h-[90vh] max-h-[820px] w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xs">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">CSV & Excel Ingestion Connection</h2>
              <p className="text-xs text-slate-500">
                Load records from local machine into schema with auto-mapping, typecasting & scheduler.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper Bar */}
        <div className="border-b border-slate-100 bg-slate-50/40 px-6 py-2.5 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-[620px]">
            {[
              { num: 1, label: '1. Select Schema & Template' },
              { num: 2, label: '2. Upload Local File' },
              { num: 3, label: '3. Column Mapping' },
              { num: 4, label: '4. Transform & Cast' },
              { num: 5, label: '5. Advanced Schedule' },
              { num: 6, label: '6. Ingest & Run' },
            ].map((s) => {
              const isCurrent = step === s.num;
              const isPassed = step > s.num;
              return (
                <button
                  key={s.num}
                  type="button"
                  onClick={() => {
                    if (isPassed) setStep(s.num as WizardStep);
                  }}
                  disabled={!isPassed && !isCurrent}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition shrink-0 ${
                    isCurrent
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : isPassed
                      ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                      : 'text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isPassed ? <Check className="h-3 w-3" /> : <span>{s.num}.</span>}
                  <span>{s.label.split('. ')[1]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* STEP 1: Schema Selection & Download Sample Template */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Step 1: Choose Target Schema</h3>
                <p className="text-xs text-slate-500">
                  Select which schema dataset to populate. Download a sample CSV/Excel header template to format your records.
                </p>
              </div>

              {/* Schema Selection Grid */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {schemas.map((s) => {
                  const isSelected = s.id === selectedSchemaId;
                  const fieldCount = s.schema_fields?.length ?? 0;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSchemaId(s.id)}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-slate-900">{s.name}</span>
                        {isSelected && <Check className="h-4 w-4 text-indigo-600" />}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500 font-mono">table: {s.table_name || s.slug}</p>
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                        <span>{fieldCount} Fields</span>
                        <span>·</span>
                        <span className="text-indigo-600 uppercase">{s.status || 'active'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Schema Fields & Sample Data Generator */}
              {selectedSchema && (
                <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/60 via-purple-50/40 to-slate-50 p-5 space-y-4 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-indigo-100/80 pb-3">
                    <div>
                      <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                        Sample Template Generator: {selectedSchema.name}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Pre-populated with required headers, data types & valid format examples.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => downloadSampleCsvTemplate(selectedSchema)}
                        className="font-bold text-xs bg-white hover:bg-slate-100 shadow-2xs"
                      >
                        <Download className="mr-1.5 h-3.5 w-3.5 text-indigo-600" />
                        Download Sample CSV
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => downloadSampleExcelTemplate(selectedSchema)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs"
                      >
                        <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                        Download Sample Excel (.xlsx)
                      </Button>
                    </div>
                  </div>

                  {/* Field Chips Preview */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Expected Schema Headers ({selectedSchema.schema_fields?.length ?? 0}):
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {selectedSchema.schema_fields?.map((f) => (
                        <span
                          key={f.name}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-700 shadow-2xs flex items-center gap-1"
                        >
                          <span className="font-bold">{f.name}</span>
                          <span className="text-[9px] text-slate-400">({f.field_type})</span>
                          {f.is_primary_key && (
                            <span className="rounded bg-amber-100 px-1 text-[8px] font-black text-amber-800">
                              PK
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Upload Local File */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Step 2: Upload CSV or Excel File</h3>
                <p className="text-xs text-slate-500">
                  Select your formatted `.csv`, `.xlsx`, `.xls`, or `.tsv` data file from your local machine.
                </p>
              </div>

              {/* Drag & Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) {
                    handleFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                className={`flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
                  uploadedFile
                    ? 'border-emerald-400 bg-emerald-50/30'
                    : 'border-slate-300 bg-slate-50/50 hover:border-indigo-400 hover:bg-indigo-50/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.tsv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                />

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 shadow-sm mb-3">
                  <UploadCloud className="h-7 w-7" />
                </div>

                <h4 className="text-sm font-bold text-slate-900">
                  {uploadedFile ? uploadedFile.name : 'Click or Drag & Drop File Here'}
                </h4>
                <p className="mt-1 text-xs text-slate-500 max-w-sm">
                  Supports CSV, Microsoft Excel (.xlsx, .xls), and TSV files up to 25MB.
                </p>

                {uploadedFile && fileStats && (
                  <div className="mt-4 flex items-center gap-3 rounded-xl bg-white px-4 py-2 border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs">
                    <span className="text-emerald-700 font-mono">✓ {fileStats.rowCount.toLocaleString()} Rows Detected</span>
                    <span>·</span>
                    <span>{fileStats.headers.length} Columns</span>
                    <span>·</span>
                    <span>{fileStats.fileSizeFormatted}</span>
                  </div>
                )}
              </div>

              {parseError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Raw Parsed Data Preview Table */}
              {fileStats && fileStats.rows.length > 0 && (
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">File Preview (First 5 Rows):</span>
                    <span className="text-[11px] text-slate-400 font-mono">{fileStats.rowCount} total records</span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                          {fileStats.headers.map((h) => (
                            <th key={h} className="px-3 py-2 font-mono text-[11px]">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {fileStats.rows.slice(0, 5).map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/60 font-mono text-[11px]">
                            {fileStats.headers.map((h) => (
                              <td key={h} className="px-3 py-2 text-slate-700 truncate max-w-[160px]">
                                {String(row[h] ?? '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Auto-Detect Headers & Column Mapping */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Step 3: Column Mapping & Key Identification</h3>
                  <p className="text-xs text-slate-500">
                    Map headers from your file to target schema attributes. Key columns are used for identity resolution.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                    {mappings.filter((m) => m.sourceHeader).length} of {mappings.length} Mapped
                  </span>
                </div>
              </div>

              {/* Key Identifiers Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <KeyRound className="h-4 w-4 text-amber-600" />
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Key & Unique Identifier Columns
                  </h4>
                </div>

                <div className="space-y-2">
                  {mappings
                    .filter((m) => m.isKey)
                    .map((m) => (
                      <div
                        key={m.schemaField}
                        className="grid grid-cols-12 gap-3 items-center rounded-2xl border border-amber-200 bg-amber-50/40 p-3 text-xs"
                      >
                        <div className="col-span-4 space-y-0.5">
                          <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900">
                            <span>{m.schemaField}</span>
                            <span className="rounded bg-amber-200 text-amber-900 px-1 py-0.2 text-[8px] font-black uppercase">
                              KEY
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500">Type: {m.fieldType}</p>
                        </div>

                        <div className="col-span-1 text-center font-bold text-slate-400">→</div>

                        <div className="col-span-5">
                          <select
                            value={m.sourceHeader ?? ''}
                            onChange={(e) => {
                              const val = e.target.value || null;
                              setMappings((prev) =>
                                prev.map((item) =>
                                  item.schemaField === m.schemaField
                                    ? { ...item, sourceHeader: val, confidence: val ? 100 : 0 }
                                    : item
                                )
                              );
                            }}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono text-slate-800 focus:border-indigo-400 focus:outline-hidden"
                          >
                            <option value="">-- Do Not Map --</option>
                            {fileStats?.headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="col-span-2 text-right">
                          {m.sourceHeader ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              ✓ Mapped
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                              Unmapped
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Regular Attribute Columns Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <Table className="h-4 w-4 text-indigo-600" />
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Standard Schema Attributes
                  </h4>
                </div>

                <div className="space-y-2">
                  {mappings
                    .filter((m) => !m.isKey)
                    .map((m) => (
                      <div
                        key={m.schemaField}
                        className="grid grid-cols-12 gap-3 items-center rounded-2xl border border-slate-200 bg-white p-3 text-xs shadow-2xs hover:border-slate-300 transition"
                      >
                        <div className="col-span-4 space-y-0.5">
                          <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900">
                            <span>{m.schemaField}</span>
                            {m.isPii && (
                              <span className="rounded bg-rose-100 text-rose-800 px-1 py-0.2 text-[8px] font-black uppercase">
                                PII
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500">Type: {m.fieldType}</p>
                        </div>

                        <div className="col-span-1 text-center font-bold text-slate-400">→</div>

                        <div className="col-span-5">
                          <select
                            value={m.sourceHeader ?? ''}
                            onChange={(e) => {
                              const val = e.target.value || null;
                              setMappings((prev) =>
                                prev.map((item) =>
                                  item.schemaField === m.schemaField
                                    ? { ...item, sourceHeader: val, confidence: val ? 100 : 0 }
                                    : item
                                )
                              );
                            }}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono text-slate-800 focus:border-indigo-400 focus:outline-hidden"
                          >
                            <option value="">-- Do Not Map --</option>
                            {fileStats?.headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="col-span-2 text-right">
                          {m.sourceHeader ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              {m.confidence === 100 ? '✓ Exact' : `Fuzzy (${m.confidence}%)`}
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                              Unmapped
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Transform & Type Cast */}
          {step === 4 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Step 4: Data Transformation & Type Casting</h3>
                <p className="text-xs text-slate-500">
                  Configure casting rules, string trimming, phone number normalization, and default fallback values.
                </p>
              </div>

              {/* Transformation Rules Table */}
              <div className="space-y-3">
                {mappings
                  .filter((m) => m.sourceHeader)
                  .map((m) => (
                    <div
                      key={m.schemaField}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-indigo-700">{m.schemaField}</span>
                          <span className="text-xs text-slate-400 font-mono">← {m.sourceHeader}</span>
                        </div>

                        {/* Type Cast Selector */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Cast As:</span>
                          <select
                            value={m.typeCast}
                            onChange={(e) => {
                              const val = e.target.value as IngestMappingField['typeCast'];
                              setMappings((prev) =>
                                prev.map((item) =>
                                  item.schemaField === m.schemaField ? { ...item, typeCast: val } : item
                                )
                              );
                            }}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700"
                          >
                            <option value="string">String (Text)</option>
                            <option value="number">Number (Float)</option>
                            <option value="integer">Integer</option>
                            <option value="boolean">Boolean (True/False)</option>
                            <option value="date_iso">Date (ISO YYYY-MM-DD)</option>
                            <option value="json">JSON Object</option>
                          </select>
                        </div>
                      </div>

                      {/* Rule Checkboxes */}
                      <div className="flex items-center gap-4 flex-wrap text-xs">
                        <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={m.transform.trimWhitespace}
                            onChange={(e) => {
                              const chk = e.target.checked;
                              setMappings((prev) =>
                                prev.map((item) =>
                                  item.schemaField === m.schemaField
                                    ? { ...item, transform: { ...item.transform, trimWhitespace: chk } }
                                    : item
                                )
                              );
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>Trim whitespace</span>
                        </label>

                        <div className="flex items-center gap-1">
                          <span className="text-slate-500 text-[11px]">Case:</span>
                          <select
                            value={m.transform.caseFormat}
                            onChange={(e) => {
                              const cf = e.target.value as IngestMappingField['transform']['caseFormat'];
                              setMappings((prev) =>
                                prev.map((item) =>
                                  item.schemaField === m.schemaField
                                    ? { ...item, transform: { ...item.transform, caseFormat: cf } }
                                    : item
                                )
                              );
                            }}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700"
                          >
                            <option value="none">Preserve case</option>
                            <option value="lowercase">lowercase</option>
                            <option value="uppercase">UPPERCASE</option>
                            <option value="titlecase">Title Case</option>
                          </select>
                        </div>

                        {m.schemaField.includes('phone') && (
                          <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={m.transform.normalizePhone}
                              onChange={(e) => {
                                const chk = e.target.checked;
                                setMappings((prev) =>
                                  prev.map((item) =>
                                    item.schemaField === m.schemaField
                                      ? { ...item, transform: { ...item.transform, normalizePhone: chk } }
                                      : item
                                  )
                                );
                              }}
                              className="rounded text-indigo-600"
                            />
                            <span>Clean phone formatting</span>
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Transformed Output Live Preview Table */}
              {transformedPreviewRows.length > 0 && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-600" />
                    <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                      Live Transformation Output Preview (First 3 Rows):
                    </h4>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                          {mappings
                            .filter((m) => m.sourceHeader)
                            .map((m) => (
                              <th key={m.schemaField} className="px-3 py-2 font-mono text-[11px]">
                                {m.schemaField}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {transformedPreviewRows.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50/60">
                            {mappings
                              .filter((m) => m.sourceHeader)
                              .map((m) => (
                                <td key={m.schemaField} className="px-3 py-2 text-slate-800">
                                  {r[m.schemaField] !== null && r[m.schemaField] !== undefined
                                    ? String(r[m.schemaField])
                                    : 'null'}
                                </td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: Advanced Date & Time Picker + Scheduler */}
          {step === 5 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Step 5: Advanced Ingestion Scheduler</h3>
                <p className="text-xs text-slate-500">
                  Run immediately as a one-time load or establish a recurring automated schedule with advanced date/time controls.
                </p>
              </div>

              {/* Mode Selector */}
              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setScheduleConfig((prev) => ({ ...prev, mode: 'run_once' }))}
                  className={`rounded-2xl border p-4 text-left transition ${
                    scheduleConfig.mode === 'run_once'
                      ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <Zap className="h-5 w-5 text-indigo-600 mb-1.5" />
                  <h4 className="text-xs font-bold text-slate-900">⚡ Ingest Now (One-Time Run)</h4>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Immediately process and import the uploaded records into your database.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setScheduleConfig((prev) => ({ ...prev, mode: 'recurring' }))}
                  className={`rounded-2xl border p-4 text-left transition ${
                    scheduleConfig.mode === 'recurring'
                      ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <Clock className="h-5 w-5 text-purple-600 mb-1.5" />
                  <h4 className="text-xs font-bold text-slate-900">⏰ Recurring Automated Ingest</h4>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Keep this connection running continuously based on an automated schedule.
                  </p>
                </button>
              </div>

              {/* Advanced Date & Time Controls */}
              {scheduleConfig.mode === 'recurring' && (
                <div className="rounded-3xl border border-purple-200 bg-gradient-to-r from-purple-50/60 to-indigo-50/40 p-5 space-y-4 shadow-2xs animate-in fade-in">
                  <div className="flex items-center gap-2 border-b border-purple-200/60 pb-3">
                    <Calendar className="h-4 w-4 text-purple-700" />
                    <h4 className="text-xs font-bold text-purple-950 uppercase tracking-wider">
                      Advanced Date, Time & Recurrence Cadence
                    </h4>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    {/* Start Date Picker */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700">Start Date</label>
                      <input
                        type="date"
                        value={scheduleConfig.startDate}
                        onChange={(e) =>
                          setScheduleConfig((prev) => ({ ...prev, startDate: e.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-800 shadow-2xs focus:border-purple-400 focus:outline-hidden"
                      />
                    </div>

                    {/* Precise Time Picker */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700">Execution Time (HH:MM)</label>
                      <input
                        type="time"
                        value={scheduleConfig.startTime}
                        onChange={(e) =>
                          setScheduleConfig((prev) => ({ ...prev, startTime: e.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-800 shadow-2xs focus:border-purple-400 focus:outline-hidden"
                      />
                    </div>

                    {/* Timezone Selector */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700">Timezone</label>
                      <select
                        value={scheduleConfig.timezone}
                        onChange={(e) =>
                          setScheduleConfig((prev) => ({ ...prev, timezone: e.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs focus:border-purple-400 focus:outline-hidden"
                      >
                        {TIMEZONES.map((tz) => (
                          <option key={tz.value} value={tz.value}>
                            {tz.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Cadence Frequency Pills */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-700">Recurrence Frequency</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {[
                        { id: 'hourly', label: 'Every Hour' },
                        { id: 'daily', label: 'Daily at ' + scheduleConfig.startTime },
                        { id: 'weekly', label: 'Weekly on Specific Days' },
                        { id: 'monthly', label: 'Monthly on Day ' + scheduleConfig.monthlyDay },
                      ].map((cad) => (
                        <button
                          key={cad.id}
                          type="button"
                          onClick={() =>
                            setScheduleConfig((prev) => ({
                              ...prev,
                              cadence: cad.id as IngestionScheduleConfig['cadence'],
                            }))
                          }
                          className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                            scheduleConfig.cadence === cad.id
                              ? 'bg-purple-700 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {cad.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Weekly Day Selector */}
                  {scheduleConfig.cadence === 'weekly' && (
                    <div className="space-y-1.5 animate-in fade-in">
                      <label className="text-[11px] font-bold text-slate-700">Repeat On:</label>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {DAYS_OF_WEEK.map((d) => {
                          const isSelected = scheduleConfig.weeklyDays.includes(d.day);
                          return (
                            <button
                              key={d.day}
                              type="button"
                              onClick={() => {
                                setScheduleConfig((prev) => ({
                                  ...prev,
                                  weeklyDays: isSelected
                                    ? prev.weeklyDays.filter((x) => x !== d.day)
                                    : [...prev.weeklyDays, d.day],
                                }));
                              }}
                              className={`h-8 w-10 rounded-lg text-xs font-bold transition ${
                                isSelected
                                  ? 'bg-purple-700 text-white shadow-xs'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl bg-white/90 p-3 text-xs text-purple-950 font-bold border border-purple-200">
                    📅 Schedule Plan: Ingestion will execute continuously at{' '}
                    <span className="font-mono text-purple-700">{scheduleConfig.startTime} ({scheduleConfig.timezone})</span>{' '}
                    starting on {scheduleConfig.startDate}.
                  </div>
                </div>
              )}

              {/* Ingestion Mode Selector (Upsert / Append / Replace) */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-900">Database Write Mode:</label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      id: 'upsert',
                      title: 'Upsert (Update & Insert)',
                      desc: 'Updates existing records by Key Column and inserts new ones.',
                    },
                    {
                      id: 'append',
                      title: 'Append Only',
                      desc: 'Inserts all rows as new records without checking duplicates.',
                    },
                    {
                      id: 'replace',
                      title: 'Full Replace',
                      desc: 'Clears existing table rows and overwrites with the batch.',
                    },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        setScheduleConfig((prev) => ({
                          ...prev,
                          ingestMode: m.id as IngestionScheduleConfig['ingestMode'],
                        }))
                      }
                      className={`rounded-2xl border p-3.5 text-left transition ${
                        scheduleConfig.ingestMode === m.id
                          ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <p className="text-xs font-bold text-slate-900">{m.title}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500 leading-relaxed">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Review, Save & Ingest Execution */}
          {step === 6 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Step 6: Review & Execute Connection</h3>
                <p className="text-xs text-slate-500">
                  Confirm your mapping and schedule settings. Click Ingest to process the batch.
                </p>
              </div>

              {/* Connection Name Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Connection Job Name:</label>
                <input
                  type="text"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-2xs focus:border-indigo-400 focus:outline-hidden"
                />
              </div>

              {/* Ingestion Execution Summary Card */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Target Schema
                  </span>
                  <p className="font-mono text-xs font-black text-indigo-900">{selectedSchema?.name}</p>
                  <p className="text-[10px] text-slate-500 font-mono">table: {selectedSchema?.table_name}</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Source File
                  </span>
                  <p className="font-mono text-xs font-black text-slate-900 truncate">
                    {uploadedFile?.name || 'Local File'}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {fileStats?.rowCount.toLocaleString()} rows · {fileStats?.fileSizeFormatted}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Execution Mode
                  </span>
                  <p className="text-xs font-bold text-emerald-800 capitalize">
                    {scheduleConfig.mode === 'recurring' ? '⏰ Scheduled' : '⚡ Run Now'}
                  </p>
                  <p className="text-[10px] text-slate-500 capitalize">{scheduleConfig.ingestMode} mode</p>
                </div>
              </div>

              {/* Progress Bar (While Ingesting) */}
              {isExecuting && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-950">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-indigo-600" />
                      <span>Ingesting batch records into database…</span>
                    </div>
                    <span className="font-mono">{executionProgress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-indigo-200">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${executionProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Execution Result Banner */}
              {executionResult && (
                <div
                  className={`rounded-2xl border p-5 space-y-3 ${
                    executionResult.success
                      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
                      : 'border-rose-200 bg-rose-50/70 text-rose-950'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {executionResult.success ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-rose-600" />
                    )}
                    <h4 className="text-sm font-bold">
                      {executionResult.success
                        ? 'Ingestion Completed Successfully! ✨'
                        : 'Ingestion Encountered Errors'}
                    </h4>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-white/80 p-2.5 shadow-2xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Processed</span>
                      <p className="font-mono font-bold text-slate-800 text-sm">
                        {executionResult.totalProcessed.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/80 p-2.5 shadow-2xs">
                      <span className="text-[10px] font-bold text-emerald-600 uppercase">Imported</span>
                      <p className="font-mono font-bold text-emerald-800 text-sm">
                        {executionResult.insertedCount.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/80 p-2.5 shadow-2xs">
                      <span className="text-[10px] font-bold text-rose-600 uppercase">Errors</span>
                      <p className="font-mono font-bold text-rose-800 text-sm">
                        {executionResult.errorCount.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {executionResult.errorMessages.length > 0 && (
                    <div className="rounded-xl bg-rose-100/80 p-3 text-[11px] font-mono text-rose-900 space-y-1">
                      <p className="font-bold">Error Logs:</p>
                      {executionResult.errorMessages.map((msg, i) => (
                        <p key={i}>• {msg}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-6 py-4">
          <div>
            {step > 1 && !isExecuting && (
              <Button
                variant="secondary"
                onClick={() => setStep((prev) => (prev - 1) as WizardStep)}
                className="font-bold text-xs"
              >
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Previous Step
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} className="font-bold text-xs">
              {executionResult?.success ? 'Close' : 'Cancel'}
            </Button>

            {step < 6 ? (
              <Button
                onClick={() => setStep((prev) => (prev + 1) as WizardStep)}
                disabled={step === 2 && !fileStats}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs"
              >
                Next Step
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                onClick={handleRunIngestion}
                disabled={isExecuting || executionResult?.success}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
              >
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {isExecuting
                  ? 'Ingesting…'
                  : executionResult?.success
                  ? 'Ingested'
                  : 'Save Connection & Ingest'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
