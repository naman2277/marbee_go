/**
 * Email Studio — Prebuilt Module Library
 * -------------------------------------------------------------
 * A single source of truth for every "module" that can be dropped
 * onto the visual canvas from the Left Modules Drawer.
 *
 * Each module is described once, here, as:
 *   - a small on-screen preview (Tailwind is fine — preview only)
 *   - a `build()` that returns one or more `EmailBlock`s which the
 *     canvas already knows how to render + export to HTML.
 *
 * Most modules are a single `text` block whose `content.text` is an
 * inline-styled HTML string (same approach the canvas uses for the
 * header bar), which keeps them editable on-canvas and export-safe.
 */
import type { ReactNode } from 'react';
import {
  AlignLeft,
  Award,
  BadgePercent,
  CalendarClock,
  Columns,
  Gamepad2,
  LayoutList,
  ListChecks,
  Minus,
  PanelTop,
  Quote,
  ShoppingBag,
  Sparkles,
  Star,
  Table2,
  Timer,
  TrendingUp,
} from 'lucide-react';
import type { EmailBlock } from '@/lib/email-builder-types';

export type EmailModuleDef = {
  id: string;
  name: string;
  tags: string[];
  /** Small visual thumbnail rendered inside the drawer card. */
  preview: ReactNode;
  /** Returns the block(s) appended to the canvas when inserted. */
  build: () => EmailBlock[];
};

export type EmailModuleCategory = {
  id: string;
  name: string;
  icon: typeof Sparkles;
  blurb: string;
  modules: EmailModuleDef[];
};

/* ------------------------------------------------------------------ *
 * Block factories
 * ------------------------------------------------------------------ */

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

type LooseStyles = Record<string, unknown>;

/** Rich-HTML text block (editable on canvas, exports cleanly). */
const t = (html: string, styles: LooseStyles = {}): EmailBlock => ({
  id: uid('mod'),
  type: 'text',
  content: { text: html.replace(/\s+/g, ' ').trim() },
  styles: {
    padding_top: 20,
    padding_bottom: 20,
    padding_left: 28,
    padding_right: 28,
    ...styles,
  } as EmailBlock['styles'],
});

/** Raw HTML block — for markup we never want the inline editor to touch. */
const h = (code: string, styles: LooseStyles = {}): EmailBlock => ({
  id: uid('html'),
  type: 'html',
  content: { code: code.replace(/\s+/g, ' ').trim() },
  styles: {
    padding_top: 16,
    padding_bottom: 16,
    padding_left: 24,
    padding_right: 24,
    ...styles,
  } as EmailBlock['styles'],
});

const button = (text: string, url = 'https://', styles: LooseStyles = {}): EmailBlock => ({
  id: uid('btn'),
  type: 'button',
  content: { text, url },
  styles: {
    bg_color: '#6d28d9',
    text_color: '#ffffff',
    border_radius: 10,
    alignment: 'center',
    padding_top: 14,
    padding_bottom: 22,
    padding_left: 28,
    padding_right: 28,
    ...styles,
  } as EmailBlock['styles'],
});

const divider = (styles: LooseStyles = {}): EmailBlock => ({
  id: uid('div'),
  type: 'divider',
  content: {},
  styles: {
    border_color: '#e2e8f0',
    border_width: 1,
    padding_top: 18,
    padding_bottom: 18,
    padding_left: 28,
    padding_right: 28,
    ...styles,
  } as EmailBlock['styles'],
});

const spacer = (height = 28): EmailBlock => ({
  id: uid('spc'),
  type: 'spacer',
  content: { height },
  styles: { padding_top: 0, padding_bottom: 0 } as EmailBlock['styles'],
});

/* Shared design tokens for the HTML strings */
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = '#0f172a';
const MUTE = '#64748b';
const LINE = '#e2e8f0';
const BRAND = '#6d28d9';

/* ------------------------------------------------------------------ *
 * Tiny preview helpers (drawer only)
 * ------------------------------------------------------------------ */

const P = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`w-full rounded-lg bg-white p-2.5 ${className}`}>{children}</div>
);
const Bar = ({ w = 'w-full', c = 'bg-slate-200', h = 'h-2' }: { w?: string; c?: string; h?: string }) => (
  <div className={`${w} ${c} ${h} rounded`} />
);
const Pill = ({ c = 'bg-violet-600' }: { c?: string }) => (
  <div className={`h-4 w-16 rounded-full ${c}`} />
);

/* ================================================================== *
 * PREHEADERS, HEADERS & NAVIGATION
 * ================================================================== */

const headerModules: EmailModuleDef[] = [
  {
    id: 'hdr-announce-bar',
    name: 'Announcement bar',
    tags: ['preheader', 'promo', 'bar'],
    preview: (
      <P className="bg-violet-600">
        <div className="text-center text-[8px] font-bold uppercase tracking-wider text-white">
          Free shipping on orders over $50
        </div>
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">
          Free shipping on orders over $50 &nbsp;·&nbsp; <a href="https://" style="color:#ffffff;text-decoration:underline;">Shop now</a>
        </div>`,
        { bg_color: BRAND, padding_top: 12, padding_bottom: 12 },
      ),
    ],
  },
  {
    id: 'hdr-logo-center',
    name: 'Centered logo',
    tags: ['logo', 'brand', 'minimal'],
    preview: (
      <P>
        <div className="flex justify-center">
          <div className="text-[10px] font-black tracking-tight text-slate-900">◆ YourBrand</div>
        </div>
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;color:${INK};font-size:20px;font-weight:800;letter-spacing:-.02em;">
          <span style="color:${BRAND};">◆</span> YourBrand
        </div>`,
        { bg_color: '#ffffff', padding_top: 26, padding_bottom: 22 },
      ),
    ],
  },
  {
    id: 'hdr-logo-nav',
    name: 'Logo + navigation',
    tags: ['nav', 'menu', 'links'],
    preview: (
      <P>
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-black text-slate-900">◆ Brand</div>
          <div className="flex gap-1.5">
            <Bar w="w-6" h="h-1.5" />
            <Bar w="w-6" h="h-1.5" />
            <Bar w="w-6" h="h-1.5" />
          </div>
        </div>
      </P>
    ),
    build: () => [
      t(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;">
          <tr>
            <td style="font-size:18px;font-weight:800;color:${INK};"><span style="color:${BRAND};">◆</span> YourBrand</td>
            <td align="right" style="font-size:13px;font-weight:600;color:${MUTE};">
              <a href="https://" style="color:${MUTE};text-decoration:none;margin-left:16px;">Shop</a>
              <a href="https://" style="color:${MUTE};text-decoration:none;margin-left:16px;">About</a>
              <a href="https://" style="color:${MUTE};text-decoration:none;margin-left:16px;">Contact</a>
            </td>
          </tr>
        </table>`,
        { bg_color: '#ffffff', padding_top: 22, padding_bottom: 22 },
      ),
    ],
  },
  {
    id: 'hdr-preheader-browser',
    name: 'View in browser',
    tags: ['preheader', 'utility'],
    preview: (
      <P>
        <div className="text-center text-[8px] text-slate-400">
          Can’t see this email? <span className="text-violet-600 underline">Open in browser</span>
        </div>
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;font-size:11px;color:${MUTE};">
          Can't see this email properly?
          <a href="{{view_in_browser}}" style="color:${BRAND};text-decoration:underline;">View it in your browser</a>
        </div>`,
        { bg_color: '#f8fafc', padding_top: 10, padding_bottom: 10 },
      ),
    ],
  },
  {
    id: 'hdr-hero-heading',
    name: 'Hero heading + intro',
    tags: ['hero', 'headline', 'intro'],
    preview: (
      <P className="space-y-1.5">
        <Bar w="w-3/4" h="h-3" c="bg-slate-800" />
        <Bar w="w-full" />
        <Bar w="w-2/3" />
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};color:${INK};font-size:30px;line-height:1.2;font-weight:800;letter-spacing:-.02em;">
          A headline that earns the open
        </div>`,
        { bg_color: '#ffffff', padding_top: 28, padding_bottom: 8 },
      ),
      t(
        `<div style="font-family:${FONT};color:${MUTE};font-size:15px;line-height:1.65;">
          Follow it with one or two sentences of context so readers know exactly why this landed in their inbox.
        </div>`,
        { bg_color: '#ffffff', padding_top: 0, padding_bottom: 24 },
      ),
    ],
  },
  {
    id: 'hdr-icon-brand',
    name: 'Icon tile + brand',
    tags: ['logo', 'icon', 'centered'],
    preview: (
      <P>
        <div className="flex flex-col items-center gap-1">
          <div className="h-6 w-6 rounded-lg bg-violet-600" />
          <Bar w="w-14" h="h-1.5" />
        </div>
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;">
          <span style="display:inline-block;width:44px;height:44px;line-height:44px;border-radius:12px;background:${BRAND};color:#fff;font-size:20px;font-weight:800;">◆</span>
          <div style="margin-top:10px;font-size:15px;font-weight:700;color:${INK};">YourBrand</div>
        </div>`,
        { bg_color: '#ffffff', padding_top: 24, padding_bottom: 20 },
      ),
    ],
  },
];

/* ================================================================== *
 * LISTS
 * ================================================================== */

