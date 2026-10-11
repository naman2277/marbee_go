import { useEffect, useRef, useState } from 'react';

type Props = {
  title: string;
  srcDoc: string;
  /** Seamless embed — no border, shadow, or min-height padding */
  seamless?: boolean;
  className?: string;
};

export function HtmlFormIframe({ title, srcDoc, seamless, className }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'marbee-form-resize') return;
      const next = Number(event.data.height);
      if (!Number.isFinite(next) || next < 40) return;
      setHeight(Math.ceil(next));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    setHeight(120);
  }, [srcDoc]);

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={srcDoc}
      style={{ height }}
      className={
        className ??
        `block w-full overflow-hidden bg-transparent ${
          seamless ? 'border-0' : 'rounded-xl border border-slate-200 bg-white shadow-sm'
        }`
      }
      sandbox="allow-same-origin allow-scripts allow-forms"
    />
  );
}
