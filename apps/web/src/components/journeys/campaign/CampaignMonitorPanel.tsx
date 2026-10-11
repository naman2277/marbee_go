import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  ACTIVITY_STATUS_RING,
  activityStatusLabel,
  type ActivityExecutionStatus,
} from '@/lib/campaign-acc-stages';
import type { WorkflowLogEntry, WorkflowLogLevel } from '@/lib/campaign-workflow-log';
import type { CampaignActivityRow } from './CampaignEditorBridge';
import { WorkflowErrorHelpIcon } from '@/components/journeys/WorkflowErrorHelpIcon';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';

type Props = {
  logs: WorkflowLogEntry[];
  activityRows?: CampaignActivityRow[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

type MonitorTab = 'activities' | 'journal';

function LevelIcon({ level }: { level: WorkflowLogLevel }) {
  switch (level) {
    case 'success':
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />;
    case 'warning':
      return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />;
    case 'error':
      return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />;
    default:
      return <Info className="h-3.5 w-3.5 shrink-0 text-blue-500" />;
  }
}

function logRowClass(level: WorkflowLogLevel): string {
  switch (level) {
    case 'error':
      return 'bg-red-50/80 hover:bg-red-50';
    case 'warning':
      return 'bg-amber-50/60 hover:bg-amber-50';
    default:
      return 'hover:bg-slate-50';
  }
}

function logMessageClass(level: WorkflowLogLevel): string {
  switch (level) {
    case 'error':
      return 'font-medium text-red-700';
    case 'warning':
      return 'font-medium text-amber-800';
    default:
      return 'text-slate-700';
  }
}

function logDetailClass(level: WorkflowLogLevel): string {
  switch (level) {
    case 'error':
      return 'text-red-500';
    case 'warning':
      return 'text-amber-600';
    default:
      return 'text-slate-400';
  }
}

function StatusCell({ status, activityLabel, logs }: { status: ActivityExecutionStatus; activityLabel: string; logs: WorkflowLogEntry[] }) {
  const lastError = [...logs]
    .reverse()
    .find((l) => l.level === 'error' && l.activity === activityLabel);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${ACTIVITY_STATUS_RING[status]}`} />
      <span className="text-slate-600">{activityStatusLabel(status)}</span>
      {status === 'error' && lastError && (
        <WorkflowErrorHelpIcon
          message={lastError.message}
          detail={lastError.detail}
          activity={lastError.activity}
          level="error"
        />
      )}
    </span>
  );
}

export function CampaignMonitorPanel({ logs, activityRows = [], collapsed, onToggleCollapse }: Props) {
  const [tab, setTab] = useState<MonitorTab>('journal');
  const expanded = collapsed === undefined ? true : !collapsed;

  return (
    <div
      className={`flex shrink-0 flex-col border-t border-slate-200 bg-white ${
        expanded ? 'h-[180px]' : 'h-10'
      }`}
    >
      <div className="flex items-center border-b border-slate-100 px-3 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          Logs
          {onToggleCollapse &&
            (expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />)}
        </button>

        {expanded && (
          <div className="ml-4 flex gap-1">
            {([
              ['journal', `Events (${logs.length})`],
              ['activities', `Activities (${activityRows.length})`],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  tab === id
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {expanded && tab === 'activities' && (
        <div className="flex-1 overflow-auto">
          {activityRows.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">
              Run the workflow to see activity status and record counts.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Activity</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Records</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activityRows.map((row) => (
                  <tr
                    key={row.nodeId}
                    className={
                      row.status === 'error'
                        ? 'bg-red-50/80 hover:bg-red-50'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className={`px-4 py-1.5 font-medium ${row.status === 'error' ? 'text-red-800' : 'text-slate-800'}`}>
                      {row.label}
                    </td>
                    <td className="px-4 py-1.5 font-mono text-xs text-slate-500">{row.stepType}</td>
                    <td className="px-4 py-1.5">
                      <StatusCell status={row.status} activityLabel={row.label} logs={logs} />
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono tabular-nums text-slate-700">
                      {row.status === 'running' ? (
                        <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-blue-500" />
                      ) : row.count != null ? (
                        row.count.toLocaleString()
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {expanded && tab === 'journal' && (
        <div className="flex-1 overflow-y-auto text-sm">
          {logs.length === 0 ? (
            <p className="px-4 py-4 text-slate-500">Workflow events will appear here as activities run.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...logs].reverse().map((entry) => (
                <li
                  key={entry.id}
                  className={`flex items-start gap-2 px-4 py-1.5 ${logRowClass(entry.level)}`}
                >
                  <span className="shrink-0 tabular-nums text-xs text-slate-400 pt-0.5">
                    {new Date(entry.at).toLocaleTimeString()}
                  </span>
                  <span className="shrink-0 pt-0.5">
                    <LevelIcon level={entry.level} />
                  </span>
                  {entry.activity && (
                    <span
                      className={`shrink-0 text-xs pt-0.5 ${
                        entry.level === 'error' ? 'text-red-600' : 'text-blue-600'
                      }`}
                    >
                      [{entry.activity}]
                    </span>
                  )}
                  <span className={`min-w-0 flex-1 ${logMessageClass(entry.level)}`}>
                    {entry.message}
                    {entry.detail && (
                      <span className={`ml-1 ${logDetailClass(entry.level)}`}>— {entry.detail}</span>
                    )}
                  </span>
                  {(entry.level === 'error' || entry.level === 'warning') && (
                    <WorkflowErrorHelpIcon
                      message={entry.message}
                      detail={entry.detail}
                      activity={entry.activity}
                      level={entry.level}
                      variant={entry.level === 'warning' ? 'warning' : 'error'}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