const listModules: EmailModuleDef[] = [
  {
    id: 'list-check-benefits',
    name: 'Checklist of benefits',
    tags: ['checklist', 'features', 'bullets'],
    preview: (
      <P className="space-y-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <Bar w="w-3/4" h="h-1.5" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      t(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;color:${INK};font-size:14px;line-height:1.6;">
          ${['Priority support, 24/7', 'Unlimited team members', 'Advanced analytics dashboard']
            .map(
              (item) => `<tr>
                <td width="26" valign="top" style="color:#059669;font-weight:800;">✓</td>
                <td style="padding-bottom:10px;">${item}</td>
              </tr>`,
            )
            .join('')}
        </table>`,
      ),
    ],
  },
  {
    id: 'list-numbered-steps',
    name: 'Numbered steps',
    tags: ['steps', 'how-it-works', 'onboarding'],
    preview: (
      <P className="space-y-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-violet-600 text-[7px] font-bold text-white">
              {i}
            </div>
            <Bar w="w-2/3" h="h-1.5" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      t(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;color:${INK};">
          ${[
            ['Create your account', 'Takes less than a minute — no card required.'],
            ['Connect your data', 'Import a CSV or plug in a source in a few clicks.'],
            ['Launch your first journey', 'Pick a template and hit send.'],
          ]
            .map(
              ([title, body], i) => `<tr>
                <td width="40" valign="top" style="padding-bottom:16px;">
                  <span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:${BRAND};color:#fff;font-size:13px;font-weight:700;">${i + 1}</span>
                </td>
                <td style="padding-bottom:16px;">
                  <div style="font-size:15px;font-weight:700;">${title}</div>
                  <div style="font-size:13px;color:${MUTE};line-height:1.6;">${body}</div>
                </td>
              </tr>`,
            )
            .join('')}
        </table>`,
      ),
    ],
  },
  {
    id: 'list-icon-feature-rows',
    name: 'Icon feature rows',
    tags: ['features', 'icons', 'rows'],
    preview: (
      <P className="space-y-1.5">
        {['🚀', '🔒', '📈'].map((e, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-[10px]">{e}</span>
            <Bar w="w-3/4" h="h-1.5" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      t(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;color:${INK};">
          ${[
            ['🚀', 'Ship faster', 'Prebuilt modules cut build time in half.'],
            ['🔒', 'Secure by default', 'SOC 2 Type II, SSO, and granular roles.'],
            ['📈', 'Measurable impact', 'Every send is tracked end-to-end.'],
          ]
            .map(
              ([icon, title, body]) => `<tr>
                <td width="40" valign="top" style="font-size:20px;padding-bottom:16px;">${icon}</td>
                <td style="padding-bottom:16px;">
                  <div style="font-size:15px;font-weight:700;">${title}</div>
                  <div style="font-size:13px;color:${MUTE};line-height:1.6;">${body}</div>
                </td>
              </tr>`,
            )
            .join('')}
        </table>`,
      ),
    ],
  },
  {
    id: 'list-bullets-simple',
    name: 'Simple bullet list',
    tags: ['bullets', 'plain'],
    preview: (
      <P className="space-y-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="h-1 w-1 rounded-full bg-slate-500" />
            <Bar w="w-2/3" h="h-1.5" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      {
        id: uid('list'),
        type: 'list',
        content: {
          list_type: 'bullet',
          items: [
            'Everything in the Starter plan',
            'Up to 25,000 contacts',
            'A/B testing and send-time optimization',
            'Priority email + chat support',
          ],
        },
        styles: {
          font_size: 14,
          line_height: 1.7,
          text_color: INK,
          padding_top: 12,
          padding_bottom: 12,
          padding_left: 28,
          padding_right: 28,
        } as EmailBlock['styles'],
      },
    ],
  },
  {
    id: 'list-two-col-checks',
    name: 'Two-column checklist',
    tags: ['checklist', 'compare', 'grid'],
    preview: (
      <P className="grid grid-cols-2 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <Bar w="w-full" h="h-1.5" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      t(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;color:${INK};font-size:13px;">
          <tr>
            ${[
              ['Drag-and-drop builder', 'Reusable content blocks'],
              ['Segmentation engine', 'Deliverability tools'],
            ]
              .map(
                (col) => `<td width="50%" valign="top" style="padding:4px 12px 4px 0;">
                  ${col
                    .map(
                      (item) =>
                        `<div style="padding:6px 0;"><span style="color:#059669;font-weight:800;">✓</span>&nbsp; ${item}</div>`,
                    )
                    .join('')}
                </td>`,
              )
              .join('')}
          </tr>
        </table>`,
      ),
    ],
  },
];

/* ================================================================== *
 * WEBINARS
 * ================================================================== */

const webinarModules: EmailModuleDef[] = [
  {
    id: 'web-invite-card',
    name: 'Webinar invite card',
    tags: ['webinar', 'event', 'invite'],
    preview: (
      <P className="space-y-1.5 border border-slate-200">
        <Pill c="bg-violet-100" />
        <Bar w="w-3/4" h="h-2.5" c="bg-slate-800" />
        <Bar w="w-1/2" h="h-1.5" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};border:1px solid ${LINE};border-radius:16px;padding:28px;">
          <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${BRAND};background:#f3e8ff;padding:4px 10px;border-radius:999px;">Live webinar</span>
          <h2 style="margin:14px 0 6px;font-size:22px;font-weight:800;color:${INK};line-height:1.25;">Scaling lifecycle marketing without scaling headcount</h2>
          <p style="margin:0;font-size:14px;color:${MUTE};line-height:1.6;">Thursday, May 8 · 11:00 AM PT · 45 min + live Q&amp;A</p>
        </div>`,
      ),
      button('Save my seat'),
    ],
  },
  {
    id: 'web-speakers',
    name: 'Speaker line-up',
    tags: ['speakers', 'people', 'webinar'],
    preview: (
      <P className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="h-6 w-6 rounded-full bg-slate-200" />
            <Bar w="w-full" h="h-1" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      t(`<div style="font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MUTE};">Speakers</div>`, {
        padding_bottom: 8,
      }),
      h(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;text-align:center;">
          <tr>
            ${[
              ['Ava Reyes', 'VP Marketing, Northwind'],
              ['Liam Chen', 'Head of CRM, Acme'],
              ['Priya Nair', 'Founder, Loop'],
            ]
              .map(
                ([name, role]) => `<td width="33%" valign="top" style="padding:8px;">
                  <div style="width:56px;height:56px;border-radius:50%;background:#ede9fe;margin:0 auto 8px;"></div>
                  <div style="font-size:13px;font-weight:700;color:${INK};">${name}</div>
                  <div style="font-size:11px;color:${MUTE};line-height:1.5;">${role}</div>
                </td>`,
              )
              .join('')}
          </tr>
        </table>`,
      ),
    ],
  },
  {
    id: 'web-agenda',
    name: 'Session agenda',
    tags: ['agenda', 'schedule', 'webinar'],
    preview: (
      <P className="space-y-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-2">
            <Bar w="w-8" h="h-1.5" c="bg-violet-300" />
            <Bar w="w-2/3" h="h-1.5" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      t(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;color:${INK};font-size:14px;">
          ${[
            ['00:00', 'Why most lifecycle programs stall'],
            ['12:00', 'The 4 automations that compound'],
            ['28:00', 'Live teardown of a subscriber journey'],
            ['38:00', 'Q&A'],
          ]
            .map(
              ([time, label]) => `<tr>
                <td width="70" valign="top" style="padding-bottom:12px;color:${BRAND};font-weight:700;font-variant-numeric:tabular-nums;">${time}</td>
                <td style="padding-bottom:12px;">${label}</td>
              </tr>`,
            )
            .join('')}
        </table>`,
      ),
    ],
  },
  {
    id: 'web-countdown-strip',
    name: 'Starts-in strip',
    tags: ['countdown', 'urgency', 'webinar'],
    preview: (
      <P className="bg-slate-900">
        <div className="text-center text-[8px] font-bold uppercase tracking-wider text-white">Starts in 2 days</div>
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;color:#fff;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">
          ⏳ Starts in 2 days — <a href="https://" style="color:#fff;text-decoration:underline;">add to calendar</a>
        </div>`,
        { bg_color: '#0f172a', padding_top: 14, padding_bottom: 14 },
      ),
    ],
  },
  {
    id: 'web-replay',
    name: 'On-demand replay',
    tags: ['replay', 'recording', 'vod'],
    preview: (
      <P className="flex items-center justify-center border border-slate-200 bg-slate-900/90">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[9px]">▶</div>
      </P>
    ),
    build: () => [
      {
        id: uid('vid'),
        type: 'video',
        content: {
          video_url: 'https://',
          thumbnail_url:
            'https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=900&auto=format&fit=crop&q=80',
          title: 'Watch the full recording (45 min)',
        },
        styles: {
          alignment: 'center',
          padding_top: 16,
          padding_bottom: 16,
          padding_left: 28,
          padding_right: 28,
        } as EmailBlock['styles'],
      },
    ],
  },
];

/* ================================================================== *
 * FOOTERS & SOCIALS
 * ================================================================== */

