import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Link2,
  PlugZap,
  Plus,
  Trash2,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { connectorMeta } from '@/lib/connector-meta';
import {
  deleteConnectorLink,
  fetchConnectorLinks,
  testConnectorLink,
  type ConnectorLink,
} from '@/lib/connector-test';
import { TestResultCard } from '@/components/connectors/ConnectorTestPanel';
import type { ConnectorMappingRow } from '@/lib/connector-mapping';
import { useState } from 'react';

type ConnectorRow = {
  id: string;
  name: string;
  connector_type: string;
  direction: string;
  config: Record<string, unknown>;
  mapping: ConnectorMappingRow[];
};

type Props = {
  tenantId: string;
  environment: string;
  connectors: ConnectorRow[];
  onCreateLink: () => void;
};

export function ConnectorLinksPanel({ tenantId, environment, connectors, onCreateLink }: Props) {
  const queryClient = useQueryClient();
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ linkId: string; result: Awaited<ReturnType<typeof testConnectorLink>> } | null>(null);

  const { data: links, isLoading } = useQuery({
    queryKey: ['connector-links', tenantId, environment],
    queryFn: () => fetchConnectorLinks(tenantId, environment),
  });

  const removeMutation = useMutation({
    mutationFn: deleteConnectorLink,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connector-links'] }),
  });

  const testLink = async (link: ConnectorLink) => {
    const source = connectors.find((c) => c.id === link.source_connector_id);
    const target = connectors.find((c) => c.id === link.target_connector_id);
    if (!source || !target) return;

    setTestingId(link.id);
    const result = await testConnectorLink({
      tenantId,
      environment,
      linkId: link.id,
      sourceConnector: source,
      targetConnector: target,
      bridgeSchema: link.bridge_schema,
    });
    setTestResult({ linkId: link.id, result });
    setTestingId(null);
    queryClient.invalidateQueries({ queryKey: ['connector-links'] });
  };

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">System connections</h2>
          <p className="text-sm text-slate-500">Link inbound and outbound connectors through a Marbee schema</p>
        </div>
        <Button onClick={onCreateLink} className="bg-teal-600 hover:bg-teal-500">
          <Plus className="mr-1.5 h-4 w-4" />
          Connect two systems
        </Button>
      </div>

      {!links?.length ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-teal-50/30 py-16 text-center">
          <Link2 className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-semibold text-slate-800">No connections yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Connect a source system (CRM, SFTP, API) to a destination (webhook, API push) via a Marbee schema bridge.
          </p>
          <Button className="mt-6 bg-teal-600 hover:bg-teal-500" onClick={onCreateLink}>
            <Plus className="mr-1.5 h-4 w-4" />
            Set up first connection
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {links.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              connectors={connectors}
              onTest={() => testLink(link)}
              onDelete={() => removeMutation.mutate(link.id)}
              testing={testingId === link.id}
            />
          ))}
        </div>
      )}

      {testResult && (
        <div className="mt-6">
          <TestResultCard result={testResult.result} />
        </div>
      )}
    </div>
  );
}

function LinkCard({
  link,
  connectors,
  onTest,
  onDelete,
  testing,
}: {
  link: ConnectorLink;
  connectors: ConnectorRow[];
  onTest: () => void;
  onDelete: () => void;
  testing: boolean;
}) {
  const source = connectors.find((c) => c.id === link.source_connector_id);
  const target = connectors.find((c) => c.id === link.target_connector_id);
  const sourceMeta = source ? connectorMeta(source.connector_type) : null;
  const targetMeta = target ? connectorMeta(target.connector_type) : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div>
          <h3 className="font-semibold text-slate-900">{link.name}</h3>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="default">{link.sync_mode}</Badge>
            <Badge variant={link.status === 'active' ? 'success' : 'default'}>{link.status}</Badge>
            {link.last_test_status && (
              <Badge variant={link.last_test_status === 'success' ? 'success' : 'error'}>
                Test: {link.last_test_status}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onTest} disabled={testing}>
            <PlugZap className="mr-1 h-3.5 w-3.5" />
            {testing ? 'Testing…' : 'Test link'}
          </Button>
          <button type="button" onClick={onDelete} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-slate-950 px-5 py-4">
        <SystemPill name={source?.name ?? '?'} meta={sourceMeta} href={source ? `/data/connectors/${source.id}` : undefined} />
        <ArrowRight className="h-4 w-4 text-slate-600" />
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-center">
          <p className="text-xs font-bold text-blue-300">{link.bridge_schema}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-600" />
        <SystemPill name={target?.name ?? '?'} meta={targetMeta} href={target ? `/data/connectors/${target.id}` : undefined} />
      </div>

      {link.last_test_at && (
        <p className="px-5 py-2 text-xs text-slate-400">
          Last tested {new Date(link.last_test_at).toLocaleString()}
          {link.last_test_message && ` · ${link.last_test_message}`}
        </p>
      )}
    </div>
  );
}

function SystemPill({
  name,
  meta,
  href,
}: {
  name: string;
  meta: ReturnType<typeof connectorMeta> | null | undefined;
  href?: string;
}) {
  const Icon = meta?.icon;
  const inner = (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-1.5"
      style={{ backgroundColor: `${meta?.accent ?? '#64748b'}18` }}
    >
      {Icon && (
        <span style={{ color: meta?.accent }}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="text-xs font-semibold text-white">{name}</span>
    </div>
  );
  return href ? <Link to={href}>{inner}</Link> : inner;
}
