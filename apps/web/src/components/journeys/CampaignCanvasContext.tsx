import { createContext, useContext } from 'react';

export type CampaignCanvasContextValue = {
  onThreadPreview?: (sourceNodeId: string, sourceHandle?: string | null) => void;
  /** Adobe Spectrum styling for campaign editor canvas */
  spectrumTheme?: boolean;
};

export const CampaignCanvasContext = createContext<CampaignCanvasContextValue>({});

export function useCampaignCanvas() {
  return useContext(CampaignCanvasContext);
}