const footerModules: EmailModuleDef[] = [
  {
    id: 'ftr-standard',
    name: 'Standard footer',
    tags: ['footer', 'legal', 'unsubscribe'],
    preview: (
      <P className="space-y-1 text-center">
        <Bar w="w-1/2" h="h-1.5" c="bg-slate-300" />
        <Bar w="w-2/3" h="h-1" c="bg-slate-200" />
      </P>
    ),
    build: () => [
      divider({ padding_bottom: 8 }),
      t(
        `<div style="font-family:${FONT};text-align:center;color:${MUTE};font-size:12px;line-height:1.7;">
          <strong style="color:${INK};">YourBrand, Inc.</strong><br/>
          450 Market Street, Suite 300, San Francisco, CA 94105<br/>
          <a href="{{unsubscribe_url}}" style="color:${MUTE};text-decoration:underline;">Unsubscribe</a> ·
          <a href="{{preferences_url}}" style="color:${MUTE};text-decoration:underline;">Email preferences</a>
        </div>`,
        { padding_top: 8 },
      ),
    ],
  },
  {
    id: 'ftr-social-row',
    name: 'Social icon row',
    tags: ['social', 'icons', 'links'],
    preview: (
      <P className="flex justify-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-4 w-4 rounded-full bg-slate-200" />
        ))}
      </P>
    ),
    build: () => [
      {
        id: uid('soc'),
        type: 'social',
        content: {
          links: [
            { platform: 'Twitter / X', url: 'https://twitter.com' },
            { platform: 'LinkedIn', url: 'https://linkedin.com' },
            { platform: 'Instagram', url: 'https://instagram.com' },
            { platform: 'YouTube', url: 'https://youtube.com' },
          ],
        },
        styles: {
          alignment: 'center',
          padding_top: 16,
          padding_bottom: 16,
          padding_left: 28,
          padding_right: 28,
        } as EmailBlock['styles'],
      },
    ],
  },
  {
    id: 'ftr-app-badges',
    name: 'App store badges',
    tags: ['app', 'download', 'mobile'],
    preview: (
      <P className="flex justify-center gap-2">
        <div className="h-5 w-16 rounded-md bg-slate-900" />
        <div className="h-5 w-16 rounded-md bg-slate-900" />
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;">
          <a href="https://" style="display:inline-block;margin:4px;padding:10px 18px;border-radius:10px;background:${INK};color:#fff;font-size:12px;font-weight:700;text-decoration:none;"> App Store</a>
          <a href="https://" style="display:inline-block;margin:4px;padding:10px 18px;border-radius:10px;background:${INK};color:#fff;font-size:12px;font-weight:700;text-decoration:none;">▶ Google Play</a>
        </div>`,
      ),
    ],
  },
  {
    id: 'ftr-address-compact',
    name: 'Compact address line',
    tags: ['footer', 'minimal', 'address'],
    preview: (
      <P className="text-center">
        <Bar w="w-3/4" h="h-1" c="bg-slate-200" />
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;color:${MUTE};font-size:11px;line-height:1.6;">
          © ${new Date().getFullYear()} YourBrand · 450 Market St, San Francisco, CA · <a href="{{unsubscribe_url}}" style="color:${MUTE};text-decoration:underline;">Unsubscribe</a>
        </div>`,
        { padding_top: 12, padding_bottom: 12 },
      ),
    ],
  },
  {
    id: 'ftr-cta-plus-legal',
    name: 'Help CTA + legal',
    tags: ['footer', 'support', 'cta'],
    preview: (
      <P className="space-y-1.5 text-center">
        <Bar w="w-1/2" h="h-2" c="bg-slate-800" />
        <div className="mx-auto h-4 w-16 rounded-full border border-slate-300" />
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;">
          <div style="font-size:15px;font-weight:700;color:${INK};">Questions? We're here to help.</div>
          <a href="https://" style="display:inline-block;margin-top:10px;padding:9px 18px;border:1px solid ${LINE};border-radius:999px;color:${INK};font-size:13px;font-weight:600;text-decoration:none;">Contact support</a>
        </div>`,
      ),
      t(
        `<div style="font-family:${FONT};text-align:center;color:${MUTE};font-size:11px;line-height:1.7;">
          You're receiving this because you have an account with YourBrand.<br/>
          <a href="{{unsubscribe_url}}" style="color:${MUTE};text-decoration:underline;">Unsubscribe</a> ·
          <a href="{{preferences_url}}" style="color:${MUTE};text-decoration:underline;">Manage preferences</a>
        </div>`,
        { padding_top: 6 },
      ),
    ],
  },
];

/* ================================================================== *
 * CONTENT CANVASES / BLOG POSTS
 * ================================================================== */

const contentModules: EmailModuleDef[] = [
  {
    id: 'cnt-article-teaser',
    name: 'Article teaser',
    tags: ['blog', 'article', 'teaser'],
    preview: (
      <P className="space-y-1.5">
        <div className="h-8 w-full rounded-md bg-slate-200" />
        <Bar w="w-3/4" h="h-2" c="bg-slate-800" />
        <Bar w="w-full" h="h-1.5" />
      </P>
    ),
    build: () => [
      {
        id: uid('img'),
        type: 'image',
        content: {
          url: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1000&auto=format&fit=crop&q=80',
          alt: 'Article cover',
        },
        styles: {
          border_radius: 14,
          alignment: 'center',
          padding_top: 16,
          padding_bottom: 12,
          padding_left: 28,
          padding_right: 28,
        } as EmailBlock['styles'],
      },
      t(
        `<div style="font-family:${FONT};color:${INK};font-size:20px;font-weight:800;line-height:1.3;">The playbook we used to double activation</div>`,
        { padding_top: 4, padding_bottom: 6 },
      ),
      t(
        `<div style="font-family:${FONT};color:${MUTE};font-size:14px;line-height:1.65;">A behind-the-scenes look at the experiments that moved the needle — and the ones that didn't.</div>`,
        { padding_top: 0, padding_bottom: 10 },
      ),
      t(
        `<a href="https://" style="font-family:${FONT};color:${BRAND};font-size:14px;font-weight:700;text-decoration:none;">Read the article →</a>`,
        { padding_top: 0, padding_bottom: 20 },
      ),
    ],
  },
  {
    id: 'cnt-image-left-text',
    name: 'Image left, text right',
    tags: ['split', 'two-column', 'feature'],
    preview: (
      <P className="flex gap-2">
        <div className="h-10 w-10 shrink-0 rounded-md bg-slate-200" />
        <div className="flex-1 space-y-1">
          <Bar w="w-3/4" h="h-2" c="bg-slate-800" />
          <Bar w="w-full" h="h-1.5" />
          <Bar w="w-2/3" h="h-1.5" />
        </div>
      </P>
    ),
    build: () => [
      h(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;">
          <tr>
            <td width="40%" valign="top" style="padding-right:16px;">
              <img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&auto=format&fit=crop&q=80" alt="" width="100%" style="border-radius:12px;display:block;" />
            </td>
            <td valign="top">
              <div style="font-size:17px;font-weight:800;color:${INK};line-height:1.3;">Built for teams that move fast</div>
              <div style="margin-top:6px;font-size:13px;color:${MUTE};line-height:1.6;">Swap in your own image and copy. Great for feature highlights and case studies.</div>
              <a href="https://" style="display:inline-block;margin-top:10px;font-size:13px;font-weight:700;color:${BRAND};text-decoration:none;">Learn more →</a>
            </td>
          </tr>
        </table>`,
      ),
    ],
  },
  {
    id: 'cnt-pull-quote',
    name: 'Pull quote',
    tags: ['quote', 'highlight', 'editorial'],
    preview: (
      <P className="border-l-2 border-violet-500 pl-2">
        <Bar w="w-full" h="h-1.5" />
        <Bar w="w-2/3" h="h-1.5" />
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};border-left:3px solid ${BRAND};padding:4px 0 4px 18px;color:${INK};font-size:19px;line-height:1.5;font-weight:600;font-style:italic;">
          "The difference was obvious within the first week — our team stopped rebuilding the same email twice."
        </div>`,
      ),
    ],
  },
  {
    id: 'cnt-callout-box',
    name: 'Callout box',
    tags: ['callout', 'note', 'tip'],
    preview: (
      <P className="bg-violet-50">
        <Bar w="w-1/3" h="h-1.5" c="bg-violet-400" />
        <Bar w="w-full" h="h-1.5" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};background:#f5f3ff;border:1px solid #ede9fe;border-radius:12px;padding:18px 20px;">
          <div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${BRAND};">Pro tip</div>
          <div style="margin-top:6px;font-size:14px;color:${INK};line-height:1.6;">Use a callout to surface the single most important takeaway of the email.</div>
        </div>`,
      ),
    ],
  },
  {
    id: 'cnt-two-up-cards',
    name: 'Two-up cards',
    tags: ['cards', 'grid', 'links'],
    preview: (
      <P className="grid grid-cols-2 gap-1.5">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-1 rounded-md border border-slate-200 p-1.5">
            <div className="h-4 w-full rounded bg-slate-200" />
            <Bar w="w-3/4" h="h-1" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      h(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;">
          <tr>
            ${[
              ['https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=600&auto=format&fit=crop&q=80', 'Guide', 'The onboarding checklist'],
              ['https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&auto=format&fit=crop&q=80', 'Story', 'How Acme cut CAC by 30%'],
            ]
              .map(
                ([img, tag, title]) => `<td width="50%" valign="top" style="padding:6px;">
                  <div style="border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
                    <img src="${img}" alt="" width="100%" style="display:block;height:96px;object-fit:cover;" />
                    <div style="padding:12px;">
                      <div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${BRAND};">${tag}</div>
                      <div style="margin-top:4px;font-size:13px;font-weight:700;color:${INK};line-height:1.4;">${title}</div>
                    </div>
                  </div>
                </td>`,
              )
              .join('')}
          </tr>
        </table>`,
      ),
    ],
  },
  {
    id: 'cnt-cta-band',
    name: 'CTA band',
    tags: ['cta', 'banner', 'conversion'],
    preview: (
      <P className="bg-slate-900 text-center">
        <Bar w="w-2/3 mx-auto" h="h-2" c="bg-white/80" />
        <div className="mx-auto mt-1 h-3 w-14 rounded-full bg-violet-500" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};background:${INK};border-radius:16px;padding:28px 24px;text-align:center;">
          <div style="font-size:19px;font-weight:800;color:#fff;line-height:1.35;">Ready to see it in action?</div>
          <div style="margin-top:6px;font-size:13px;color:#cbd5e1;">Book a 20-minute walkthrough with our team.</div>
        </div>`,
        { padding_top: 12, padding_bottom: 4 },
      ),
      button('Book a demo', 'https://', { padding_top: 12 }),
    ],
  },
];

/* ================================================================== *
 * BANNERS
 * ================================================================== */

const bannerModules: EmailModuleDef[] = [
  {
    id: 'ban-gradient-hero',
    name: 'Gradient hero banner',
    tags: ['hero', 'gradient', 'announcement'],
    preview: (
      <P className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-center">
        <Bar w="w-2/3 mx-auto" h="h-2.5" c="bg-white/80" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};background:linear-gradient(135deg,#7c3aed,#db2777);border-radius:18px;padding:40px 28px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:#fff;line-height:1.25;">Spring release is here</div>
          <div style="margin-top:8px;font-size:14px;color:#f5d0fe;">Faster builder, new modules, and a fresh set of themes.</div>
        </div>`,
      ),
    ],
  },
  {
    id: 'ban-image-overlay',
    name: 'Image with text overlay',
    tags: ['image', 'overlay', 'hero'],
    preview: (
      <P className="relative overflow-hidden">
        <div className="h-10 w-full rounded bg-slate-300" />
        <div className="absolute inset-x-2 bottom-2">
          <Bar w="w-2/3" h="h-2" c="bg-white" />
        </div>
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};position:relative;border-radius:18px;overflow:hidden;">
          <img src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80" alt="" width="100%" style="display:block;" />
          <div style="position:absolute;left:0;right:0;bottom:0;padding:24px;background:linear-gradient(transparent,rgba(15,23,42,.8));">
            <div style="font-size:22px;font-weight:800;color:#fff;">The summer collection</div>
            <div style="font-size:13px;color:#e2e8f0;">Now shipping worldwide</div>
          </div>
        </div>`,
      ),
    ],
  },
  {
    id: 'ban-solid-cta',
    name: 'Solid color CTA banner',
    tags: ['cta', 'flat', 'promo'],
    preview: (
      <P className="bg-violet-600 text-center">
        <Bar w="w-1/2 mx-auto" h="h-2" c="bg-white/80" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};background:${BRAND};border-radius:16px;padding:26px;text-align:center;">
          <div style="font-size:18px;font-weight:800;color:#fff;">Your trial ends in 3 days</div>
          <a href="https://" style="display:inline-block;margin-top:12px;padding:10px 22px;border-radius:999px;background:#fff;color:${BRAND};font-size:13px;font-weight:800;text-decoration:none;">Upgrade now</a>
        </div>`,
      ),
    ],
  },
  {
    id: 'ban-thin-strip',
    name: 'Thin promo strip',
    tags: ['strip', 'bar', 'minimal'],
    preview: (
      <P className="bg-amber-400 text-center">
        <Bar w="w-3/4 mx-auto" h="h-1.5" c="bg-slate-900/70" />
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;color:${INK};font-size:13px;font-weight:700;">
          🎉 New: send-time optimization is now live for all plans
        </div>`,
        { bg_color: '#fbbf24', padding_top: 12, padding_bottom: 12, border_radius: 10 },
      ),
    ],
  },
  {
    id: 'ban-split-color',
    name: 'Split color banner',
    tags: ['split', 'duotone', 'feature'],
    preview: (
      <P className="flex overflow-hidden">
        <div className="h-8 flex-1 bg-slate-900" />
        <div className="h-8 flex-1 bg-violet-500" />
      </P>
    ),
    build: () => [
      h(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;border-radius:16px;overflow:hidden;">
          <tr>
            <td width="55%" style="background:${INK};padding:26px;">
              <div style="font-size:18px;font-weight:800;color:#fff;line-height:1.3;">Two ideas,<br/>one banner</div>
            </td>
            <td style="background:${BRAND};padding:26px;color:#fff;font-size:13px;line-height:1.6;">
              Use the dark side for the headline and the accent side for a short supporting line.
            </td>
          </tr>
        </table>`,
      ),
    ],
  },
];

