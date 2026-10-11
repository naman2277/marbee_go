/**
 * Landing Studio — full-screen block editor shell.
 *
 * Owns the editing session (content + undo/redo). Page-level settings
 * (SEO / publish / schedule / history) are rendered by the host into the
 * settings drawer so they stay wired to the host's mutations.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Blocks, Layers, Palette, Sparkles } from 'lucide-react';
import type {
  LandingContent,
  LandingSection,
  LandingSectionType,
  LandingTheme,
  MarbeeLandingPage,
} from '@/lib/landing-pages';
import { createLandingSection } from '@/lib/landing-pages';
import {
  cloneBlock,
  findBlockInTree,
  removeBlockFromTree,
  updateBlockInTree,
} from '@/lib/landing-blocks';
import { useHistoryState } from '@/hooks/useHistoryState';
import { StudioTopBar } from './StudioTopBar';
import { StudioCanvas, type AddTarget } from './StudioCanvas';
import { StudioInspector } from './StudioInspector';
import { StudioBlockLibrary } from './StudioBlockLibrary';
import { StudioLayersPanel } from './StudioLayersPanel';
import { StudioThemePanel } from './StudioThemePanel';
import { StudioAiPanel } from './StudioAiPanel';
import { StudioSettingsDrawer } from './StudioSettingsDrawer';
import { LandingPageRenderer } from '../LandingPageRenderer';

type Props = {
  page: MarbeeLandingPage;
  tenantId: string;
  environment: string;
  formOptions: Array<{ slug: string; name: string }>;
  onChange: (content: LandingContent) => void;
  onRename?: (name: string) => void;
  onSave: () => void;
  onPublish: (publish: boolean) => void;
  saving?: boolean;
  publishing?: boolean;
  dirty?: boolean;
  statusBadge?: ReactNode;
  settingsContent?: ReactNode;
  onApplySeo?: (title: string, description: string) => void;
  onBack?: () => void;
  /** fills the viewport (route host) vs. a bordered panel (dev harness) */
  fullScreen?: boolean;
};

type LeftTab = 'blocks' | 'layers' | 'theme' | 'ai';

// --- tree ops --------------------------------------------------------------

/** Insert `block` immediately after `id` at whatever depth it lives. Returns
 * `found: false` (and the list unchanged) if `id` isn't in this subtree. */
function insertAfterId(
  list: LandingSection[],
  id: string,
  block: LandingSection,
): { list: LandingSection[]; found: boolean } {
  const out: LandingSection[] = [];
  let found = false;
  for (const s of list) {
    if (s.type === 'container') {
      const r = insertAfterId(s.props.children, id, block);
      if (r.found) {
        found = true;
        out.push({ ...s, props: { ...s.props, children: r.list } });
      } else {
        out.push(s);
      }
    } else {
      out.push(s);
    }
    if (s.id === id) {
      out.push(block);
      found = true;
    }
  }
  return { list: out, found };
}

function insertBeforeId(
  list: LandingSection[],
  id: string,
  block: LandingSection,
): { list: LandingSection[]; found: boolean } {
  const out: LandingSection[] = [];
  let found = false;
  for (const s of list) {
    if (s.id === id) {
      out.push(block);
      found = true;
    }
    if (s.type === 'container') {
      const r = insertBeforeId(s.props.children, id, block);
      if (r.found) {
        found = true;
        out.push({ ...s, props: { ...s.props, children: r.list } });
      } else {
        out.push(s);
      }
    } else {
      out.push(s);
    }
  }
  return { list: out, found };
}

function insertBlock(sections: LandingSection[], block: LandingSection, target?: AddTarget): LandingSection[] {
  if (target?.containerId) {
    const addToContainer = (list: LandingSection[]): LandingSection[] =>
      list.map((s) => {
        if (s.id === target.containerId && s.type === 'container') {
          return { ...s, props: { ...s.props, children: [...s.props.children, block] } };
        }
        if (s.type === 'container') {
          return { ...s, props: { ...s.props, children: addToContainer(s.props.children) } };
        }
        return s;
      });
    return addToContainer(sections);
  }
  if (target?.beforeId) {
    const r = insertBeforeId(sections, target.beforeId, block);
    return r.found ? r.list : [block, ...sections];
  }
  if (target?.afterId) {
    const r = insertAfterId(sections, target.afterId, block);
    return r.found ? r.list : [...sections, block];
  }
  return [...sections, block];
}

