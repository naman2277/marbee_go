/**
 * Renders a landing page as a scaled, fully-isolated preview inside an <iframe>.
 *
 * Landing pages can carry global `customCss` and raw-HTML blocks with their own
 * `<style>` tags. Rendering many of them directly on a list page leaks those
 * styles into the surrounding app. An iframe is its own document, so nothing
 * escapes — the app's stylesheets are cloned in so Tailwind classes still work.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MarbeeLandingPage } from '@/lib/landing-pages';
import { LandingPageRenderer } from './LandingPageRenderer';

type Props = {
  page: MarbeeLandingPage;
  tenantId: string;
  environment: string;
  /** virtual render width before scaling (desktop layout) */
  width?: number;
  /** scale factor applied to the iframe */
  scale?: number;
};

export function LandingThumbnail({
  page,
  tenantId,
  environment,
  width = 1280,
  scale = 0.34,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    doc.close();

    // clone the host app's stylesheets so Tailwind utility classes resolve
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      doc.head.appendChild(node.cloneNode(true));
    });
    const reset = doc.createElement('style');
    reset.textContent = 'html,body{margin:0;padding:0;background:#fff;overflow:hidden}';
    doc.head.appendChild(reset);

    setBody(doc.body);
    return () => setBody(null);
  }, [page.id]);

  return (
    <iframe
      ref={iframeRef}
      title={`Preview of ${page.name}`}
      aria-hidden
      tabIndex={-1}
      scrolling="no"
      className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
      style={{ width, height: 1400, transform: `scale(${scale})` }}
    >
      {body &&
        createPortal(
          <LandingPageRenderer page={page} tenantId={tenantId} environment={environment} isolate />,
          body,
        )}
    </iframe>
  );
}