/* ================================================================== *
 * DIVIDERS
 * ================================================================== */

const dividerModules: EmailModuleDef[] = [
  {
    id: 'dvd-hairline',
    name: 'Hairline rule',
    tags: ['divider', 'line', 'minimal'],
    preview: (
      <P>
        <div className="h-px w-full bg-slate-300" />
      </P>
    ),
    build: () => [divider({ border_color: LINE, border_width: 1 })],
  },
  {
    id: 'dvd-thick',
    name: 'Bold rule',
    tags: ['divider', 'bold'],
    preview: (
      <P>
        <div className="h-1 w-full rounded bg-slate-800" />
      </P>
    ),
    build: () => [divider({ border_color: INK, border_width: 3, padding_top: 22, padding_bottom: 22 })],
  },
  {
    id: 'dvd-dot',
    name: 'Centered dot',
    tags: ['divider', 'ornament'],
    preview: (
      <P className="flex justify-center">
        <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      </P>
    ),
    build: () => [
      t(`<div style="font-family:${FONT};text-align:center;color:${LINE};font-size:20px;letter-spacing:.5em;">•••</div>`, {
        padding_top: 16,
        padding_bottom: 16,
      }),
    ],
  },
  {
    id: 'dvd-spacer',
    name: 'Blank spacer',
    tags: ['spacer', 'gap', 'whitespace'],
    preview: (
      <P className="flex items-center justify-center">
        <span className="text-[8px] font-mono text-slate-400">40px</span>
      </P>
    ),
    build: () => [spacer(40)],
  },
  {
    id: 'dvd-label',
    name: 'Labeled divider',
    tags: ['divider', 'label', 'section'],
    preview: (
      <P className="flex items-center gap-1.5">
        <div className="h-px flex-1 bg-slate-300" />
        <span className="text-[7px] font-bold uppercase text-slate-400">More</span>
        <div className="h-px flex-1 bg-slate-300" />
      </P>
    ),
    build: () => [
      h(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;">
          <tr>
            <td style="border-bottom:1px solid ${LINE};"></td>
            <td width="1" style="padding:0 12px;white-space:nowrap;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${MUTE};">More to explore</td>
            <td style="border-bottom:1px solid ${LINE};"></td>
          </tr>
        </table>`,
      ),
    ],
  },
];

/* ================================================================== *
 * PRICINGS & COMPARISONS
 * ================================================================== */

const pricingModules: EmailModuleDef[] = [
  {
    id: 'prc-single-plan',
    name: 'Single plan card',
    tags: ['pricing', 'plan', 'card'],
    preview: (
      <P className="space-y-1.5 border border-slate-200 text-center">
        <Bar w="w-1/3 mx-auto" h="h-1.5" c="bg-violet-300" />
        <Bar w="w-1/2 mx-auto" h="h-3" c="bg-slate-800" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};border:1px solid ${LINE};border-radius:16px;padding:28px;text-align:center;">
          <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${BRAND};">Growth</div>
          <div style="margin:8px 0;font-size:34px;font-weight:800;color:${INK};">$49<span style="font-size:14px;color:${MUTE};font-weight:600;">/mo</span></div>
          <div style="font-size:13px;color:${MUTE};line-height:1.7;">Up to 25,000 contacts<br/>Unlimited sends · A/B testing · Priority support</div>
        </div>`,
        { padding_top: 12, padding_bottom: 4 },
      ),
      button('Start free trial'),
    ],
  },
  {
    id: 'prc-two-plan',
    name: 'Two-plan comparison',
    tags: ['pricing', 'compare', 'grid'],
    preview: (
      <P className="grid grid-cols-2 gap-1.5">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-1 rounded-md border border-slate-200 p-1.5 text-center">
            <Bar w="w-1/2 mx-auto" h="h-1" />
            <Bar w="w-2/3 mx-auto" h="h-2" c="bg-slate-800" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      h(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;">
          <tr>
            ${[
              ['Starter', '$0', 'Up to 1,000 contacts', false],
              ['Growth', '$49', 'Up to 25,000 contacts', true],
            ]
              .map(
                ([name, price, note, hot]) => `<td width="50%" valign="top" style="padding:6px;">
                  <div style="border:1px solid ${hot ? BRAND : LINE};border-radius:14px;padding:20px;text-align:center;${hot ? 'box-shadow:0 8px 24px rgba(109,40,217,.12);' : ''}">
                    <div style="font-size:13px;font-weight:800;color:${INK};">${name}</div>
                    <div style="margin:6px 0;font-size:26px;font-weight:800;color:${INK};">${price}</div>
                    <div style="font-size:11px;color:${MUTE};line-height:1.6;">${note}</div>
                  </div>
                </td>`,
              )
              .join('')}
          </tr>
        </table>`,
      ),
    ],
  },
  {
    id: 'prc-feature-table',
    name: 'Feature comparison table',
    tags: ['table', 'compare', 'features'],
    preview: (
      <P className="space-y-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex justify-between">
            <Bar w="w-1/2" h="h-1.5" />
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      {
        id: uid('tbl'),
        type: 'table',
        content: {
          headers: ['Feature', 'Starter', 'Growth'],
          rows: [
            ['Contacts', '1,000', '25,000'],
            ['A/B testing', '—', '✓'],
            ['Send-time optimization', '—', '✓'],
            ['Priority support', '—', '✓'],
          ],
        },
        styles: {
          padding_top: 16,
          padding_bottom: 16,
          padding_left: 28,
          padding_right: 28,
          border_color: LINE,
        } as EmailBlock['styles'],
      },
    ],
  },
];

/* ================================================================== *
 * REVIEWS / TESTIMONIALS
 * ================================================================== */

const reviewModules: EmailModuleDef[] = [
  {
    id: 'rev-quote-card',
    name: 'Testimonial card',
    tags: ['review', 'quote', 'social-proof'],
    preview: (
      <P className="space-y-1.5 border border-slate-200">
        <div className="text-[8px] text-amber-500">★★★★★</div>
        <Bar w="w-full" h="h-1.5" />
        <Bar w="w-2/3" h="h-1.5" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};border:1px solid ${LINE};border-radius:16px;padding:24px;">
          <div style="color:#f59e0b;font-size:15px;letter-spacing:2px;">★★★★★</div>
          <div style="margin:10px 0;font-size:15px;color:${INK};line-height:1.6;">"We replaced three tools with this and shipped our first campaign the same afternoon."</div>
          <div style="font-size:12px;color:${MUTE};font-weight:600;">Jordan Blake · Head of Growth, Northwind</div>
        </div>`,
      ),
    ],
  },
  {
    id: 'rev-three-up',
    name: 'Three short quotes',
    tags: ['reviews', 'grid', 'proof'],
    preview: (
      <P className="grid grid-cols-3 gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1 rounded border border-slate-200 p-1">
            <div className="text-[6px] text-amber-500">★★★★★</div>
            <Bar w="w-full" h="h-1" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      h(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;">
          <tr>
            ${[
              ['"Set-up took an afternoon."', 'A. Rivera'],
              ['"Deliverability jumped 12%."', 'M. Cho'],
              ['"Our whole team actually uses it."', 'S. Patel'],
            ]
              .map(
                ([quote, name]) => `<td width="33%" valign="top" style="padding:6px;">
                  <div style="border:1px solid ${LINE};border-radius:12px;padding:14px;height:100%;">
                    <div style="color:#f59e0b;font-size:11px;">★★★★★</div>
                    <div style="margin:6px 0;font-size:12px;color:${INK};line-height:1.5;">${quote}</div>
                    <div style="font-size:10px;color:${MUTE};">${name}</div>
                  </div>
                </td>`,
              )
              .join('')}
          </tr>
        </table>`,
      ),
    ],
  },
  {
    id: 'rev-logos',
    name: 'Trusted-by logos',
    tags: ['logos', 'trust', 'brands'],
    preview: (
      <P className="flex items-center justify-around">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-2.5 w-8 rounded bg-slate-300" />
        ))}
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;color:${MUTE};font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">Trusted by teams at</div>`,
        { padding_bottom: 10 },
      ),
      t(
        `<div style="font-family:${FONT};text-align:center;color:${INK};font-size:15px;font-weight:800;opacity:.55;">
          Northwind &nbsp;&nbsp; Acme &nbsp;&nbsp; Loop &nbsp;&nbsp; Contoso &nbsp;&nbsp; Globex
        </div>`,
        { padding_top: 0 },
      ),
    ],
  },
  {
    id: 'rev-rating-summary',
    name: 'Rating summary',
    tags: ['rating', 'stars', 'aggregate'],
    preview: (
      <P className="flex items-center gap-2">
        <span className="text-sm font-black text-slate-900">4.9</span>
        <div className="text-[8px] text-amber-500">★★★★★</div>
      </P>
    ),
    build: () => [
      h(
        `<table role="presentation" style="font-family:${FONT};border-collapse:collapse;">
          <tr>
            <td style="font-size:40px;font-weight:800;color:${INK};padding-right:16px;">4.9</td>
            <td valign="middle">
              <div style="color:#f59e0b;font-size:18px;letter-spacing:2px;">★★★★★</div>
              <div style="font-size:12px;color:${MUTE};">Based on 2,300+ verified reviews</div>
            </td>
          </tr>
        </table>`,
      ),
    ],
  },
];