/** Move a block up/down within whatever array (top level or a container) holds it. */
function moveBlock(sections: LandingSection[], id: string, dir: 'up' | 'down'): LandingSection[] {
  const idx = sections.findIndex((s) => s.id === id);
  if (idx >= 0) {
    const to = dir === 'up' ? idx - 1 : idx + 1;
    if (to < 0 || to >= sections.length) return sections;
    const next = [...sections];
    [next[idx], next[to]] = [next[to], next[idx]];
    return next;
  }
  return sections.map((s) =>
    s.type === 'container'
      ? { ...s, props: { ...s.props, children: moveBlock(s.props.children, id, dir) } }
      : s,
  );
}

/** Reorder for drag in the layers panel: pull `sourceId` out, drop it before `targetId`. */
function reorderBlock(sections: LandingSection[], sourceId: string, targetId: string): LandingSection[] {
  const source = findBlockInTree(sections, sourceId);
  if (!source || sourceId === targetId) return sections;
  const without = removeBlockFromTree(sections, sourceId);
  const place = (list: LandingSection[]): LandingSection[] => {
    const idx = list.findIndex((s) => s.id === targetId);
    if (idx >= 0) {
      const next = [...list];
      next.splice(idx, 0, source);
      return next;
    }
    return list.map((s) =>
      s.type === 'container' ? { ...s, props: { ...s.props, children: place(s.props.children) } } : s,
    );
  };
  return place(without);
}

function duplicateBlock(sections: LandingSection[], id: string): LandingSection[] {
  const out: LandingSection[] = [];
  for (const s of sections) {
    if (s.type === 'container') {
      out.push({ ...s, props: { ...s.props, children: duplicateBlock(s.props.children, id) } });
    } else {
      out.push(s);
    }
    if (s.id === id) out.push(cloneBlock(s));
  }
  return out;
}

// --- component -----------------------------------------------------------

