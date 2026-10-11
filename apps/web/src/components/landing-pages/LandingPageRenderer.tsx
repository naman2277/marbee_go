import type { LandingSection, LandingContent, MarbeeLandingPage } from '@/lib/landing-pages';
import { BlockList, resolveTheme, type BlockRenderCtx } from './LandingBlockRenderer';

type Props = {
  page: MarbeeLandingPage;
  tenantId: string;
  environment: string;
  preview?: boolean;
  interactive?: boolean;
  editable?: boolean;
  /**
   * Thumbnail/embedded use: do NOT inject the page's global `customCss` <style>
   * and render raw-HTML content as a neutral placeholder. Prevents a page's
   * styles from leaking into the surrounding app when many are rendered at once
   * (e.g. the gallery list).
   */
  isolate?: boolean;
  selectedId?: string | null;
  onSelectSection?: (id: string) => void;
  onMoveSection?: (id: string, direction: 'up' | 'down') => void;
  onInlineEdit?: (id: string, patch: Record<string, unknown>) => void;
};

/**
 * Themed page shell. Section rendering (legacy + v2 blocks, nested containers)
 * lives in LandingBlockRenderer's `BlockList`. This component's contract —
 * props and the `updateSectionInContent` export — is unchanged.
 */
export function LandingPageRenderer({
  page,
  tenantId,
  environment,
  preview,
  interactive,
  editable,
  isolate,
  selectedId,
  onSelectSection,
  onInlineEdit,
}: Props) {
  const { theme } = page.content;
  const resolved = resolveTheme(theme);
  const fontFamily = resolved.bodyFontClass;

  const ctx: BlockRenderCtx = {
    theme: resolved,
    tenantId,
    environment,
    interactive,
    editable,
    selectedId,
    onSelectSection,
    onInlineEdit,
  };

  return (
    <div
      style={{ background: resolved.background, color: resolved.text }}
      className={`min-h-full w-full max-w-full overflow-x-hidden ${fontFamily}`}
    >
      {preview && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">
          Preview mode — unpublished changes may differ from live page
        </div>
      )}

      {!isolate && theme?.customCss && <style dangerouslySetInnerHTML={{ __html: theme.customCss }} />}

      {page.content.mode === 'html' ? (
        isolate ? (
          <div className="flex min-h-[320px] w-full items-center justify-center bg-slate-50 text-sm text-slate-400">
            Custom HTML page
          </div>
        ) : (
          <div
            className="w-full max-w-full overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: page.content.html || '' }}
          />
        )
      ) : (
        <BlockList sections={page.content.sections} ctx={{ ...ctx, isolate }} />
      )}
    </div>
  );
}

export function updateSectionInContent(
  content: LandingContent,
  sectionId: string,
  props: LandingSection['props'],
): LandingContent {
  return {
    ...content,
    sections: content.sections.map((s) =>
      s.id === sectionId ? ({ ...s, props } as LandingSection) : s,
    ),
  };
}
