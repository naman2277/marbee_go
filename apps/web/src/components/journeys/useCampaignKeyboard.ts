import { useEffect, useRef, type RefObject } from 'react';
import type { Node } from 'reactflow';
import type { CampaignNodeData } from '@/lib/campaign-graph';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

type Clipboard = { node: Node<CampaignNodeData> } | null;

type Options = {
  containerRef: RefObject<HTMLElement | null>;
  selectedIds: string[];
  selectedNode: Node<CampaignNodeData> | null;
  onDelete: (ids: string[]) => void;
  onDuplicate: (id: string) => void;
  onPaste: (node: Node<CampaignNodeData>) => void;
  onDeselect: () => void;
  onToggleFullscreen?: () => void;
  fullscreen?: boolean;
};

export function useCampaignKeyboard({
  containerRef,
  selectedIds,
  selectedNode,
  onDelete,
  onDuplicate,
  onPaste,
  onDeselect,
  onToggleFullscreen,
  fullscreen,
}: Options) {
  const clipboardRef = useRef<Clipboard>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;

      if (e.key === 'Escape') {
        if (fullscreen && onToggleFullscreen) {
          e.preventDefault();
          onToggleFullscreen();
          return;
        }
        if (selectedIds.length) {
          e.preventDefault();
          onDeselect();
        }
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        e.preventDefault();
        onDelete(selectedIds);
        return;
      }

      if (mod && e.key === 'c' && selectedNode) {
        e.preventDefault();
        clipboardRef.current = {
          node: JSON.parse(JSON.stringify(selectedNode)) as Node<CampaignNodeData>,
        };
        return;
      }

      if (mod && e.key === 'v' && clipboardRef.current?.node) {
        e.preventDefault();
        const src = clipboardRef.current.node;
        const pasted: Node<CampaignNodeData> = {
          ...src,
          id: crypto.randomUUID(),
          position: { x: src.position.x + 48, y: src.position.y + 48 },
          data: {
            ...src.data,
            label: `${src.data.label} (paste)`,
            runStatus: 'idle',
            liveCount: undefined,
          },
          selected: false,
        };
        onPaste(pasted);
        return;
      }

      if (mod && e.key === 'd' && selectedIds.length === 1) {
        e.preventDefault();
        onDuplicate(selectedIds[0]);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    selectedIds,
    selectedNode,
    onDelete,
    onDuplicate,
    onPaste,
    onDeselect,
    onToggleFullscreen,
    fullscreen,
  ]);

  useEffect(() => {
    containerRef.current?.focus();
  }, [containerRef, fullscreen]);
}