export function LandingStudio({
  page,
  tenantId,
  environment,
  formOptions,
  onChange,
  onRename,
  onSave,
  onPublish,
  saving,
  publishing,
  dirty,
  statusBadge,
  settingsContent,
  onApplySeo,
  onBack,
  fullScreen,
}: Props) {
  const history = useHistoryState<LandingContent>(page.content);
  const content = history.state;

  const [leftTab, setLeftTab] = useState<LeftTab>('blocks');
  const [selectedId, setSelectedId] = useState<string | null>(page.content.sections[0]?.id ?? null);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [zoom, setZoom] = useState(1);
  const [previewing, setPreviewing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Sync external reloads (host refetched the page) into history.
  const lastExternal = useRef(JSON.stringify(page.content));
  useEffect(() => {
    const incoming = JSON.stringify(page.content);
    if (incoming !== lastExternal.current && incoming !== JSON.stringify(history.state)) {
      lastExternal.current = incoming;
      history.reset(page.content);
    } else {
      lastExternal.current = incoming;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.content]);

  // All content changes flow through history.set; a single effect below
  // forwards the resulting state to the host (covers edits AND undo/redo).
  const commit = useCallback(
    (next: LandingContent, opts?: { commit?: boolean }) => {
      history.set(next, { commit: opts?.commit ?? true });
    },
    [history],
  );

  const mutateSections = useCallback(
    (fn: (s: LandingSection[]) => LandingSection[], opts?: { commit?: boolean }) => {
      commit({ ...content, sections: fn(content.sections) }, opts);
    },
    [commit, content],
  );

  const addBlock = useCallback(
    (type: LandingSectionType, target?: AddTarget) => {
      const block = createLandingSection(type);
      const effectiveTarget = target ?? (selectedId ? { afterId: selectedId } : undefined);
      mutateSections((s) => insertBlock(s, block, effectiveTarget));
      setSelectedId(block.id);
    },
    [mutateSections, selectedId],
  );

  const updateBlockProps = useCallback(
    (id: string, props: LandingSection['props'], opts?: { commit?: boolean }) => {
      commit({ ...content, sections: updateBlockInTree(content.sections, id, props) }, opts);
    },
    [commit, content],
  );

  const deleteBlock = useCallback(
    (id: string) => {
      mutateSections((s) => removeBlockFromTree(s, id));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [mutateSections],
  );

  const setTheme = useCallback(
    (theme: LandingTheme, opts?: { commit?: boolean }) => commit({ ...content, theme }, opts),
    [commit, content],
  );

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? history.redo() : history.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        history.redo();
      } else if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteBlock(selectedId);
      } else if (!typing && mod && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault();
        mutateSections((s) => duplicateBlock(s, selectedId));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, selectedId, deleteBlock, mutateSections]);

  // history.state changes must propagate to the host too (undo/redo)
  const stateRef = useRef(content);
  useEffect(() => {
    if (stateRef.current !== content) {
      stateRef.current = content;
      onChange(content);
    }
  }, [content, onChange]);

  const selected = useMemo(
    () => (selectedId ? findBlockInTree(content.sections, selectedId) : null),
    [selectedId, content.sections],
  );

  const isPublished = page.status === 'published';

  return (
    <div
      className={
        fullScreen
          ? 'flex h-full w-full flex-col overflow-hidden bg-white'
          : 'flex h-[calc(100vh-8rem)] min-h-[640px] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white'
      }
    >
      <StudioTopBar
        pageName={page.name}
        onRename={(n) => onRename?.(n)}
        slug={page.slug}
        statusBadge={statusBadge}
        dirty={Boolean(dirty)}
        saving={Boolean(saving)}
        publishing={Boolean(publishing)}
        isPublished={isPublished}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        device={device}
        onDevice={setDevice}
        zoom={zoom}
        onZoom={setZoom}
        previewing={previewing}
        onTogglePreview={() => setPreviewing((v) => !v)}
        onOpenSettings={() => setSettingsOpen(true)}
        onSave={onSave}
        onPublish={onPublish}
        onBack={onBack}
      />

      {previewing ? (
        <div className="flex-1 overflow-auto bg-slate-100 p-6">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <LandingPageRenderer page={{ ...page, content }} tenantId={tenantId} environment={environment} preview />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* left rail */}
          <div className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
            <div className="grid grid-cols-4 border-b border-slate-200">
              {(
                [
                  ['blocks', Blocks, 'Blocks'],
                  ['layers', Layers, 'Layers'],
                  ['theme', Palette, 'Theme'],
                  ['ai', Sparkles, 'AI'],
                ] as Array<[LeftTab, typeof Blocks, string]>
              ).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLeftTab(id)}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold uppercase tracking-wide ${
                    leftTab === id ? 'border-b-2 border-brand-600 text-brand-700' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {leftTab === 'blocks' && <StudioBlockLibrary onAdd={(t) => addBlock(t)} />}
              {leftTab === 'layers' && (
                <StudioLayersPanel
                  sections={content.sections}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onReorder={(src, tgt) => mutateSections((s) => reorderBlock(s, src, tgt))}
                  onDuplicate={(id) => mutateSections((s) => duplicateBlock(s, id))}
                  onDelete={deleteBlock}
                />
              )}
              {leftTab === 'theme' && (
                <StudioThemePanel theme={content.theme ?? {}} onChange={(t) => setTheme(t)} />
              )}
              {leftTab === 'ai' && (
                <StudioAiPanel
                  content={content}
                  pageName={page.name}
                  selected={selected}
                  tenantId={tenantId}
                  environment={environment}
                  onReplacePage={(c) => {
                    commit({ ...c, valid_from: content.valid_from, valid_until: content.valid_until, public_token: content.public_token, fallback: content.fallback });
                    setSelectedId(c.sections[0]?.id ?? null);
                  }}
                  onApplyBlockProps={(id, props) => updateBlockProps(id, props)}
                  onAddBlock={(t) => addBlock(t)}
                  onSelect={setSelectedId}
                  onApplySeo={onApplySeo}
                />
              )}
            </div>
          </div>

          {/* canvas */}
          <div className="min-w-0 flex-1">
            <StudioCanvas
              page={page}
              content={content}
              tenantId={tenantId}
              environment={environment}
              device={device}
              zoom={zoom}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAddBlock={addBlock}
              onMoveBlock={(id, dir) => mutateSections((s) => moveBlock(s, id, dir))}
              onDuplicateBlock={(id) => mutateSections((s) => duplicateBlock(s, id))}
              onDeleteBlock={deleteBlock}
              onInlineEdit={(id, patch) => {
                const block = findBlockInTree(content.sections, id);
                if (block) updateBlockProps(id, { ...(block.props as object), ...patch } as LandingSection['props'], { commit: false });
              }}
            />
          </div>

          {/* inspector */}
          <div className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white">
            <StudioInspector
              section={selected}
              formOptions={formOptions}
              onChange={(props) => selected && updateBlockProps(selected.id, props, { commit: false })}
            />
          </div>
        </div>
      )}

      <StudioSettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        {settingsContent ?? <p className="text-sm text-slate-500">No settings available.</p>}
      </StudioSettingsDrawer>
    </div>
  );
}
