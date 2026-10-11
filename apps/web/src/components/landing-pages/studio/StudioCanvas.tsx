/** Landing Studio — device-framed live canvas with drag-to-add + block toolbar. */
import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, Copy, Trash2 } from 'lucide-react';
import type { LandingContent, LandingSectionType, MarbeeLandingPage } from '@/lib/landing-pages';
import { findBlockInTree } from '@/lib/landing-blocks';
import { LandingPageRenderer } from '../LandingPageRenderer';

export type AddTarget = {
  afterId?: string;
  beforeId?: string;
  containerId?: string;
  colIndex?: number;
};

type Props = {
  page: MarbeeLandingPage;
  content: LandingContent;
  tenantId: string;
  environment: string;
  device: 'desktop' | 'tablet' | 'mobile';
  zoom: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddBlock: (type: LandingSectionType, target?: AddTarget) => void;
  onMoveBlock: (id: string, dir: 'up' | 'down') => void;
  onDuplicateBlock: (id: string) => void;
  onDeleteBlock: (id: string) => void;
  onInlineEdit: (id: string, patch: Record<string, unknown>) => void;
};

const DEVICE_WIDTH: Record<Props['device'], string> = {
  desktop: '100%',
  tablet: '834px',
  mobile: '390px',
};

export function StudioCanvas({
  page,
  content,
  tenantId,
  environment,
  device,
  zoom,
  selectedId,
  onSelect,
  onAddBlock,
  onMoveBlock,
  onDuplicateBlock,
  onDeleteBlock,
  onInlineEdit,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [indicatorTop, setIndicatorTop] = useState<number | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<AddTarget | undefined>(undefined);

  const resolveTarget = (e: React.DragEvent): { target: AddTarget | undefined; indicator: number | null } => {
    const frame = frameRef.current;
    const overEl = e.target as HTMLElement;

    // 1) inside a container column → drop into that column
    const colEl = overEl.closest?.('[data-container-id]') as HTMLElement | null;
    if (colEl?.dataset.containerId) {
      return {
        target: { containerId: colEl.dataset.containerId, colIndex: Number(colEl.dataset.colIndex ?? 0) },
        indicator: null,
      };
    }

    // 2) top-level block → before / after based on pointer half
    if (!frame) return { target: undefined, indicator: null };
    const blockEl = overEl.closest?.('[data-block-id]') as HTMLElement | null;
    const topLevel = blockEl && !blockEl.parentElement?.closest('[data-container-id]') ? blockEl : null;
    if (!topLevel) {
      // dropped on empty canvas area → append
      return { target: undefined, indicator: null };
    }
    const fr = frame.getBoundingClientRect();
    const br = topLevel.getBoundingClientRect();
    const before = e.clientY < br.top + br.height / 2;
    const id = topLevel.dataset.blockId!;
    const edgeY = (before ? br.top - fr.top : br.bottom - fr.top) / (zoom || 1);
    return { target: before ? { beforeId: id } : { afterId: id }, indicator: edgeY };
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/marbee-block-type')) return;
    e.preventDefault();
    setDragOver(true);
    const { target, indicator } = resolveTarget(e);
    targetRef.current = target;
    setIndicatorTop(indicator);
  };

  const clearDrag = () => {
    setDragOver(false);
    setIndicatorTop(null);
    targetRef.current = undefined;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/marbee-block-type') as LandingSectionType;
    const target = targetRef.current;
    clearDrag();
    if (!type) return;
    onAddBlock(type, target);
  };

  const selected = selectedId ? findBlockInTree(content.sections, selectedId) : null;

  return (
    <div className="flex h-full flex-col bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#f8fafc_0%_50%)] bg-[length:16px_16px]">
      <div
        className="flex-1 overflow-auto p-6"
        onClick={() => onSelect(null)}
        onDragOver={handleDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) clearDrag();
        }}
        onDrop={handleDrop}
      >
        <div
          className="mx-auto origin-top transition-[width] duration-200"
          style={{ width: DEVICE_WIDTH[device], maxWidth: '100%', transform: `scale(${zoom})` }}
        >
          <div
            ref={frameRef}
            className={`relative overflow-hidden rounded-xl border bg-white shadow-xl ring-1 ring-slate-900/5 ${
              dragOver ? 'border-brand-400 ring-2 ring-brand-300' : 'border-slate-200'
            }`}
          >
            <LandingPageRenderer
              page={{ ...page, content }}
              tenantId={tenantId}
              environment={environment}
              interactive
              editable
              selectedId={selectedId}
              onSelectSection={onSelect}
              onInlineEdit={onInlineEdit}
            />

            {selected && (
              <BlockToolbar
                key={selected.id}
                frameRef={frameRef}
                blockId={selected.id}
                zoom={zoom}
                onMove={onMoveBlock}
                onDuplicate={onDuplicateBlock}
                onDelete={onDeleteBlock}
              />
            )}

            {indicatorTop !== null && (
              <div
                className="pointer-events-none absolute left-0 right-0 z-40 -mt-0.5 h-1 bg-brand-500 shadow-[0_0_0_2px_rgba(79,70,229,0.25)]"
                style={{ top: indicatorTop }}
              >
                <span className="absolute -left-1 -top-1.5 h-3.5 w-3.5 rounded-full border-2 border-brand-500 bg-white" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Floating action bar pinned to the top-right of the selected block. */
function BlockToolbar({
  frameRef,
  blockId,
  zoom,
  onMove,
  onDuplicate,
  onDelete,
}: {
  frameRef: React.RefObject<HTMLDivElement | null>;
  blockId: string;
  zoom: number;
  onMove: (id: string, dir: 'up' | 'down') => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // measure after paint (getBoundingClientRect is post-transform → divide by zoom)
  useIsoLayout(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const el = frame.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`) as HTMLElement | null;
    if (!el) return setPos(null);
    const z = zoom || 1;
    const fr = frame.getBoundingClientRect();
    const br = el.getBoundingClientRect();
    const frameW = fr.width / z;
    setPos({
      top: Math.max(4, (br.top - fr.top) / z + 4),
      left: Math.min(frameW - 132, (br.right - fr.left) / z - 128),
    });
  }, [blockId, zoom]);

  if (!pos) return null;
  return (
    <div
      className="absolute z-30 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 p-0.5 shadow-lg backdrop-blur"
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
    >
      <TB icon={ArrowUp} title="Move up" onClick={() => onMove(blockId, 'up')} />
      <TB icon={ArrowDown} title="Move down" onClick={() => onMove(blockId, 'down')} />
      <TB icon={Copy} title="Duplicate" onClick={() => onDuplicate(blockId)} />
      <TB icon={Trash2} title="Delete" danger onClick={() => onDelete(blockId)} />
    </div>
  );
}

function TB({
  icon: Icon,
  title,
  onClick,
  danger,
}: {
  icon: typeof ArrowUp;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-md p-1.5 text-slate-500 hover:bg-slate-100 ${danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:text-slate-900'}`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

// tiny useLayoutEffect that also re-runs on window resize
function useIsoLayout(fn: () => void, deps: React.DependencyList) {
  useLayoutEffect(() => {
    fn();
    const h = () => fn();
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
