import type { Environment } from '@/lib/environment';
import { ENV_FULL_LABEL, ENV_SHORT_LABEL } from '@/lib/environment';
import {
  type InstanceAccessMap,
  type InstancePermissionFlags,
  updateInstanceAccess,
} from '@/lib/member-settings';
import { cn } from '@/lib/utils';

type InstanceAccessPanelProps = {
  value: InstanceAccessMap;
  onChange: (next: InstanceAccessMap) => void;
  disabled?: boolean;
};

const ENVIRONMENTS: Environment[] = ['development', 'staging', 'production'];

const PERMISSION_COLUMNS: Array<{ key: keyof InstancePermissionFlags; label: string }> = [
  { key: 'enabled', label: 'Access' },
  { key: 'read', label: 'Read' },
  { key: 'write', label: 'Write' },
  { key: 'delete', label: 'Delete' },
];

export function InstanceAccessPanel({ value, onChange, disabled }: InstanceAccessPanelProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3 font-semibold">Instance</th>
            {PERMISSION_COLUMNS.map((col) => (
              <th key={col.key} className="px-4 py-3 text-center font-semibold">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ENVIRONMENTS.map((env) => {
            const flags = value[env];
            return (
              <tr key={env} className="hover:bg-slate-50/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                      {ENV_SHORT_LABEL[env]}
                    </span>
                    <span className="text-slate-700">{ENV_FULL_LABEL[env]}</span>
                  </div>
                </td>
                {PERMISSION_COLUMNS.map((col) => {
                  const checked = flags[col.key];
                  const isDisabled =
                    disabled
                    || (col.key !== 'enabled' && !flags.enabled)
                    || (col.key === 'write' && !flags.read)
                    || (col.key === 'delete' && !flags.write);

                  return (
                    <td key={col.key} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isDisabled}
                        onChange={(e) =>
                          onChange(updateInstanceAccess(value, env, col.key, e.target.checked))
                        }
                        className={cn(
                          'h-4 w-4 rounded border-slate-300',
                          col.key === 'enabled' && 'accent-brand-600',
                        )}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
