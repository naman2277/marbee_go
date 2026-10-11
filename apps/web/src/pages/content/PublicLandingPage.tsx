import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Clock, CalendarX, Search } from 'lucide-react';
import { LandingPageRenderer } from '@/components/landing-pages/LandingPageRenderer';
import { fetchPublicLandingPage } from '@/lib/landing-pages';

export function PublicLandingPage() {
  const { slug: token = '' } = useParams<{ slug: string }>();

  const { data: page, isLoading, error } = useQuery({
    queryKey: ['public-landing-page', token],
    queryFn: () => fetchPublicLandingPage(token),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (page?.seo.title) {
      document.title = page.seo.title;
    }
    const metaDesc = document.querySelector('meta[name="description"]');
    if (page?.seo.description && metaDesc) {
      metaDesc.setAttribute('content', page.seo.description);
    }
  }, [page]);

  // Handle Redirect fallback if page is invalid and redirect configured
  useEffect(() => {
    if (!page) return;
    const now = new Date();
    const validFrom = page.content.valid_from ? new Date(page.content.valid_from) : null;
    const validUntil = page.content.valid_until ? new Date(page.content.valid_until) : null;
    const isInactive =
      (validFrom && !isNaN(validFrom.getTime()) && now < validFrom) ||
      (validUntil && !isNaN(validUntil.getTime()) && now > validUntil);

    if (isInactive && page.content.fallback?.type === 'redirect' && page.content.fallback.redirectUrl) {
      window.location.replace(page.content.fallback.redirectUrl);
    }
  }, [page]);

  // Modern Skeleton Loading Animation with "Loading..." indicator
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 animate-pulse">
        {/* Floating Loading Badge */}
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-full border border-slate-200 bg-white/95 px-4 py-2 shadow-lg backdrop-blur-sm">
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
          <span className="text-xs font-semibold tracking-wide text-slate-700">Loading...</span>
        </div>

        {/* Top bar skeleton */}
        <header className="border-b border-slate-200 bg-white/70 px-6 py-4 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div className="h-7 w-32 rounded-lg bg-slate-200" />
            <div className="hidden sm:flex items-center gap-4">
              <div className="h-4 w-16 rounded bg-slate-200" />
              <div className="h-4 w-20 rounded bg-slate-200" />
              <div className="h-9 w-28 rounded-lg bg-slate-300" />
            </div>
          </div>
        </header>

        {/* Hero skeleton */}
        <main className="mx-auto max-w-5xl px-6 py-16 text-center">
          <div className="mx-auto mb-6 h-6 w-36 rounded-full bg-slate-200" />
          <div className="mx-auto mb-4 h-12 w-3/4 max-w-2xl rounded-xl bg-slate-300" />
          <div className="mx-auto mb-8 h-5 w-1/2 max-w-xl rounded-lg bg-slate-200" />

          {/* CTA skeleton buttons */}
          <div className="mb-12 flex justify-center gap-3">
            <div className="h-11 w-36 rounded-xl bg-slate-300" />
            <div className="h-11 w-32 rounded-xl bg-slate-200" />
          </div>

          {/* Media placeholder skeleton */}
          <div className="mx-auto mb-16 h-72 max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-slate-300">
              <div className="h-12 w-12 rounded-full bg-slate-100" />
              <div className="h-3 w-24 rounded bg-slate-100" />
            </div>
          </div>

          {/* Features grid skeleton */}
          <div className="grid gap-6 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm">
                <div className="mb-4 h-10 w-10 rounded-xl bg-slate-200" />
                <div className="mb-2 h-5 w-3/4 rounded bg-slate-300" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-full rounded bg-slate-100" />
                  <div className="h-3.5 w-5/6 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div className="max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <Search className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Page Not Found</h2>
          <p className="text-slate-600 text-sm">
            This landing page does not exist or has been unpublished.
          </p>
        </div>
      </div>
    );
  }

  // Check validity window
  const now = new Date();
  const validFrom = page.content.valid_from ? new Date(page.content.valid_from) : null;
  const validUntil = page.content.valid_until ? new Date(page.content.valid_until) : null;
  const isScheduled = validFrom && !isNaN(validFrom.getTime()) && now < validFrom;
  const isExpired = validUntil && !isNaN(validUntil.getTime()) && now > validUntil;

  // Custom Fallback Rendering when page is inactive
  if (isScheduled || isExpired) {
    const fallback = page.content.fallback;

    // 1. Custom Redirect Fallback
    if (fallback?.type === 'redirect' && fallback.redirectUrl) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
          <div className="max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Redirecting...</h2>
            <p className="text-slate-500 text-sm">
              Please wait while we redirect you to{' '}
              <a href={fallback.redirectUrl} className="text-brand-600 underline font-medium">
                {fallback.redirectUrl}
              </a>
            </p>
          </div>
        </div>
      );
    }

    // 2. Custom HTML Fallback
    if (fallback?.type === 'custom_html' && fallback.customHtml) {
      return (
        <div
          className="min-h-screen"
          dangerouslySetInnerHTML={{ __html: fallback.customHtml }}
        />
      );
    }

    // 3. Custom Message Fallback
    if (fallback?.type === 'message' && (fallback.title || fallback.message)) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
          <div className="max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              {isScheduled ? <Clock className="h-7 w-7" /> : <CalendarX className="h-7 w-7" />}
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              {fallback.title || (isScheduled ? 'Page Not Yet Available' : 'Campaign Ended')}
            </h2>
            <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">
              {fallback.message}
            </p>
          </div>
        </div>
      );
    }

    // 4. Default Friendly Fallback Card
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div className="max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            {isScheduled ? <Clock className="h-7 w-7" /> : <CalendarX className="h-7 w-7" />}
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {isScheduled ? 'Page Not Yet Available' : 'Campaign Ended'}
          </h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            {isScheduled ? (
              <>
                This landing page is scheduled to go live on{' '}
                <strong className="text-slate-800">
                  {validFrom?.toLocaleString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </strong>
                . Please check back then!
              </>
            ) : (
              <>
                This landing page expired on{' '}
                <strong className="text-slate-800">
                  {validUntil?.toLocaleString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </strong>
                . Thank you for your interest!
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <LandingPageRenderer page={page} tenantId={page.tenant_id} environment={page.environment} />
    </div>
  );
}
