/**
 * Per-condition editors. One component per IR condition kind; the tree picks
 * the right one and hands it a patch callback. Each editor reads a sentence
 * left-to-right, so the rule row says what it means without a legend.
 */
import { Plus, X } from 'lucide-react';
import {
  RETENTION_PATTERN_LABELS,
  createEventPropertyFilter,
  createSequenceStep,
  type AccountRollupCondition,
  type CohortCondition,
  type CohortMembershipCondition,
  type EventAggregation,
  type EventCondition,
  type EventPropertyFilter,
  type MetricCondition,
  type PropertyCondition,
  type PropertyOperator,
  type RelativeEventCondition,
  type RetentionCondition,
  type RetentionPattern,
  type SequenceCondition,
  type TimeUnit,
} from '@/lib/cohorts/ir';
import {
  eventPropertiesFor,
  findEvent,
  findProperty,
  type SemanticCatalog,
} from '@/lib/cohorts/catalog';
import {
  CountOperatorSelect,
  EventPicker,
  MetricPicker,
  NumberInput,
  OperatorSelect,
  PropertyPicker,
  TimeWindowPicker,
  ValueInput,
  inputClass,
  operatorsForFieldType,
  selectClass,
} from './CohortPickers';

export type PatchFn = (patch: Record<string, unknown>) => void;

const rowClass = 'flex flex-wrap items-center gap-1.5';
const wordClass = 'text-[13px] text-slate-500';

/* ------------------------------------------------------------------ *
 * Attribute
 * ------------------------------------------------------------------ */