/* ================================================================== *
 * SIGNATURES
 * ================================================================== */

const signatureModules: EmailModuleDef[] = [
  {
    id: 'sig-personal',
    name: 'Personal sign-off',
    tags: ['signature', 'personal', 'founder'],
    preview: (
      <P className="space-y-1">
        <Bar w="w-1/3" h="h-1.5" />
        <Bar w="w-1/4" h="h-1" c="bg-slate-200" />
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};color:${INK};font-size:14px;line-height:1.7;">
          Thanks for reading,<br/>
          <strong>Sam Whitfield</strong><br/>
          <span style="color:${MUTE};font-size:13px;">Co-founder, YourBrand</span>
        </div>`,
      ),
    ],
  },
  {
    id: 'sig-card',
    name: 'Signature card w/ avatar',
    tags: ['signature', 'avatar', 'contact'],
    preview: (
      <P className="flex gap-2">
        <div className="h-8 w-8 rounded-full bg-slate-200" />
        <div className="flex-1 space-y-1">
          <Bar w="w-1/2" h="h-1.5" />
          <Bar w="w-2/3" h="h-1" c="bg-slate-200" />
        </div>
      </P>
    ),
    build: () => [
      h(
        `<table role="presentation" style="font-family:${FONT};border-collapse:collapse;">
          <tr>
            <td width="56" valign="top"><div style="width:48px;height:48px;border-radius:50%;background:#ede9fe;"></div></td>
            <td valign="top" style="padding-left:12px;">
              <div style="font-size:14px;font-weight:700;color:${INK};">Sam Whitfield</div>
              <div style="font-size:12px;color:${MUTE};">Co-founder · YourBrand</div>
              <div style="font-size:12px;margin-top:4px;"><a href="mailto:sam@yourbrand.com" style="color:${BRAND};text-decoration:none;">sam@yourbrand.com</a></div>
            </td>
          </tr>
        </table>`,
      ),
    ],
  },
  {
    id: 'sig-team',
    name: 'From the whole team',
    tags: ['signature', 'team'],
    preview: (
      <P className="text-center">
        <Bar w="w-1/2 mx-auto" h="h-1.5" />
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;color:${MUTE};font-size:13px;line-height:1.7;">
          With appreciation,<br/><strong style="color:${INK};">The YourBrand Team</strong>
        </div>`,
      ),
    ],
  },
];

/* ================================================================== *
 * PRODUCT CARDS
 * ================================================================== */

