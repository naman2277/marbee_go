import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Variable,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { useTenantScope } from '@/contexts/AuthContext';
import {
  VARIABLE_SCOPES,
  createGlobalVariable,
  deleteGlobalVariable,
  fetchGlobalVariables,
  normalizeVariableName,
  revealVariable,
  rotateEncryptionKey,
  variableReference,
  type GlobalVariable,
  type GlobalVariableKind,
  type GlobalVariableScope,
} from '@/lib/global-variables';
import { maskSecret } from '@/lib/crypto-vault';

const KIND_META: Record<GlobalVariableKind, { label: string; hint: string; badge: string }> = {
  encryption_key: {
    label: 'AES-256 encryption key',
    hint: 'Generated key material used to encrypt form fields and other data at rest.',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  secret: {
    label: 'Secret',
    hint: 'Sensitive text such as a third-party token. Stored encrypted, never shown in plain listings.',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  plain: {
    label: 'Plain value',
    hint: 'Non-sensitive configuration such as a base URL or region code.',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition"
      title={label}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

function VariableRow({
  variable,
  onDeleted,
  onRotated,
}: {
  variable: GlobalVariable;
  onDeleted: () => void;
  onRotated: () => void;
}) {
  const { tenantId, environment } = useTenantScope();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const meta = KIND_META[variable.kind];

  const reveal = async () => {
    if (revealed) {
      setRevealed(null);
      return;
    }
    setBusy(true);
    try {
      setRevealed(await revealVariable(tenantId, variable));
    } catch (e) {
      // e.g. "Encryption keys are never revealed…" or a permission message from the server.
      setRevealed(`[${e instanceof Error ? e.message : 'could not reveal'}]`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">
              {variable.name}
            </code>
            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.badge}`}>
              {variable.kind === 'encryption_key' ? 'AES-256' : variable.kind}
            </span>
            {variable.scopes.map((s) => (
              <span key={s} className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                {VARIABLE_SCOPES.find((x) => x.value === s)?.label ?? s}
              </span>
            ))}
          </div>

          {variable.description && (
            <p className="mt-1.5 text-xs text-slate-500">{variable.description}</p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400">Reference</span>
            <code className="rounded bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-brand-700">
              {variableReference(variable.name)}
            </code>
            <CopyButton value={variableReference(variable.name)} label="Copy reference" />
          </div>

          {variable.fingerprint && (
            <p className="mt-1.5 font-mono text-[11px] text-slate-400">
              Fingerprint {variable.fingerprint}
            </p>
          )}

          {variable.needs_reentry && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800" role="alert">
              {variable.kind === 'encryption_key'
                ? 'This key was saved in the old format and can no longer be used. Rotate it to create a new key.'
                : 'This value was saved in the old format and can no longer be used. Edit the variable and enter the value again.'}
            </p>
          )}

          {revealed !== null && (
            <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
              <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-slate-800">
                {revealed}
              </code>
              <CopyButton value={revealed} label="Copy value" />
            </div>
          )}

          {revealed === null && variable.kind !== 'plain' && (
            <p className="mt-1.5 font-mono text-[11px] text-slate-400">{maskSecret(variable.value, 6)}</p>
          )}
          {revealed === null && variable.kind === 'plain' && (
            <p className="mt-1.5 font-mono text-[11px] text-slate-600">{variable.value}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={reveal}
            disabled={busy}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            title={revealed ? 'Hide value' : 'Reveal value'}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : revealed ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>

          {variable.kind === 'encryption_key' && (
            <button
              type="button"
              onClick={async () => {
                if (
                  !confirm(
                    `Rotate ${variable.name}?\n\nData already encrypted with the current key can no longer be decrypted with the new one. Decrypt and re-encrypt it first.`,
                  )
                )
                  return;
                setBusy(true);
                await rotateEncryptionKey(tenantId, environment, variable.id);
                setBusy(false);
                setRevealed(null);
                onRotated();
              }}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-violet-50 hover:text-violet-700 transition"
              title="Rotate key"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={async () => {
              if (!confirm(`Delete ${variable.name}? Anything referencing it will stop resolving.`)) return;
              await deleteGlobalVariable(tenantId, environment, variable.id);
              onDeleted();
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
            title="Delete variable"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateVariableForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { tenantId, environment } = useTenantScope();
  const [kind, setKind] = useState<GlobalVariableKind>('encryption_key');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [scopes, setScopes] = useState<GlobalVariableScope[]>(['all']);
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: async () => {
      const result = await createGlobalVariable({
        tenantId,
        environment,
        name,
        description,
        kind,
        value: kind === 'encryption_key' ? undefined : value,
        scopes,
      });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: onDone,
    onError: (e: Error) => setError(e.message),
  });

  const toggleScope = (s: GlobalVariableScope) => {
    if (s === 'all') return setScopes(['all']);
    const next = scopes.filter((x) => x !== 'all');
    setScopes(next.includes(s) ? next.filter((x) => x !== s) : [...next, s]);
  };

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-900">New global variable</h4>
        <button type="button" onClick={onCancel} className="rounded-lg p-1 text-slate-400 hover:bg-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Type</label>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(KIND_META) as GlobalVariableKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-lg border p-2.5 text-left transition ${
                  kind === k ? 'border-brand-500 bg-white shadow-xs' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="block text-xs font-bold text-slate-900">{KIND_META[k].label}</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{KIND_META[k].hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Variable name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setName(normalizeVariableName(name))}
              placeholder="FORM_PII_KEY"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
            />
            {name && (
              <p className="mt-1 font-mono text-[11px] text-slate-400">
                {variableReference(normalizeVariableName(name))}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Description
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this variable is for"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
            />
          </div>
        </div>

        {kind === 'encryption_key' ? (
          <p className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] text-violet-800">
            <KeyRound className="h-3.5 w-3.5 shrink-0" />
            A cryptographically random AES-256 key is generated for you and sealed before it is stored.
          </p>
        ) : (
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Value</label>
            <input
              type={kind === 'secret' ? 'password' : 'text'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === 'secret' ? 'Paste the secret…' : 'https://api.example.com'}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
            />
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Where it can be used
          </label>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLE_SCOPES.map(({ value: s, label }) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleScope(s)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                  scopes.includes(s)
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
            {create.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
            Create variable
          </Button>
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

export function GlobalVariablesPanel() {
  const { tenantId, environment } = useTenantScope();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<'all' | GlobalVariableKind>('all');

  const { data: variables = [], isLoading } = useQuery({
    queryKey: ['global-variables', tenantId, environment],
    queryFn: () => fetchGlobalVariables(tenantId, environment),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['global-variables', tenantId, environment] });

  const shown = filter === 'all' ? variables : variables.filter((v) => v.kind === filter);
  const keyCount = variables.filter((v) => v.kind === 'encryption_key').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Variable className="h-4 w-4 text-brand-600" />
            Encryption keys &amp; global variables
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Define a value once and reference it as{' '}
            <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">{'{{vars.NAME}}'}</code> from forms,
            workflows, landing pages, imports and exports. Rotating here updates every consumer.
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New variable
          </Button>
        )}
      </div>

      {creating && (
        <CreateVariableForm
          onDone={() => {
            setCreating(false);
            refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
        {([
          ['all', `All (${variables.length})`],
          ['encryption_key', `AES-256 keys (${keyCount})`],
          ['secret', 'Secrets'],
          ['plain', 'Plain values'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              filter === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 p-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading variables…
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <KeyRound className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-600">No variables yet</p>
          <p className="mt-1 text-xs text-slate-400">
            Create an AES-256 key to start encrypting form submissions at rest.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((v) => (
            <VariableRow key={v.id} variable={v} onDeleted={refresh} onRotated={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