function PropertyEditor({
  cond,
  catalog,
  patch,
}: {
  cond: PropertyCondition;
  catalog: SemanticCatalog;
  patch: PatchFn;
}) {
  const property = findProperty(catalog, cond.property);
  const isDate = property?.type === 'date' || property?.type === 'timestamp';
  const operators = operatorsForFieldType(property?.type ?? 'string');

  return (
    <div className={rowClass}>
      <PropertyPicker
        catalog={catalog}
        value={cond.property}
        onChange={(key) => {
          const next = findProperty(catalog, key);
          const allowed = operatorsForFieldType(next?.type ?? 'string');
          patch({
            property: key,
            operator: allowed.includes(cond.operator) ? cond.operator : allowed[0],
            value: '',
            values: undefined,
            window: undefined,
          });
        }}
      />

      {isDate ? (
        <>
          <select
            value={cond.window ? 'window' : 'compare'}
            onChange={(e) =>
              patch(
                e.target.value === 'window'
                  ? { window: { kind: 'last', value: 30, unit: 'day' }, value: '' }
                  : { window: undefined },
              )
            }
            className={selectClass}
          >
            <option value="window">falls</option>
            <option value="compare">compared to a date</option>
          </select>
          {cond.window ? (
            <TimeWindowPicker value={cond.window} onChange={(w) => patch({ window: w })} />
          ) : (
            <>
              <OperatorSelect
                value={cond.operator}
                onChange={(op) => patch({ operator: op })}
                options={operators}
              />
              <ValueInput
                property={property}
                operator={cond.operator}
                value={cond.value}
                value2={cond.value2}
                values={cond.values}
                onChange={patch}
              />
            </>
          )}
        </>
      ) : (
        <>
          <OperatorSelect
            value={cond.operator}
            onChange={(op) => patch({ operator: op })}
            options={operators}
          />
          <ValueInput
            property={property}
            operator={cond.operator}
            value={cond.value}
            value2={cond.value2}
            values={cond.values}
            onChange={patch}
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Event property filters (shared by event / sequence / cross-event)
 * ------------------------------------------------------------------ */

function EventFilterRows({
  eventName,
  filters,
  catalog,
  onChange,
}: {
  eventName: string;
  filters: EventPropertyFilter[];
  catalog: SemanticCatalog;
  onChange: (next: EventPropertyFilter[]) => void;
}) {
  const available = eventPropertiesFor(catalog, eventName);

  const update = (id: string, p: Partial<EventPropertyFilter>) =>
    onChange(filters.map((f) => (f.id === id ? { ...f, ...p } : f)));

  return (
    <div className="mt-1.5 space-y-1.5 border-l-2 border-violet-100 pl-3">
      {filters.map((f) => {
        const prop = available.find((p) => p.key === f.property);
        return (
          <div key={f.id} className={rowClass}>
            <span className={wordClass}>where</span>
            <select
              value={f.property}
              onChange={(e) => update(f.id, { property: e.target.value, value: '' })}
              className={selectClass}
            >
              <option value="">Select property…</option>
              {available.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
              {f.property && !available.some((p) => p.key === f.property) && (
                <option value={f.property}>{f.property} (not seen)</option>
              )}
            </select>
            <OperatorSelect
              value={f.operator}
              onChange={(op) => update(f.id, { operator: op })}
              options={operatorsForFieldType(prop?.type ?? 'string')}
            />
            <ValueInput
              property={prop}
              operator={f.operator}
              value={f.value}
              value2={f.value2}
              values={f.values}
              onChange={(p) => update(f.id, p as Partial<EventPropertyFilter>)}
            />
            <button
              type="button"
              onClick={() => onChange(filters.filter((x) => x.id !== f.id))}
              className="rounded p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"
              title="Remove filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      {Boolean(available.length || filters.length) && (
        <button
          type="button"
          onClick={() => onChange([...filters, createEventPropertyFilter(available[0]?.key ?? '')])}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-violet-600 transition hover:text-violet-800"
        >
          <Plus className="h-3 w-3" /> Filter on event property
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Behaviour
 * ------------------------------------------------------------------ */

const AGGREGATIONS: { value: EventAggregation['kind']; label: string }[] = [
  { value: 'count', label: 'number of times' },
  { value: 'distinct_days', label: 'distinct days' },
  { value: 'sum', label: 'sum of' },
  { value: 'avg', label: 'average of' },
  { value: 'min', label: 'minimum of' },
  { value: 'max', label: 'maximum of' },
];

function EventEditor({
  cond,
  catalog,
  patch,
}: {
  cond: EventCondition;
  catalog: SemanticCatalog;
  patch: PatchFn;
}) {
  const numericProps = eventPropertiesFor(catalog, cond.event).filter(
    (p) => p.type === 'number' || p.type === 'string',
  );
  const needsProperty = ['sum', 'avg', 'min', 'max'].includes(cond.aggregation.kind);

  return (
    <div className="space-y-1.5">
      <div className={rowClass}>
        <select
          value={cond.performed}
          onChange={(e) => patch({ performed: e.target.value })}
          className={selectClass}
        >
          <option value="did">Performed</option>
          <option value="did_not">Never performed</option>
        </select>

        <EventPicker
          catalog={catalog}
          value={cond.event}
          onChange={(name) => patch({ event: name, filters: [] })}
        />

        {cond.performed === 'did' && (
          <>
            <select
              value={cond.aggregation.kind}
              onChange={(e) => {
                const kind = e.target.value as EventAggregation['kind'];
                patch({
                  aggregation:
                    kind === 'count' || kind === 'distinct_days'
                      ? { kind }
                      : { kind, property: numericProps[0]?.key ?? '' },
                });
              }}
              className={selectClass}
            >
              {AGGREGATIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>

            {needsProperty && (
              <select
                value={'property' in cond.aggregation ? cond.aggregation.property : ''}
                onChange={(e) =>
                  patch({ aggregation: { ...cond.aggregation, property: e.target.value } })
                }
                className={selectClass}
              >
                <option value="">Select property…</option>
                {numericProps.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}

            <span className={wordClass}>is</span>
            <CountOperatorSelect value={cond.operator} onChange={(op) => patch({ operator: op })} />
            <NumberInput value={cond.value} onChange={(n) => patch({ value: n })} />
            {cond.operator === 'count_between' && (
              <>
                <span className={wordClass}>and</span>
                <NumberInput value={cond.value2 ?? 0} onChange={(n) => patch({ value2: n })} />
              </>
            )}
          </>
        )}

        <TimeWindowPicker value={cond.window} onChange={(w) => patch({ window: w })} />

        {cond.performed === 'did' && (
          <select
            value={cond.occurrence ?? 'any'}
            onChange={(e) => patch({ occurrence: e.target.value })}
            className={selectClass}
            title="Which occurrence to measure"
          >
            <option value="any">any occurrence</option>
            <option value="first">first occurrence</option>
            <option value="last">most recent</option>
          </select>
        )}
      </div>

      {cond.event && (
        <EventFilterRows
          eventName={cond.event}
          filters={cond.filters}
          catalog={catalog}
          onChange={(filters) => patch({ filters })}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Metric
 * ------------------------------------------------------------------ */

const METRIC_OPS: PropertyOperator[] = ['gte', 'gt', 'lte', 'lt', 'equals', 'not_equals', 'between'];

function MetricEditor({
  cond,
  catalog,
  patch,
}: {
  cond: MetricCondition;
  catalog: SemanticCatalog;
  patch: PatchFn;
}) {
  return (
    <div className={rowClass}>
      <MetricPicker catalog={catalog} value={cond.metric} onChange={(key) => patch({ metric: key })} />
      <span className={wordClass}>is</span>
      <OperatorSelect value={cond.operator} onChange={(op) => patch({ operator: op })} options={METRIC_OPS} />
      <NumberInput value={cond.value} onChange={(n) => patch({ value: n })} width="w-24" />
      {cond.operator === 'between' && (
        <>
          <span className={wordClass}>and</span>
          <NumberInput value={cond.value2 ?? 0} onChange={(n) => patch({ value2: n })} width="w-24" />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cohort membership
 * ------------------------------------------------------------------ */

function CohortMembershipEditor({
  cond,
  catalog,
  patch,
}: {
  cond: CohortMembershipCondition;
  catalog: SemanticCatalog;
  patch: PatchFn;
}) {
  return (
    <div className={rowClass}>
      <select
        value={cond.member ? 'in' : 'out'}
        onChange={(e) => patch({ member: e.target.value === 'in' })}
        className={selectClass}
      >
        <option value="in">Is in cohort</option>
        <option value="out">Is not in cohort</option>
      </select>
      <select
        value={cond.cohortSlug}
        onChange={(e) => {
          const ref = catalog.cohorts.find((c) => c.slug === e.target.value);
          patch({ cohortSlug: e.target.value, cohortName: ref?.name });
        }}
        className={selectClass}
      >
        <option value="">Select cohort…</option>
        {catalog.cohorts.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name} ({c.memberCount.toLocaleString()})
          </option>
        ))}
      </select>
      {!catalog.cohorts.length && (
        <span className="text-[12px] text-slate-400">No other cohorts saved yet.</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Sequence
 * ------------------------------------------------------------------ */

const UNITS: TimeUnit[] = ['minute', 'hour', 'day', 'week', 'month'];

function SequenceEditor({
  cond,
  catalog,
  patch,
}: {
  cond: SequenceCondition;
  catalog: SemanticCatalog;
  patch: PatchFn;
}) {
  const updateStep = (id: string, p: Partial<(typeof cond.steps)[number]>) =>
    patch({ steps: cond.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) });

  return (
    <div className="space-y-2">
      <div className={rowClass}>
        <select
          value={cond.outcome}
          onChange={(e) => patch({ outcome: e.target.value })}
          className={selectClass}
        >
          <option value="completed">Completed the sequence</option>
          <option value="dropped_off">Started but dropped off</option>
        </select>
        <select
          value={cond.ordered ? 'ordered' : 'unordered'}
          onChange={(e) => patch({ ordered: e.target.value === 'ordered' })}
          className={selectClass}
        >
          <option value="ordered">in order</option>
          <option value="unordered">in any order</option>
        </select>
        <TimeWindowPicker value={cond.window} onChange={(w) => patch({ window: w })} />
      </div>

      <div className="space-y-1.5 border-l-2 border-amber-100 pl-3">
        {cond.steps.map((step, i) => (
          <div key={step.id} className="space-y-1">
            <div className={rowClass}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
                {i + 1}
              </span>
              <EventPicker
                catalog={catalog}
                value={step.event}
                onChange={(name) => updateStep(step.id, { event: name, filters: [] })}
              />
              {i > 0 && cond.ordered && (
                <>
                  <span className={wordClass}>within</span>
                  <NumberInput
                    value={step.maxGap?.value ?? 0}
                    onChange={(n) =>
                      updateStep(step.id, {
                        maxGap: n > 0 ? { value: n, unit: step.maxGap?.unit ?? 'day' } : undefined,
                      })
                    }
                  />
                  <select
                    value={step.maxGap?.unit ?? 'day'}
                    onChange={(e) =>
                      updateStep(step.id, {
                        maxGap: { value: step.maxGap?.value ?? 7, unit: e.target.value as TimeUnit },
                      })
                    }
                    className={selectClass}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}s
                      </option>
                    ))}
                  </select>
                  <span className={wordClass}>of the previous step</span>
                </>
              )}
              {cond.steps.length > 2 && (
                <button
                  type="button"
                  onClick={() => patch({ steps: cond.steps.filter((s) => s.id !== step.id) })}
                  className="rounded p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"
                  title="Remove step"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {step.event && (
              <EventFilterRows
                eventName={step.event}
                filters={step.filters}
                catalog={catalog}
                onChange={(filters) => updateStep(step.id, { filters })}
              />
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => patch({ steps: [...cond.steps, createSequenceStep()] })}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-amber-600 transition hover:text-amber-800"
        >
          <Plus className="h-3 w-3" /> Add step
        </button>
      </div>

      <div className={rowClass}>
        <span className={wordClass}>Conversion window</span>
        <NumberInput
          value={cond.conversionWindow?.value ?? 0}
          onChange={(n) =>
            patch({
              conversionWindow:
                n > 0 ? { value: n, unit: cond.conversionWindow?.unit ?? 'day' } : undefined,
            })
          }
        />
        <select
          value={cond.conversionWindow?.unit ?? 'day'}
          onChange={(e) =>
            patch({
              conversionWindow: {
                value: cond.conversionWindow?.value ?? 7,
                unit: e.target.value as TimeUnit,
              },
            })
          }
          className={selectClass}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}s
            </option>
          ))}
        </select>
        {cond.outcome === 'dropped_off' && (
          <>
            <span className={wordClass}>· dropped before step</span>
            <select
              value={cond.dropAtStep ?? 0}
              onChange={(e) => patch({ dropAtStep: Number(e.target.value) })}
              className={selectClass}
            >
              <option value={0}>any</option>
              {cond.steps.map((_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Retention
 * ------------------------------------------------------------------ */

function RetentionEditor({
  cond,
  catalog,
  patch,
}: {
  cond: RetentionCondition;
  catalog: SemanticCatalog;
  patch: PatchFn;
}) {
  const needsPeriods = cond.pattern === 'active_n_of_m';
  const needsConsecutive = cond.pattern === 'active_every_period';
  const needsGap = ['returned_after', 'became_inactive', 'reactivated', 'increasing_activity', 'declining_activity'].includes(
    cond.pattern,
  );

  return (
    <div className={rowClass}>
      <select
        value={cond.pattern}
        onChange={(e) => patch({ pattern: e.target.value as RetentionPattern })}
        className={`${selectClass} max-w-[280px]`}
      >
        {(Object.keys(RETENTION_PATTERN_LABELS) as RetentionPattern[]).map((p) => (
          <option key={p} value={p}>
            {RETENTION_PATTERN_LABELS[p]}
          </option>
        ))}
      </select>

      <span className={wordClass}>on</span>
      <select
        value={cond.event ?? ''}
        onChange={(e) => patch({ event: e.target.value || undefined })}
        className={selectClass}
      >
        <option value="">any event</option>
        {catalog.events.map((e) => (
          <option key={e.name} value={e.name}>
            {e.label}
          </option>
        ))}
      </select>

      {needsPeriods && (
        <>
          <span className={wordClass}>at least</span>
          <NumberInput value={cond.periods ?? 1} onChange={(n) => patch({ periods: n })} min={1} />
        </>
      )}
      {needsConsecutive && (
        <>
          <span className={wordClass}>for</span>
          <NumberInput
            value={cond.consecutive ?? 4}
            onChange={(n) => patch({ consecutive: n })}
            min={1}
          />
          <span className={wordClass}>consecutive</span>
        </>
      )}
      {(needsPeriods || needsConsecutive) && (
        <select
          value={cond.periodUnit ?? 'day'}
          onChange={(e) => patch({ periodUnit: e.target.value })}
          className={selectClass}
        >
          <option value="day">days</option>
          <option value="week">weeks</option>
          <option value="month">months</option>
        </select>
      )}
      {needsGap && (
        <>
          <span className={wordClass}>gap of</span>
          <NumberInput value={cond.gapDays ?? 30} onChange={(n) => patch({ gapDays: n })} min={1} />
          <span className={wordClass}>days</span>
        </>
      )}

      <TimeWindowPicker value={cond.window} onChange={(w) => patch({ window: w })} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cross-event
 * ------------------------------------------------------------------ */

const RELATIONS: { value: RelativeEventCondition['relation']; label: string }[] = [
  { value: 'within_after', label: 'within … after' },
  { value: 'within_before', label: 'within … before' },
  { value: 'after', label: 'at any point after' },
  { value: 'before', label: 'at any point before' },
  { value: 'never_after', label: 'never within … after' },
];

function RelativeEventEditor({
  cond,
  catalog,
  patch,
}: {
  cond: RelativeEventCondition;
  catalog: SemanticCatalog;
  patch: PatchFn;
}) {
  const needsGap = ['within_after', 'within_before', 'never_after'].includes(cond.relation);

  return (
    <div className="space-y-1.5">
      <div className={rowClass}>
        <span className={wordClass}>Performed</span>
        <EventPicker
          catalog={catalog}
          value={cond.event}
          onChange={(name) => patch({ event: name, filters: [] })}
        />
        <select
          value={cond.relation}
          onChange={(e) => patch({ relation: e.target.value })}
          className={selectClass}
        >
          {RELATIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {needsGap && (
          <>
            <NumberInput
              value={cond.gap?.value ?? 7}
              onChange={(n) => patch({ gap: { value: n, unit: cond.gap?.unit ?? 'day' } })}
              min={1}
            />
            <select
              value={cond.gap?.unit ?? 'day'}
              onChange={(e) =>
                patch({ gap: { value: cond.gap?.value ?? 7, unit: e.target.value as TimeUnit } })
              }
              className={selectClass}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}s
                </option>
              ))}
            </select>
          </>
        )}
        <span className={wordClass}>performing</span>
        <EventPicker
          catalog={catalog}
          value={cond.anchorEvent}
          onChange={(name) => patch({ anchorEvent: name, anchorFilters: [] })}
        />
        <TimeWindowPicker value={cond.window} onChange={(w) => patch({ window: w })} />
      </div>

      {cond.relation !== 'never_after' && (
        <div className={rowClass}>
          <span className={wordClass}>at least</span>
          <NumberInput value={cond.minCount} onChange={(n) => patch({ minCount: n })} min={1} />
          <span className={wordClass}>time(s)</span>
        </div>
      )}

      {cond.event && (
        <EventFilterRows
          eventName={cond.event}
          filters={cond.filters}
          catalog={catalog}
          onChange={(filters) => patch({ filters })}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Account roll-up
 * ------------------------------------------------------------------ */

function AccountRollupEditor({
  cond,
  patch,
}: {
  cond: AccountRollupCondition;
  patch: PatchFn;
}) {
  return (
    <div className={rowClass}>
      <span className={wordClass}>In this account,</span>
      <select
        value={cond.mode}
        onChange={(e) => patch({ mode: e.target.value })}
        className={selectClass}
      >
        <option value="any">at least one user</option>
        <option value="all">every user</option>
        <option value="none">no user</option>
        <option value="count">a number of users</option>
      </select>
      {cond.mode === 'count' && (
        <>
          <CountOperatorSelect
            value={cond.operator ?? 'count_gte'}
            onChange={(op) => patch({ operator: op })}
          />
          <NumberInput value={cond.value ?? 1} onChange={(n) => patch({ value: n })} min={0} />
        </>
      )}
      <span className={wordClass}>matches the nested rule below</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Dispatcher
 * ------------------------------------------------------------------ */

export function CohortConditionEditor({
  condition,
  catalog,
  patch,
}: {
  condition: CohortCondition;
  catalog: SemanticCatalog;
  patch: PatchFn;
}) {
  switch (condition.kind) {
    case 'property':
      return <PropertyEditor cond={condition} catalog={catalog} patch={patch} />;
    case 'event':
      return <EventEditor cond={condition} catalog={catalog} patch={patch} />;
    case 'metric':
      return <MetricEditor cond={condition} catalog={catalog} patch={patch} />;
    case 'cohort':
      return <CohortMembershipEditor cond={condition} catalog={catalog} patch={patch} />;
    case 'sequence':
      return <SequenceEditor cond={condition} catalog={catalog} patch={patch} />;
    case 'retention':
      return <RetentionEditor cond={condition} catalog={catalog} patch={patch} />;
    case 'relative_event':
      return <RelativeEventEditor cond={condition} catalog={catalog} patch={patch} />;
    case 'account_rollup':
      return <AccountRollupEditor cond={condition} patch={patch} />;
    default:
      return <div className="text-[13px] text-slate-400">Unsupported condition</div>;
  }
}

/** Short label used in collapsed rows and the tree gutter. */
export function conditionHeadline(condition: CohortCondition, catalog: SemanticCatalog): string {
  switch (condition.kind) {
    case 'property':
      return findProperty(catalog, condition.property)?.label ?? condition.property ?? 'Attribute';
    case 'event':
      return findEvent(catalog, condition.event)?.label ?? condition.event ?? 'Behaviour';
    case 'metric':
      return catalog.metrics.find((m) => m.key === condition.metric)?.label ?? 'Metric';
    case 'cohort':
      return condition.cohortName ?? condition.cohortSlug ?? 'Cohort membership';
    case 'sequence':
      return `Sequence · ${condition.steps.filter((s) => s.event).length} steps`;
    case 'retention':
      return RETENTION_PATTERN_LABELS[condition.pattern];
    case 'relative_event':
      return 'Cross-event rule';
    case 'account_rollup':
      return 'Account roll-up';
    default:
      return 'Condition';
  }
}

export { inputClass };