const productCardModules: EmailModuleDef[] = [
  {
    id: 'prd-single',
    name: 'Single product card',
    tags: ['product', 'ecommerce', 'card'],
    preview: (
      <P className="space-y-1.5 border border-slate-200">
        <div className="h-10 w-full rounded bg-slate-200" />
        <Bar w="w-3/4" h="h-1.5" />
        <Bar w="w-1/4" h="h-1.5" c="bg-slate-800" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};border:1px solid ${LINE};border-radius:16px;overflow:hidden;">
          <img src="https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80" alt="" width="100%" style="display:block;" />
          <div style="padding:18px;">
            <div style="font-size:15px;font-weight:700;color:${INK};">Everyday Carry Watch</div>
            <div style="margin-top:2px;font-size:13px;color:${MUTE};">Brushed steel · 40mm</div>
            <div style="margin-top:8px;font-size:16px;font-weight:800;color:${INK};">$189</div>
          </div>
        </div>`,
        { padding_top: 12, padding_bottom: 4 },
      ),
      button('Shop now'),
    ],
  },
  {
    id: 'prd-grid-2',
    name: 'Two product grid',
    tags: ['product', 'grid', 'shop'],
    preview: (
      <P className="grid grid-cols-2 gap-1.5">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-1 rounded border border-slate-200 p-1">
            <div className="h-6 w-full rounded bg-slate-200" />
            <Bar w="w-3/4" h="h-1" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      h(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;">
          <tr>
            ${[
              ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=80', 'Runner Low', '$120'],
              ['https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=600&auto=format&fit=crop&q=80', 'Trail Mid', '$150'],
            ]
              .map(
                ([img, name, price]) => `<td width="50%" valign="top" style="padding:6px;">
                  <div style="border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
                    <img src="${img}" alt="" width="100%" style="display:block;height:120px;object-fit:cover;" />
                    <div style="padding:12px;">
                      <div style="font-size:13px;font-weight:700;color:${INK};">${name}</div>
                      <div style="font-size:13px;font-weight:800;color:${INK};margin-top:2px;">${price}</div>
                      <a href="https://" style="display:inline-block;margin-top:8px;font-size:12px;font-weight:700;color:${BRAND};text-decoration:none;">View →</a>
                    </div>
                  </div>
                </td>`,
              )
              .join('')}
          </tr>
        </table>`,
      ),
    ],
  },
  {
    id: 'prd-horizontal',
    name: 'Horizontal product row',
    tags: ['product', 'row', 'list'],
    preview: (
      <P className="flex gap-2">
        <div className="h-9 w-9 shrink-0 rounded bg-slate-200" />
        <div className="flex-1 space-y-1">
          <Bar w="w-3/4" h="h-1.5" />
          <Bar w="w-1/4" h="h-1.5" c="bg-slate-800" />
        </div>
      </P>
    ),
    build: () => [
      h(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;border:1px solid ${LINE};border-radius:14px;">
          <tr>
            <td width="112" valign="top" style="padding:12px;">
              <img src="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&auto=format&fit=crop&q=80" alt="" width="88" style="border-radius:10px;display:block;" />
            </td>
            <td valign="middle" style="padding:12px 12px 12px 0;">
              <div style="font-size:14px;font-weight:700;color:${INK};">Studio Headphones</div>
              <div style="font-size:12px;color:${MUTE};">Over-ear · Noise-cancelling</div>
              <div style="margin-top:6px;font-size:14px;font-weight:800;color:${INK};">$229</div>
            </td>
            <td valign="middle" align="right" style="padding:12px;">
              <a href="https://" style="display:inline-block;padding:8px 16px;border-radius:999px;background:${BRAND};color:#fff;font-size:12px;font-weight:700;text-decoration:none;">Buy</a>
            </td>
          </tr>
        </table>`,
      ),
    ],
  },
  {
    id: 'prd-sale-badge',
    name: 'Product with sale badge',
    tags: ['product', 'sale', 'discount'],
    preview: (
      <P className="relative space-y-1.5 border border-slate-200">
        <div className="absolute right-1 top-1 rounded bg-rose-500 px-1 text-[6px] font-bold text-white">-30%</div>
        <div className="h-9 w-full rounded bg-slate-200" />
        <Bar w="w-1/2" h="h-1.5" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};position:relative;border:1px solid ${LINE};border-radius:16px;overflow:hidden;">
          <span style="position:absolute;top:12px;right:12px;background:#e11d48;color:#fff;font-size:11px;font-weight:800;padding:4px 8px;border-radius:8px;">−30%</span>
          <img src="https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=800&auto=format&fit=crop&q=80" alt="" width="100%" style="display:block;" />
          <div style="padding:18px;">
            <div style="font-size:15px;font-weight:700;color:${INK};">Canvas Sneakers</div>
            <div style="margin-top:6px;">
              <span style="font-size:16px;font-weight:800;color:${INK};">$56</span>
              <span style="font-size:13px;color:${MUTE};text-decoration:line-through;margin-left:6px;">$80</span>
            </div>
          </div>
        </div>`,
      ),
    ],
  },
  {
    id: 'prd-recommendation',
    name: 'You might also like',
    tags: ['product', 'cross-sell', 'recommend'],
    preview: (
      <P className="space-y-1.5">
        <Bar w="w-1/2" h="h-1.5" c="bg-slate-800" />
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-6 w-full rounded bg-slate-200" />
          ))}
        </div>
      </P>
    ),
    build: () => [
      t(`<div style="font-family:${FONT};font-size:16px;font-weight:800;color:${INK};">You might also like</div>`, {
        padding_bottom: 8,
      }),
      h(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;text-align:center;">
          <tr>
            ${[
              ['https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=400&auto=format&fit=crop&q=80', 'Ridge Tee', '$28'],
              ['https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&auto=format&fit=crop&q=80', 'Field Cap', '$24'],
              ['https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&auto=format&fit=crop&q=80', 'Day Pack', '$68'],
            ]
              .map(
                ([img, name, price]) => `<td width="33%" valign="top" style="padding:6px;">
                  <img src="${img}" alt="" width="100%" style="border-radius:10px;display:block;height:88px;object-fit:cover;" />
                  <div style="margin-top:6px;font-size:12px;font-weight:700;color:${INK};">${name}</div>
                  <div style="font-size:12px;color:${MUTE};">${price}</div>
                </td>`,
              )
              .join('')}
          </tr>
        </table>`,
      ),
    ],
  },
];

/* ================================================================== *
 * PRODUCT ORDERS / RECEIPTS
 * ================================================================== */

const orderModules: EmailModuleDef[] = [
  {
    id: 'ord-confirmation',
    name: 'Order confirmation header',
    tags: ['order', 'receipt', 'transactional'],
    preview: (
      <P className="text-center">
        <div className="mx-auto h-5 w-5 rounded-full bg-emerald-500" />
        <Bar w="w-1/2 mx-auto mt-1" h="h-1.5" c="bg-slate-800" />
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;">
          <span style="display:inline-block;width:44px;height:44px;line-height:44px;border-radius:50%;background:#dcfce7;color:#059669;font-size:22px;">✓</span>
          <div style="margin-top:12px;font-size:20px;font-weight:800;color:${INK};">Order #10482 confirmed</div>
          <div style="margin-top:4px;font-size:13px;color:${MUTE};">We'll email you again when it ships.</div>
        </div>`,
      ),
    ],
  },
  {
    id: 'ord-line-items',
    name: 'Line items table',
    tags: ['order', 'items', 'table'],
    preview: (
      <P className="space-y-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex justify-between">
            <Bar w="w-1/2" h="h-1.5" />
            <Bar w="w-1/6" h="h-1.5" c="bg-slate-800" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      {
        id: uid('tbl'),
        type: 'table',
        content: {
          headers: ['Item', 'Qty', 'Price'],
          rows: [
            ['Everyday Carry Watch', '1', '$189.00'],
            ['Leather strap (Tan)', '1', '$29.00'],
            ['Shipping', '', 'Free'],
            ['Total', '', '$218.00'],
          ],
        },
        styles: {
          padding_top: 16,
          padding_bottom: 16,
          padding_left: 28,
          padding_right: 28,
          border_color: LINE,
        } as EmailBlock['styles'],
      },
    ],
  },
  {
    id: 'ord-shipping',
    name: 'Shipping details block',
    tags: ['order', 'shipping', 'address'],
    preview: (
      <P className="grid grid-cols-2 gap-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-1">
            <Bar w="w-1/2" h="h-1" c="bg-violet-300" />
            <Bar w="w-full" h="h-1" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      h(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;font-size:13px;color:${INK};">
          <tr>
            <td width="50%" valign="top" style="padding-right:12px;">
              <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${MUTE};">Ship to</div>
              <div style="margin-top:6px;line-height:1.6;">Alex Morgan<br/>128 Pine St, Apt 4<br/>Portland, OR 97205</div>
            </td>
            <td width="50%" valign="top">
              <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${MUTE};">Delivery</div>
              <div style="margin-top:6px;line-height:1.6;">Standard (3–5 days)<br/>Est. arrival May 12</div>
            </td>
          </tr>
        </table>`,
      ),
    ],
  },
  {
    id: 'ord-track-cta',
    name: 'Track shipment CTA',
    tags: ['order', 'tracking', 'cta'],
    preview: (
      <P className="text-center">
        <div className="mx-auto h-3 w-16 rounded-full bg-violet-600" />
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;color:${MUTE};font-size:13px;">Your tracking number is <strong style="color:${INK};">1Z999AA10123456784</strong></div>`,
        { padding_bottom: 4 },
      ),
      button('Track my package'),
    ],
  },
];

/* ================================================================== *
 * STATS & NUMBERS
 * ================================================================== */

const statsModules: EmailModuleDef[] = [
  {
    id: 'stat-three-up',
    name: 'Three-stat row',
    tags: ['stats', 'metrics', 'kpi'],
    preview: (
      <P className="flex justify-around text-center">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1">
            <Bar w="w-8" h="h-2.5" c="bg-slate-800" />
            <Bar w="w-10" h="h-1" c="bg-slate-200" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      h(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;text-align:center;">
          <tr>
            ${[
              ['3.2×', 'faster campaign builds'],
              ['+18%', 'average open rate lift'],
              ['12k', 'teams onboarded'],
            ]
              .map(
                ([n, label]) => `<td width="33%" valign="top" style="padding:10px;">
                  <div style="font-size:28px;font-weight:800;color:${INK};">${n}</div>
                  <div style="font-size:12px;color:${MUTE};line-height:1.5;">${label}</div>
                </td>`,
              )
              .join('')}
          </tr>
        </table>`,
      ),
    ],
  },
  {
    id: 'stat-big-number',
    name: 'Hero number',
    tags: ['stat', 'headline', 'impact'],
    preview: (
      <P className="text-center">
        <Bar w="w-1/3 mx-auto" h="h-4" c="bg-slate-900" />
        <Bar w="w-1/2 mx-auto mt-1" h="h-1" c="bg-slate-200" />
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;">
          <div style="font-size:52px;font-weight:800;color:${BRAND};line-height:1;">$2.4M</div>
          <div style="margin-top:8px;font-size:14px;color:${MUTE};">in revenue attributed to lifecycle email last quarter</div>
        </div>`,
      ),
    ],
  },
  {
    id: 'stat-progress',
    name: 'Goal progress bar',
    tags: ['progress', 'goal', 'fundraiser'],
    preview: (
      <P className="space-y-1">
        <div className="h-2 w-full rounded-full bg-slate-200">
          <div className="h-2 w-2/3 rounded-full bg-violet-600" />
        </div>
        <Bar w="w-1/3" h="h-1" c="bg-slate-200" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};">
          <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:${INK};margin-bottom:6px;">
            <span>$32,000 raised</span><span style="color:${MUTE};">Goal $50,000</span>
          </div>
          <div style="height:12px;border-radius:999px;background:${LINE};overflow:hidden;">
            <div style="height:12px;width:64%;border-radius:999px;background:${BRAND};"></div>
          </div>
        </div>`,
      ),
    ],
  },
  {
    id: 'stat-yearin-review',
    name: 'Year-in-review tiles',
    tags: ['recap', 'wrapped', 'stats'],
    preview: (
      <P className="grid grid-cols-2 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-1 rounded bg-slate-900 p-1.5">
            <Bar w="w-1/2" h="h-2" c="bg-violet-400" />
          </div>
        ))}
      </P>
    ),
    build: () => [
      h(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;">
          <tr>
            ${[
              ['247', 'emails sent'],
              ['1.2M', 'opens'],
              ['58k', 'clicks'],
              ['92%', 'inbox placement'],
            ]
              .slice(0, 2)
              .map(
                ([n, l]) => `<td width="50%" style="padding:6px;">
                  <div style="background:${INK};border-radius:14px;padding:20px;">
                    <div style="font-size:26px;font-weight:800;color:#fff;">${n}</div>
                    <div style="font-size:11px;color:#a5b4fc;text-transform:uppercase;letter-spacing:.06em;">${l}</div>
                  </div>
                </td>`,
              )
              .join('')}
          </tr>
          <tr>
            ${[
              ['58k', 'clicks'],
              ['92%', 'inbox placement'],
            ]
              .map(
                ([n, l]) => `<td width="50%" style="padding:6px;">
                  <div style="background:${INK};border-radius:14px;padding:20px;">
                    <div style="font-size:26px;font-weight:800;color:#fff;">${n}</div>
                    <div style="font-size:11px;color:#a5b4fc;text-transform:uppercase;letter-spacing:.06em;">${l}</div>
                  </div>
                </td>`,
              )
              .join('')}
          </tr>
        </table>`,
      ),
    ],
  },
];

/* ================================================================== *
 * DISCOUNTS & SALES
 * ================================================================== */

