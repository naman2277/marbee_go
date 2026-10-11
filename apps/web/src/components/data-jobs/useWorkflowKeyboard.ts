import { useEffect, useRef, type RefObject } from 'react';
import type { Node } from 'reactflow';
import type { WorkflowNodeData } from '@/lib/data-jobs';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

type Clipboard = {
  node: Node<WorkflowNodeData>;
} | null;

type Options = {
  containerRef: RefObject<HTMLElement | null>;
  selectedId: string | null;
  selectedNode: Node<WorkflowNodeData> | null;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onPaste: (node: Node<WorkflowNodeData>) => void;
  onDeselect: () => void;
  onToggleFullscreen?: () => void;
  fullscreen?: boolean;
};

export function useWorkflowKeyboard({
  containerRef,
  selectedId,
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
        if (selectedId) {
          e.preventDefault();
          onDeselect();
        }
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        onDelete(selectedId);
        return;
      }

      if (mod && e.key === 'c' && selectedNode) {
        e.preventDefault();
        clipboardRef.current = {
          node: JSON.parse(JSON.stringify(selectedNode)) as Node<WorkflowNodeData>,
        };
        return;
      }

      if (mod && e.key === 'v' && clipboardRef.current?.node) {
        e.preventDefault();
        const src = clipboardRef.current.node;
        const pasted: Node<WorkflowNodeData> = {
          ...src,
          id: crypto.randomUUID(),
          position: {
            x: src.position.x + 48,
            y: src.position.y + 48,
          },
          data: {
            ...src.data,
            label: `${src.data.label} (paste)`,
          },
          selected: false,
        };
        onPaste(pasted);
        return;
      }

      if (mod && e.key === 'd' && selectedId) {
        e.preventDefault();
        onDuplicate(selectedId);
        return;
      }

      if (mod && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        onToggleFullscreen?.();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    selectedId,
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

  return { clipboardRef };
}
