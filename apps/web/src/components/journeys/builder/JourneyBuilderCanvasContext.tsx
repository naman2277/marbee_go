import { createContext, useContext } from 'react';

export type JourneyCanvasApi = {
  selectedNodeId: string | null;
  liveCounts?: Record<string, number>;
  onSelectNode: (id: string | null) => void;
  onUpdateNodeLabel: (id: string, label: string) => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode: (id: string) => void;
  onInsertBetween: (edgeId: string, stepType: string) => void;
};

const noop = () => {};

export const JourneyBuilderCanvasContext = createContext<JourneyCanvasApi>({
  selectedNodeId: null,
  onSelectNode: noop,
  onUpdateNodeLabel: noop,
  onDeleteNode: noop,
  onDuplicateNode: noop,
  onInsertBetween: noop,
});

export function useJourneyCanvas(): JourneyCanvasApi {
  return useContext(JourneyBuilderCanvasContext);
}