const discountModules: EmailModuleDef[] = [
  {
    id: 'dsc-coupon',
    name: 'Coupon code card',
    tags: ['coupon', 'promo', 'code'],
    preview: (
      <P className="border-2 border-dashed border-violet-400 text-center">
        <Bar w="w-1/3 mx-auto" h="h-2.5" c="bg-violet-600" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};border:2px dashed ${BRAND};border-radius:16px;padding:26px;text-align:center;">
          <div style="font-size:13px;color:${MUTE};font-weight:600;">Take 20% off your next order</div>
          <div style="margin:10px 0;font-size:30px;font-weight:800;letter-spacing:.12em;color:${BRAND};">SPRING20</div>
          <div style="font-size:11px;color:${MUTE};">Expires in 7 days · one use per customer</div>
        </div>`,
        { padding_top: 12, padding_bottom: 4 },
      ),
      button('Redeem offer'),
    ],
  },
  {
    id: 'dsc-percent-hero',
    name: 'Percentage-off hero',
    tags: ['sale', 'percent', 'hero'],
    preview: (
      <P className="bg-slate-900 text-center">
        <Bar w="w-1/2 mx-auto" h="h-4" c="bg-white" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};background:${INK};border-radius:18px;padding:40px 24px;text-align:center;">
          <div style="font-size:48px;font-weight:800;color:#fff;line-height:1;">40% OFF</div>
          <div style="margin-top:10px;font-size:14px;color:#cbd5e1;letter-spacing:.06em;text-transform:uppercase;">Everything · this weekend only</div>
        </div>`,
      ),
    ],
  },
  {
    id: 'dsc-bogo',
    name: 'BOGO / bundle strip',
    tags: ['bundle', 'bogo', 'offer'],
    preview: (
      <P className="bg-emerald-500 text-center">
        <Bar w="w-2/3 mx-auto" h="h-2" c="bg-white/90" />
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;color:#fff;font-size:15px;font-weight:800;">Buy one, get one free — automatically at checkout</div>`,
        { bg_color: '#059669', padding_top: 18, padding_bottom: 18, border_radius: 12 },
      ),
    ],
  },
  {
    id: 'dsc-flash',
    name: 'Flash sale w/ deadline',
    tags: ['flash', 'urgency', 'sale'],
    preview: (
      <P className="space-y-1 text-center">
        <Bar w="w-1/2 mx-auto" h="h-2.5" c="bg-rose-500" />
        <Bar w="w-1/3 mx-auto" h="h-1" c="bg-slate-200" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};text-align:center;">
          <div style="font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#e11d48;">⚡ Flash sale</div>
          <div style="margin:6px 0;font-size:24px;font-weight:800;color:${INK};">Up to 50% off best-sellers</div>
          <div style="font-size:13px;color:${MUTE};">Ends tonight at 11:59 PM</div>
        </div>`,
        { padding_top: 12, padding_bottom: 4 },
      ),
      button('Shop the sale', 'https://', { bg_color: '#e11d48' }),
    ],
  },
];

/* ================================================================== *
 * SURVEYS, NPS, VOTES & FORMS
 * ================================================================== */

const surveyModules: EmailModuleDef[] = [
  {
    id: 'srv-nps',
    name: 'NPS 0–10 scale',
    tags: ['nps', 'survey', 'score'],
    preview: (
      <P className="flex justify-between gap-0.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-3 flex-1 rounded-sm bg-slate-200" />
        ))}
      </P>
    ),
    build: () => [
      t(`<div style="font-family:${FONT};text-align:center;font-size:15px;font-weight:700;color:${INK};">How likely are you to recommend us?</div>`, {
        padding_bottom: 10,
      }),
      h(
        `<table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;">
          <tr>
            ${Array.from({ length: 11 })
              .map(
                (_, i) =>
                  `<td align="center" style="padding:2px;"><a href="https://" style="display:block;padding:8px 0;border:1px solid ${LINE};border-radius:8px;font-size:12px;font-weight:700;color:${INK};text-decoration:none;">${i}</a></td>`,
              )
              .join('')}
          </tr>
        </table>
        <table role="presentation" width="100%" style="font-family:${FONT};border-collapse:collapse;margin-top:4px;">
          <tr>
            <td style="font-size:10px;color:${MUTE};">Not likely</td>
            <td align="right" style="font-size:10px;color:${MUTE};">Very likely</td>
          </tr>
        </table>`,
      ),
    ],
  },
  {
    id: 'srv-rating',
    name: 'Star rating prompt',
    tags: ['rating', 'stars', 'feedback'],
    preview: (
      <P className="text-center text-sm text-amber-400">★ ★ ★ ★ ★</P>
    ),
    build: () => [
      t(`<div style="font-family:${FONT};text-align:center;font-size:15px;font-weight:700;color:${INK};">How was your experience?</div>`, {
        padding_bottom: 8,
      }),
      t(
        `<div style="font-family:${FONT};text-align:center;font-size:30px;letter-spacing:8px;">
          <a href="https://" style="text-decoration:none;color:#f59e0b;">★</a><a href="https://" style="text-decoration:none;color:#f59e0b;">★</a><a href="https://" style="text-decoration:none;color:#f59e0b;">★</a><a href="https://" style="text-decoration:none;color:#f59e0b;">★</a><a href="https://" style="text-decoration:none;color:#f59e0b;">★</a>
        </div>`,
        { padding_top: 0 },
      ),
    ],
  },
  {
    id: 'srv-thumbs',
    name: 'Thumbs up / down',
    tags: ['vote', 'binary', 'feedback'],
    preview: (
      <P className="flex justify-center gap-3 text-sm">👍 👎</P>
    ),
    build: () => [
      t(`<div style="font-family:${FONT};text-align:center;font-size:14px;font-weight:700;color:${INK};">Was this update helpful?</div>`, {
        padding_bottom: 10,
      }),
      h(
        `<div style="font-family:${FONT};text-align:center;">
          <a href="https://" style="display:inline-block;margin:0 6px;padding:10px 20px;border:1px solid ${LINE};border-radius:999px;font-size:14px;text-decoration:none;color:${INK};">👍 Yes</a>
          <a href="https://" style="display:inline-block;margin:0 6px;padding:10px 20px;border:1px solid ${LINE};border-radius:999px;font-size:14px;text-decoration:none;color:${INK};">👎 No</a>
        </div>`,
      ),
    ],
  },
  {
    id: 'srv-poll',
    name: 'Multiple-choice poll',
    tags: ['poll', 'choice', 'survey'],
    preview: (
      <P className="space-y-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-3 w-full rounded border border-slate-200" />
        ))}
      </P>
    ),
    build: () => [
      t(`<div style="font-family:${FONT};font-size:15px;font-weight:700;color:${INK};">Which feature should we build next?</div>`, {
        padding_bottom: 10,
      }),
      h(
        `<div style="font-family:${FONT};">
          ${['SMS journeys', 'In-app messages', 'Deeper Salesforce sync', 'AI subject-line testing']
            .map(
              (opt) =>
                `<a href="https://" style="display:block;margin-bottom:8px;padding:12px 16px;border:1px solid ${LINE};border-radius:10px;font-size:13px;font-weight:600;color:${INK};text-decoration:none;">${opt}</a>`,
            )
            .join('')}
        </div>`,
      ),
    ],
  },
  {
    id: 'srv-cta-form',
    name: 'Feedback CTA',
    tags: ['form', 'cta', 'survey'],
    preview: (
      <P className="text-center">
        <div className="mx-auto h-3 w-20 rounded-full bg-violet-600" />
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;font-size:14px;color:${MUTE};line-height:1.6;">Got two minutes? Your answers shape the roadmap.</div>`,
        { padding_bottom: 4 },
      ),
      button('Take the 2-min survey'),
    ],
  },
];

/* ================================================================== *
 * GAMIFICATIONS
 * ================================================================== */

