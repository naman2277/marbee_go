/**
 * DEV-ONLY harness for the redesigned Journey builder. Mounted at /dev/journey-studio
 * when import.meta.env.DEV is true (see App.tsx). No Supabase / auth — the graph,
 * entry config and settings live in component state; publish/test are stubs.
 */
import { useCallback, useState } from 'react';
import { JourneyBuilder } from '@/components/journeys/builder/JourneyBuilder';
import { DEV_JOURNEY_CANVAS } from '@/components/journeys/builder/seed';
import type { CampaignSettings } from '@/lib/journeys';
import type { RunResult } from '@/lib/journey-runner';
import type { Audience } from '@/lib/audiences';

const SEED_AUDIENCES = [
  { slug: 'email-reachable', name: 'Email reachable', schema_slug: 'customer', member_count: 28396 },
  { slug: 'new-signups-30d', name: 'New signups (30d)', schema_slug: 'customer', member_count: 1240 },
  { slug: 'vip-tier', name: 'VIP tier', schema_slug: 'customer', member_count: 512 },
  { slug: 'cart-abandoners', name: 'Cart abandoners', schema_slug: 'customer', member_count: 3877 },
] as unknown as Audience[];

export function DevJourneyStudioPage() {
  const [canvasJson, setCanvasJson] = useState<unknown>(DEV_JOURNEY_CANVAS);
  const [entryTrigger, setEntryTrigger] = useState<Record<string, unknown>>({});
  const [settings, setSettings] = useState<CampaignSettings>({ journey_type: 'flow' });
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);

  const onSaveCanvas = useCallback((json: unknown) => {
    setCanvasJson(json);
    console.debug('[dev journey] save canvas', json);
  }, []);

  const onSaveEntryTrigger = useCallback((mirror: Record<string, unknown>) => {
    setEntryTrigger(mirror);
    console.debug('[dev journey] save entry_trigger_config', mirror);
  }, []);

  const onSaveSettings = useCallback(
    async (patch: {
      settings?: Partial<CampaignSettings>;
      startsAt?: string | null;
      endsAt?: string | null;
    }) => {
      if (patch.settings) setSettings((s) => ({ ...s, ...patch.settings }));
      if (patch.startsAt !== undefined) setStartsAt(patch.startsAt);
      if (patch.endsAt !== undefined) setEndsAt(patch.endsAt);
      console.debug('[dev journey] save settings', patch);
      return {};
    },
    [],
  );

  const onPublish = useCallback(async () => {
    console.debug('[dev journey] publish (stub)');
  }, []);

  const onTest = useCallback(
    async (): Promise<RunResult> => ({ enrolled: 5, advanced: 12, completed: 3, errors: [] }),
    [],
  );

  const onRename = useCallback(() => console.debug('[dev journey] rename (stub)'), []);

  return (
    <div
      className="flex w-full flex-col bg-slate-100"
      style={{ height: '100vh', minHeight: 720 }}
    >
      <div className="shrink-0 bg-amber-50 px-4 py-1.5 text-[11px] font-semibold text-amber-800">
        Dev harness · /dev/journey-studio · in-memory data, no Supabase
      </div>
      <div className="min-h-0 flex-1 p-3">
        <JourneyBuilder
          journeyId="dev-journey"
          versionId="dev-version"
          tenantId="dev"
          environment="dev"
          journeyName="Onboarding nurture (dev)"
          journeyStatus="draft"
          displayStatus="draft"
          versionNumber={1}
          canvasJson={canvasJson}
          entryTriggerConfig={entryTrigger}
          settings={settings}
          startsAt={startsAt}
          endsAt={endsAt}
          audiences={SEED_AUDIENCES}
          services={[]}
          templates={[]}
          providers={[]}
          onSaveCanvas={onSaveCanvas}
          onSaveEntryTrigger={onSaveEntryTrigger}
          onSaveSettings={onSaveSettings}
          onPublish={onPublish}
          onTest={onTest}
          onRename={onRename}
        />
      </div>
    </div>
  );
}