const gamificationModules: EmailModuleDef[] = [
  {
    id: 'gam-scratch',
    name: 'Scratch-to-reveal card',
    tags: ['scratch', 'reward', 'game'],
    preview: (
      <P className="bg-gradient-to-r from-slate-300 to-slate-400 text-center">
        <span className="text-[8px] font-bold text-white">SCRATCH HERE</span>
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};border-radius:16px;padding:32px 24px;text-align:center;background:repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0 10px,#cbd5e1 10px,#cbd5e1 20px);">
          <div style="font-size:16px;font-weight:800;color:${INK};letter-spacing:.1em;">SCRATCH &amp; WIN</div>
          <div style="margin-top:6px;font-size:12px;color:${MUTE};">Tap below to reveal your reward</div>
        </div>`,
        { padding_top: 12, padding_bottom: 4 },
      ),
      button('Reveal my prize'),
    ],
  },
  {
    id: 'gam-spin',
    name: 'Spin-the-wheel',
    tags: ['wheel', 'spin', 'game'],
    preview: (
      <P className="flex justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-violet-500 border-t-fuchsia-500" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};text-align:center;">
          <div style="width:120px;height:120px;border-radius:50%;margin:0 auto;background:conic-gradient(#7c3aed 0 25%,#db2777 0 50%,#f59e0b 0 75%,#10b981 0);"></div>
          <div style="margin-top:14px;font-size:16px;font-weight:800;color:${INK};">Spin for up to 30% off</div>
        </div>`,
        { padding_top: 12, padding_bottom: 4 },
      ),
      button('Spin the wheel'),
    ],
  },
  {
    id: 'gam-progress-reward',
    name: 'Rewards progress',
    tags: ['loyalty', 'progress', 'points'],
    preview: (
      <P className="space-y-1">
        <div className="h-2 w-full rounded-full bg-slate-200">
          <div className="h-2 w-3/4 rounded-full bg-emerald-500" />
        </div>
        <Bar w="w-1/2" h="h-1" c="bg-slate-200" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};border:1px solid ${LINE};border-radius:16px;padding:22px;">
          <div style="font-size:14px;font-weight:700;color:${INK};">You're 150 points from a free item</div>
          <div style="height:12px;border-radius:999px;background:${LINE};overflow:hidden;margin:10px 0 6px;">
            <div style="height:12px;width:78%;border-radius:999px;background:#10b981;"></div>
          </div>
          <div style="font-size:12px;color:${MUTE};">850 / 1,000 pts</div>
        </div>`,
      ),
    ],
  },
  {
    id: 'gam-quiz',
    name: 'Quiz teaser',
    tags: ['quiz', 'interactive', 'game'],
    preview: (
      <P className="space-y-1.5 text-center">
        <Bar w="w-2/3 mx-auto" h="h-2" c="bg-slate-800" />
        <div className="mx-auto h-3 w-14 rounded-full bg-violet-600" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};background:#f5f3ff;border-radius:16px;padding:26px;text-align:center;">
          <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${BRAND};">2-minute quiz</div>
          <div style="margin:8px 0;font-size:19px;font-weight:800;color:${INK};line-height:1.3;">Which plan fits your team?</div>
          <div style="font-size:13px;color:${MUTE};">Answer 4 questions, get a tailored recommendation.</div>
        </div>`,
        { padding_top: 12, padding_bottom: 4 },
      ),
      button('Start the quiz'),
    ],
  },
  {
    id: 'gam-streak',
    name: 'Streak / badge unlock',
    tags: ['streak', 'badge', 'achievement'],
    preview: (
      <P className="flex items-center justify-center gap-2">
        <span className="text-sm">🔥</span>
        <Bar w="w-1/2" h="h-2" c="bg-slate-800" />
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};text-align:center;">
          <div style="font-size:40px;">🔥</div>
          <div style="margin-top:6px;font-size:18px;font-weight:800;color:${INK};">7-day streak unlocked!</div>
          <div style="font-size:13px;color:${MUTE};">Keep it going to earn the Trailblazer badge.</div>
        </div>`,
      ),
    ],
  },
];

/* ================================================================== *
 * COUNTDOWN TIMERS
 * ================================================================== */

const countdownModules: EmailModuleDef[] = [
  {
    id: 'cd-blocks',
    name: 'Digit blocks countdown',
    tags: ['countdown', 'timer', 'urgency'],
    preview: (
      <P className="flex justify-center gap-1">
        {['02', '11', '45'].map((n, i) => (
          <div key={i} className="rounded bg-slate-900 px-1.5 py-1 text-[8px] font-bold text-white">
            {n}
          </div>
        ))}
      </P>
    ),
    build: () => [
      h(
        `<table role="presentation" style="font-family:${FONT};border-collapse:collapse;margin:0 auto;text-align:center;">
          <tr>
            ${[
              ['02', 'Days'],
              ['11', 'Hrs'],
              ['45', 'Min'],
              ['09', 'Sec'],
            ]
              .map(
                ([n, l]) => `<td style="padding:4px;">
                  <div style="background:${INK};color:#fff;border-radius:10px;padding:12px 14px;min-width:44px;">
                    <div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;">${n}</div>
                    <div style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8;">${l}</div>
                  </div>
                </td>`,
              )
              .join('')}
          </tr>
        </table>`,
      ),
    ],
  },
  {
    id: 'cd-inline',
    name: 'Inline text countdown',
    tags: ['countdown', 'inline', 'strip'],
    preview: (
      <P className="bg-rose-500 text-center">
        <span className="text-[8px] font-bold text-white">ENDS IN 02:11:45</span>
      </P>
    ),
    build: () => [
      t(
        `<div style="font-family:${FONT};text-align:center;color:#fff;font-size:14px;font-weight:800;letter-spacing:.04em;">
          ⏰ Offer ends in <span style="font-variant-numeric:tabular-nums;">02:11:45</span>
        </div>`,
        { bg_color: '#e11d48', padding_top: 14, padding_bottom: 14, border_radius: 10 },
      ),
    ],
  },
  {
    id: 'cd-hero',
    name: 'Countdown hero',
    tags: ['countdown', 'hero', 'launch'],
    preview: (
      <P className="space-y-1.5 bg-slate-900 text-center">
        <Bar w="w-1/2 mx-auto" h="h-2" c="bg-white/80" />
        <div className="flex justify-center gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-3 w-4 rounded bg-violet-500" />
          ))}
        </div>
      </P>
    ),
    build: () => [
      h(
        `<div style="font-family:${FONT};background:${INK};border-radius:18px;padding:32px 24px;text-align:center;">
          <div style="font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a5b4fc;">Launching soon</div>
          <div style="margin:8px 0 16px;font-size:22px;font-weight:800;color:#fff;">Early-access closes in</div>
          <table role="presentation" style="border-collapse:collapse;margin:0 auto;">
            <tr>
              ${[
                ['05', 'Days'],
                ['18', 'Hrs'],
                ['22', 'Min'],
              ]
                .map(
                  ([n, l]) => `<td style="padding:4px;">
                    <div style="background:rgba(255,255,255,.08);border-radius:10px;padding:10px 12px;min-width:44px;">
                      <div style="font-size:20px;font-weight:800;color:#fff;">${n}</div>
                      <div style="font-size:9px;text-transform:uppercase;color:#94a3b8;">${l}</div>
                    </div>
                  </td>`,
                )
                .join('')}
            </tr>
          </table>
        </div>`,
      ),
    ],
  },
];

/* ================================================================== *
 * POPULAR  (curated cross-section)
 * ================================================================== */

const popularModules: EmailModuleDef[] = [
  headerModules[2], // Logo + navigation
  contentModules[0], // Article teaser
  contentModules[5], // CTA band
  bannerModules[0], // Gradient hero
  productCardModules[0], // Single product card
  reviewModules[0], // Testimonial card
  statsModules[0], // Three-stat row
  discountModules[0], // Coupon code card
  footerModules[0], // Standard footer
].map((m, i) => ({ ...m, id: `pop-${i}-${m.id}` }));

/* ================================================================== *
 * REGISTRY
 * ================================================================== */

export const EMAIL_MODULE_LIBRARY: EmailModuleCategory[] = [
  { id: 'popular', name: 'Popular', icon: Sparkles, blurb: 'Our most-used modules', modules: popularModules },
  { id: 'headers', name: 'Preheaders, Headers and Navigation', icon: PanelTop, blurb: 'Top-of-email bars, logos & menus', modules: headerModules },
  { id: 'lists', name: 'Lists', icon: ListChecks, blurb: 'Checklists, steps & bullets', modules: listModules },
  { id: 'webinars', name: 'Webinars', icon: CalendarClock, blurb: 'Invites, agendas & replays', modules: webinarModules },
  { id: 'footers', name: 'Footers and Socials', icon: LayoutList, blurb: 'Legal, social & sign-offs', modules: footerModules },
  { id: 'content_canvases', name: 'Content Canvases, Blog Posts', icon: AlignLeft, blurb: 'Articles, quotes & callouts', modules: contentModules },
  { id: 'banners', name: 'Banners', icon: Columns, blurb: 'Hero & promo banners', modules: bannerModules },
  { id: 'dividers', name: 'Dividers', icon: Minus, blurb: 'Rules, spacers & section breaks', modules: dividerModules },
  { id: 'pricings', name: 'Pricings and Comparisons', icon: Table2, blurb: 'Plan cards & feature tables', modules: pricingModules },
  { id: 'reviews', name: 'Reviews', icon: Quote, blurb: 'Testimonials & social proof', modules: reviewModules },
  { id: 'signatures', name: 'Signatures', icon: Award, blurb: 'Personal & team sign-offs', modules: signatureModules },
  { id: 'product_cards', name: 'Product Cards', icon: ShoppingBag, blurb: 'Single, grid & cross-sell', modules: productCardModules },
  { id: 'product_orders', name: 'Product Orders', icon: Table2, blurb: 'Receipts, shipping & tracking', modules: orderModules },
  { id: 'stats_numbers', name: 'Stats and Numbers', icon: TrendingUp, blurb: 'KPIs, progress & recaps', modules: statsModules },
  { id: 'discounts_sales', name: 'Discounts and Sales', icon: BadgePercent, blurb: 'Coupons, % off & flash sales', modules: discountModules },
  { id: 'surveys_nps', name: 'Surveys, NPS, Votes, Forms', icon: Star, blurb: 'NPS, ratings & polls', modules: surveyModules },
  { id: 'gamifications', name: 'Gamifications', icon: Gamepad2, blurb: 'Scratch, spin & streaks', modules: gamificationModules },
  { id: 'countdown_timers', name: 'Countdown Timers', icon: Timer, blurb: 'Digit blocks & urgency strips', modules: countdownModules },
];

export const EMAIL_MODULE_CATEGORY_MAP: Record<string, EmailModuleCategory> = Object.fromEntries(
  EMAIL_MODULE_LIBRARY.map((c) => [c.id, c]),
);

/** Flat search across every module in the library. */
export function searchEmailModules(query: string): Array<{ category: EmailModuleCategory; module: EmailModuleDef }> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: Array<{ category: EmailModuleCategory; module: EmailModuleDef }> = [];
  for (const category of EMAIL_MODULE_LIBRARY) {
    if (category.id === 'popular') continue;
    for (const module of category.modules) {
      const haystack = `${module.name} ${module.id} ${module.tags.join(' ')} ${category.name}`.toLowerCase();
      if (haystack.includes(q)) out.push({ category, module });
    }
  }
  return out;
}

// Re-export for callers that only need the module typing
export type { EmailModuleDef as EmailModule };
