import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  Forward,
  Globe,
  Grid,
  GripVertical,
  HelpCircle,
  History,
  Image as ImageIcon,
  Layers,
  Laptop,
  LayoutGrid,
  List,
  Mail,
  Menu,
  MessageSquare,
  Minus,
  MoreHorizontal,
  MoreVertical,
  Move,
  MoveHorizontal,
  Palette,
  SlidersHorizontal,
  Pencil,
  Plus,
  Printer,
  Reply,
  RotateCcw,
  Search,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Smile,
  Smartphone,
  Sparkles,
  Star,
  Table,
  Tag,
  Trash2,
  Type,
  Undo2,
  Upload,
  User,
  Users,
  Video,
  X,
  Zap,
  ArrowUp,
  ArrowDown,
  Unlink,
  Highlighter,
  Link,
  Bot,
  AlertTriangle,
  RefreshCw,
  Wifi,
  Lock,
  Unlock,
  type LucideIcon,
} from 'lucide-react';
import type { EmailBlock } from '@/lib/email-builder-types';
import { DEFAULT_EMAIL_THEME } from '@/lib/email-builder-types';
import { renderBlocksToAmpHtml, renderBlocksToHtml, renderBlocksToPlainText } from '@/lib/email-renderer';
import type { EmailContent } from '@/lib/content-templates';
import { uploadAsset } from '@/lib/assets';
import { useTenantScope } from '@/contexts/AuthContext';
import { LeftModulesDrawer } from './LeftModulesDrawer';
import {
  convertHtmlToPlainText,
  validateAmpEmailCode,
  SAMPLE_AMP_BOILERPLATE,
  parseHtmlToVisualBlocks,
  type AmpValidationResult,
} from '@/lib/email-builder-sync';
import { executeIntelligentReasoning } from '@/lib/ai-crm-context';
import { fetchLandingPages, type MarbeeLandingPage } from '@/lib/landing-pages';

type Props = {
  templateId?: string;
  content: EmailContent;
  initialStatus?: 'draft' | 'in_review' | 'approved' | 'published';
  onChange: (content: EmailContent) => void;
  personalizationSample?: Record<string, unknown>;
  templateName?: string;
  createdDate?: string;
  onSave?: (updatedContent?: EmailContent, updatedStatus?: string) => void;
  onBack?: () => void;
};

type ViewMode = 'visual' | 'html' | 'amp' | 'text' | 'preview';
type StudioTab = 'editing' | 'settings';

export const CUSTOMER_MERGE_TAGS = [
  {
    group: '👤 Customer Profile (Customer Table)',
    tags: [
      { label: 'First Name', tag: '{{customer.first_name}}' },
      { label: 'Last Name', tag: '{{customer.last_name}}' },
      { label: 'Full Name', tag: '{{customer.full_name}}' },
      { label: 'Email Address', tag: '{{customer.email}}' },
      { label: 'Phone Number', tag: '{{customer.phone}}' },
      { label: 'Company / Org', tag: '{{customer.company}}' },
      { label: 'City', tag: '{{customer.city}}' },
      { label: 'Country', tag: '{{customer.country}}' },
      { label: 'Postal Code', tag: '{{customer.zip}}' },
      { label: 'Customer Since', tag: '{{customer.created_at}}' },
    ],
  },
  {
    group: '🎟️ 1-to-N Dynamic Coupons & Offers',
    tags: [
      { label: '1-to-N Offers Loop', tag: '{{#each customer.offers}}' },
      { label: 'Offer Title', tag: '{{offer.title}}' },
      { label: 'Offer Promo Code', tag: '{{offer.code}}' },
      { label: 'Offer Discount / Value', tag: '{{offer.discount}}' },
      { label: 'Offer Expiry Date', tag: '{{offer.expires_at}}' },
      { label: 'Offer 1-Click CTA Link', tag: '{{offer.claim_url}}' },
      { label: 'End Loop Tag', tag: '{{/each}}' },
      { label: 'Primary Coupon Code', tag: '{{coupon.code}}' },
      { label: 'Primary Discount Amount', tag: '{{coupon.discount}}' },
    ],
  },
  {
    group: '⭐ Loyalty & Membership',
    tags: [
      { label: 'Loyalty Points Balance', tag: '{{customer.loyalty_points}}' },
      { label: 'Membership Tier', tag: '{{customer.tier}}' },
      { label: 'Referral Code', tag: '{{customer.referral_code}}' },
      { label: 'Account Status', tag: '{{customer.status}}' },
    ],
  },
  {
    group: '🛍️ Orders & E-Commerce',
    tags: [
      { label: 'Latest Order ID', tag: '{{order.id}}' },
      { label: 'Order Total Amount', tag: '{{order.total}}' },
      { label: 'Items Count', tag: '{{order.items_count}}' },
      { label: 'Tracking URL', tag: '{{order.tracking_url}}' },
      { label: 'Abandoned Cart Link', tag: '{{cart.checkout_url}}' },
    ],
  },
];


/**
 * Collapsible section for the right inspector panel. Keeps the panel tidy by
 * letting secondary control groups fold away instead of stacking in one long
 * always-open scroll.
 */
function InspectorSection({
  title,
  icon: Icon,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  badge?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-slate-50"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
          {Icon ? <Icon className="h-3.5 w-3.5 text-slate-400" /> : null}
          {title}
          {badge ? (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold tracking-normal text-slate-500 normal-case">
              {badge}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open ? <div className="space-y-3 border-t border-slate-100 p-3">{children}</div> : null}
    </div>
  );
}

/**
 * Uncontrolled rich-text region for the canvas.
 *
 * The previous implementation bound `dangerouslySetInnerHTML` to block state, so
 * every formatting command (which updates state) forced React to rewrite the
 * node's innerHTML — destroying the live selection and caret. This component
 * writes the DOM exactly once per block, then leaves it alone while focused and
 * only re-syncs from props when the block changes or an external edit lands
 * while the field is not focused (undo, side-panel edits, etc.).
 */
function CanvasRichText({
  blockId,
  html,
  disabled,
  style,
  className,
  title,
  ariaLabel,
  onCommit,
  onSelectionChange,
  onFocusChange,
  onClick,
  onDoubleClick,
}: {
  blockId: string;
  html: string;
  disabled?: boolean;
  style?: CSSProperties;
  className?: string;
  title?: string;
  ariaLabel?: string;
  /** isFinal = blur (persist heavy); otherwise a debounced keystroke commit. */
  onCommit: (html: string, isFinal: boolean) => void;
  onSelectionChange?: (e: React.SyntheticEvent<HTMLDivElement>) => void;
  onFocusChange?: (focused: boolean) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Only touch the DOM when the field isn't being edited. This runs on mount,
    // on block switch, and on genuine external content changes.
    if (!focusedRef.current && el.innerHTML !== (html || '')) {
      el.innerHTML = html || '';
    }
  }, [blockId, html]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  return (
    <div
      ref={ref}
      data-block-id={blockId}
      contentEditable={!disabled}
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      style={style}
      className={className}
      title={title}
      onFocus={() => {
        focusedRef.current = true;
        onFocusChange?.(true);
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onInput={() => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          if (ref.current) onCommit(ref.current.innerHTML, false);
        }, 350);
      }}
      onBlur={() => {
        focusedRef.current = false;
        onFocusChange?.(false);
        clearTimeout(debounceRef.current);
        if (ref.current) onCommit(ref.current.innerHTML, true);
      }}
      onMouseUp={(e) => onSelectionChange?.(e)}
      onKeyUp={(e) => onSelectionChange?.(e)}
    />
  );
}

/**
 * Positioning shell for the canvas selection toolbar. Renders the bar fully
 * clear of its block (never overlapping the text you're editing) and flips
 * below the block when there isn't room above.
 */
function FloatingBarShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<'above' | 'below'>('above');

  useLayoutEffect(() => {
    const measure = () => {
      const bar = ref.current;
      const host = bar?.parentElement as HTMLElement | null;
      const scroller = (bar?.closest('[data-canvas-scroll]') as HTMLElement | null) || null;
      if (!bar || !host) return;
      const hostTop = host.getBoundingClientRect().top;
      const ceiling = scroller ? scroller.getBoundingClientRect().top : 0;
      const barH = bar.offsetHeight || 84;
      // If placing above would push the bar past the top of the scroll area,
      // drop it below the block instead.
      setPlace(hostTop - barH - 14 < ceiling + 8 ? 'below' : 'above');
    };
    measure();
    const scroller = ref.current?.closest('[data-canvas-scroll]') as HTMLElement | null;
    window.addEventListener('resize', measure);
    scroller?.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      scroller?.removeEventListener('scroll', measure);
    };
  }, []);

  return (
    <div
      ref={ref}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onClick={(e) => e.stopPropagation()}
      className={`absolute left-1/2 z-40 flex min-w-max -translate-x-1/2 select-none flex-col gap-1 rounded-xl border border-slate-700 bg-[#1e293b] p-1.5 text-white shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 ${
        place === 'above' ? 'bottom-full mb-2.5' : 'top-full mt-2.5'
      }`}
    >
      <div
        className={`absolute left-1/2 h-0 w-0 -translate-x-1/2 border-x-[6px] border-x-transparent ${
          place === 'above'
            ? 'bottom-[-6px] border-t-[6px] border-t-[#1e293b]'
            : 'top-[-6px] border-b-[6px] border-b-[#1e293b]'
        }`}
      />
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Inspector primitives — small, consistent controls for the right
 * panel so every element's editor reads the same way.
 * ------------------------------------------------------------------ */

function FieldRow({
  label,
  hint,
  children,
  stack,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  stack?: boolean;
}) {
  return (
    <div className={stack ? 'space-y-1.5' : 'flex items-center justify-between gap-3'}>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-slate-700">{label}</div>
        {hint ? <div className="text-[10px] leading-tight text-slate-400">{hint}</div> : null}
      </div>
      <div className={stack ? '' : 'shrink-0'}>{children}</div>
    </div>
  );
}

function SegControl<T extends string | number>({
  value,
  options,
  onChange,
  cols,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  cols?: number;
}) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0,1fr))` }}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex h-8 cursor-pointer items-center justify-center gap-1 rounded-lg border text-[11px] font-bold transition ${
            value === o.value
              ? 'border-violet-600 bg-violet-600 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RangeControl({
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-violet-600"
      />
      <span className="w-12 shrink-0 text-right font-mono text-[11px] text-violet-700">
        {value}
        {suffix ?? ''}
      </span>
    </div>
  );
}

function ColorControl({
  value,
  fallback,
  onChange,
}: {
  value?: string;
  fallback: string;
  onChange: (hex: string) => void;
}) {
  const v = value || fallback;
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-1.5 py-1">
      <input
        type="color"
        value={v}
        onChange={(e) => onChange(e.target.value)}
        className="h-5 w-5 cursor-pointer rounded border border-slate-200 p-0"
      />
      <span className="font-mono text-[10px] text-slate-500">{v}</span>
    </div>
  );
}

function PanelInput({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs focus:border-violet-500 focus:outline-hidden ${
        mono ? 'font-mono text-[11px]' : ''
      }`}
    />
  );
}

const PANEL_FONTS = [
  { label: 'Inter', val: 'Inter, sans-serif' },
  { label: 'Roboto', val: 'Roboto, sans-serif' },
  { label: 'Montserrat', val: 'Montserrat, sans-serif' },
  { label: 'Poppins', val: 'Poppins, sans-serif' },
  { label: 'Georgia', val: 'Georgia, serif' },
  { label: 'Playfair', val: "'Playfair Display', serif" },
  { label: 'Courier', val: "'Courier New', monospace" },
];

export function EmailTemplateStudio({
  content,
  initialStatus,
  onChange,
  templateName = 'New email',
  onSave,
  onBack,
}: Props) {
  const { tenantId, environment } = useTenantScope();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const htmlFileInputRef = useRef<HTMLInputElement>(null);

  // Enabled versions passed from creation modal (default to all 3 if not specified)
  const enabledVersions = content.enabled_versions || ['html', 'amp', 'text'];

  // View Mode: 'visual' | 'html' | 'amp' | 'text' | 'preview'
  const [viewMode, setViewMode] = useState<ViewMode>('visual');

  // Sidebar Tab: 'editing' | 'settings' (Only 2 tabs on right)
  const [activeTab, setActiveTab] = useState<StudioTab>('editing');
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [leftModulesOpen, setLeftModulesOpen] = useState(true);
  const [title, setTitle] = useState(templateName);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Slot hover & active states
  const [activeSlotTarget, setActiveSlotTarget] = useState<{ blockId: string; colIdx: number } | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<{ blockId: string; colIdx: number } | null>(null);

  // Raw Code states
  const [rawHtml, setRawHtml] = useState(content.html_body || '');
  const [rawAmp, setRawAmp] = useState(content.amp_html || '<!doctype html>\n<html ⚡4email>\n<head>\n  <meta charset="utf-8">\n</head>\n<body>\n  <h1>Welcome to AMP for Email</h1>\n</body>\n</html>');
  const [rawText, setRawText] = useState(content.text_body || '');

  // Settings State (Sender, Subject, Preheader)
  const [subject, setSubject] = useState(content.subject || 'Special update from Marbee');
  const [preheader, setPreheader] = useState(content.preheader || 'Discover the latest news and offers');
  const [fromName, setFromName] = useState((content as any)?.from_name || 'Marbee Team');
  const [fromEmail, setFromEmail] = useState((content as any)?.from_email || 'hello@marbee.io');
  const [replyTo, setReplyTo] = useState((content as any)?.reply_to || 'support@marbee.io');
  const [contentWidth, setContentWidth] = useState((content as any)?.builder_state?.theme?.content_width || 600);
  const [canvasBg, setCanvasBg] = useState((content as any)?.builder_state?.theme?.canvas_bg || '#ffffff');
  const [contentBg, setContentBg] = useState((content as any)?.builder_state?.theme?.content_bg || '#ffffff');
  const [isCanvasStyleOpen, setIsCanvasStyleOpen] = useState(false);
  const [saveStatusText, setSaveStatusText] = useState<'saved' | 'saving' | 'error'>('saved');

  // Ask Buddy AI states
  const [buddyPrompt, setBuddyPrompt] = useState('');
  const [isBuddyLoading, setIsBuddyLoading] = useState(false);
  const [isBuddyOpen, setIsBuddyOpen] = useState(false);

  // AMP validation state
  const [ampValidation, setAmpValidation] = useState<AmpValidationResult | null>(null);

  // Selected column slot within block (if columns layout)
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(0);
  const [mergeTagMenu, setMergeTagMenu] = useState<'body' | 'slot' | 'title' | null>(null);

  // Inline Rich-Text Formatting States & Refs (Link, Bold, Italic, Underline, Font, Color)

  const [linkModal, setLinkModal] = useState<{
    open: boolean;
    blockId: string;
    fieldKey: string;
    url: string;
    text: string;
    start: number;
    end: number;
    /** true when the link is being applied to a live contentEditable selection on the canvas */
    canvas?: boolean;
    /** whether the user had a non-empty text selection when the dialog opened */
    hadSelection?: boolean;
  } | null>(null);


  // Floating Inline Editing Toolbar State

  const [activeFloatingDropdown, setActiveFloatingDropdown] = useState<
    'color' | 'font' | 'special_links' | 'merge_tags' | 'symbols' | 'emojis' | null
  >(null);

  // Instance Published Landing Pages State
  const [publishedLandingPages, setPublishedLandingPages] = useState<MarbeeLandingPage[]>([]);

  useEffect(() => {
    if (tenantId && environment) {
      fetchLandingPages(tenantId, environment)
        .then((pages) => {
          setPublishedLandingPages(pages.filter((p) => p.status === 'published' || p.published_url || p.slug));
        })
        .catch((err) => {
          console.warn('Failed to load published landing pages:', err);
        });
    }
  }, [tenantId, environment]);

  // Drag-and-Drop Reorder State
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);

  // Notice state when switching from HTML code to Studio mode (auto-dismiss 4s)
  const [htmlToStudioNotice, setHtmlToStudioNotice] = useState<boolean>(false);
  const htmlToStudioTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [htmlToStudioMeta, setHtmlToStudioMeta] = useState<{ blocks: number }>({ blocks: 0 });

  // Settings-tab subject / preheader personalization
  const subjectInputRef = useRef<HTMLInputElement | null>(null);
  const preheaderInputRef = useRef<HTMLInputElement | null>(null);
  const [personalizeMenuFor, setPersonalizeMenuFor] = useState<'subject' | 'preheader' | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Blocks stored in state to allow complete deletion/erasing to 0 items
  const [blocks, setBlocks] = useState<EmailBlock[]>(() => {
    if (Array.isArray(content?.builder_state?.blocks) && content.builder_state.blocks.length > 0) {
      return content.builder_state.blocks;
    }
    if (Array.isArray(content?.blocks) && content.blocks.length > 0) {
      return content.blocks;
    }
    if (content?.html_body) {
      return [
        {
          id: `block-html-${Date.now()}`,
          type: 'text',
          content: {
            text: content.html_body,
            font_size: 15,
            line_height: 1.6,
            color: '#1e293b',
          },
          styles: {
            padding_top: 24,
            padding_bottom: 24,
            padding_left: 24,
            padding_right: 24,
          },
        },
      ];
    }
    return [];
  });

  const [, setDoubleClickedBlockId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(() => {
    if (Array.isArray(content?.builder_state?.blocks) && content.builder_state.blocks.length > 0) {
      return content.builder_state.blocks[0].id;
    }
    if (Array.isArray(content?.blocks) && content.blocks.length > 0) {
      return content.blocks[0].id;
    }
    return null;
  });

  const [previewIframeHeight, setPreviewIframeHeight] = useState<number>(700);
  const [gmailViewMode, setGmailViewMode] = useState<'inbox' | 'email'>('inbox');
  const [activeInboxTab, setActiveInboxTab] = useState<'primary' | 'promotions' | 'social' | 'updates'>('primary');
  const [selectedEsp, setSelectedEsp] = useState<'gmail' | 'outlook' | 'yahoo' | 'rediff'>('gmail');
  const [isEspDropdownOpen, setIsEspDropdownOpen] = useState<boolean>(false);

  // Test Profiles for Dynamic Personalization Preview
  const testProfiles = useMemo(() => [
    {
      id: 'user-1',
      name: 'Naman Sharma',
      email: 'naman@adobe.com',
      firstName: 'Naman',
      lastName: 'Sharma',
      company: 'Adobe Inc.',
      city: 'San Jose, CA',
      points: '2,450',
      tier: 'Platinum VIP',
      orderId: 'ORD-89241',
      discountCode: 'VIP50',
    },
    {
      id: 'user-2',
      name: 'Sarah Connor',
      email: 'sarah.c@cyberdyne.io',
      firstName: 'Sarah',
      lastName: 'Connor',
      company: 'Cyberdyne Systems',
      city: 'Los Angeles, CA',
      points: '1,200',
      tier: 'Gold Member',
      orderId: 'ORD-77412',
      discountCode: 'SUMMER25',
    },
    {
      id: 'user-3',
      name: 'Alex Rivera',
      email: 'alex.rivera@meta.com',
      firstName: 'Alex',
      lastName: 'Rivera',
      company: 'Meta Platforms',
      city: 'Seattle, WA',
      points: '4,890',
      tier: 'Diamond Elite',
      orderId: 'ORD-99105',
      discountCode: 'ELITE40',
    },
    {
      id: 'user-4',
      name: 'Elena Rostova',
      email: 'elena@spotify.com',
      firstName: 'Elena',
      lastName: 'Rostova',
      company: 'Spotify AB',
      city: 'Stockholm, Sweden',
      points: '850',
      tier: 'Silver',
      orderId: 'ORD-51034',
      discountCode: 'WELCOME10',
    },
  ], []);

  const [selectedTestProfileId, setSelectedTestProfileId] = useState<string>('user-1');
  const [testProfileSearchQuery, setTestProfileSearchQuery] = useState<string>('');
  const [isTestProfileDropdownOpen, setIsTestProfileDropdownOpen] = useState<boolean>(false);

  const selectedTestProfile = useMemo(() => {
    return testProfiles.find((p) => p.id === selectedTestProfileId) || testProfiles[0];
  }, [testProfiles, selectedTestProfileId]);

  // Send Test Modal State
  const [showSendTestModal, setShowSendTestModal] = useState<boolean>(false);
  const [testRecipients, setTestRecipients] = useState<string>('naman@adobe.com, test@marbee.io');
  const [testRecipientDraft, setTestRecipientDraft] = useState<string>('');
  const [testSubjectPrefix, setTestSubjectPrefix] = useState<string>('[Test]');
  const [testPreviewDevice, setTestPreviewDevice] = useState<'desktop' | 'mobile' | 'dark'>('desktop');
  const [testHistory, setTestHistory] = useState<Array<{ id: string; at: string; to: string[]; subject: string }>>([]);
  const [testCount, setTestCount] = useState<number>(1);
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [testSendProgress, setTestSendProgress] = useState<number>(0);
  const [testSendSuccess, setTestSendSuccess] = useState<boolean>(false);

  const ACCOUNT_EMAIL = 'sharma.naman722@gmail.com';
  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  const testRecipientList = testRecipients
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const addTestRecipient = (raw: string) => {
    const email = raw.trim().replace(/[,;]+$/, '');
    if (!email) return;
    if (!isValidEmail(email)) {
      showToast(`"${email}" is not a valid email`);
      return;
    }
    if (testRecipientList.some((r) => r.toLowerCase() === email.toLowerCase())) {
      setTestRecipientDraft('');
      return;
    }
    setTestRecipients([...testRecipientList, email].join(', '));
    setTestRecipientDraft('');
  };
  const removeTestRecipient = (email: string) => {
    setTestRecipients(testRecipientList.filter((r) => r !== email).join(', '));
  };

  // Unified lifecycle status: 'draft' | 'in_review' | 'approved' | 'published'
  const [templateStatus, setTemplateStatus] = useState<'draft' | 'in_review' | 'approved' | 'published'>(() => {
    const raw = initialStatus || (content as any)?.builder_state?.approval_status || 'draft';
    return raw === 'test_sent' ? 'in_review' : raw;
  });
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState<boolean>(false);
  const debouncedSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to persist content changes directly to DB and parent (debounced)
  const handlePersistSave = (overrides?: Partial<EmailContent>, overrideStatus?: string) => {
    const currentHtml = overrides?.html_body ?? rawHtml ?? renderBlocksToHtml(blocks);
    const currentAmp = overrides?.amp_html ?? rawAmp ?? renderBlocksToAmpHtml(blocks);
    const currentPlain = overrides?.plain_text ?? rawText ?? renderBlocksToPlainText(blocks);
    const currentSubject = overrides?.subject ?? subject;
    const currentPreheader = overrides?.preheader ?? preheader;
    const nextStatus = overrideStatus ?? templateStatus;

    const payload: EmailContent = {
      ...content,
      ...overrides,
      subject: currentSubject,
      preheader: currentPreheader,
      from_name: fromName,
      from_email: fromEmail,
      reply_to: replyTo,
      html_body: currentHtml,
      amp_html: currentAmp,
      plain_text: currentPlain,
      text_body: currentPlain,
      builder_state: {
        theme: {
          ...DEFAULT_EMAIL_THEME,
          canvas_bg: canvasBg,
          content_bg: contentBg,
          content_width: contentWidth,
        },
        blocks: overrides?.builder_state?.blocks ?? blocks,
        approval_status: nextStatus,
      },
    };

    // Fast synchronous local update
    onChange?.(payload);

    // Debounce the save status indicator so dragging sliders never flickers the top bar
    if (debouncedSaveTimerRef.current) {
      clearTimeout(debouncedSaveTimerRef.current);
    }

    debouncedSaveTimerRef.current = setTimeout(() => {
      setSaveStatusText('saving');
      setTimeout(() => setSaveStatusText('saved'), 400);
    }, 400);
  };

  const handleExplicitSaveAndExit = (overrideStatus?: string) => {
    const currentHtml = rawHtml || renderBlocksToHtml(blocks);
    const currentAmp = rawAmp || renderBlocksToAmpHtml(blocks);
    const currentPlain = rawText || renderBlocksToPlainText(blocks);
    const nextStatus = overrideStatus ?? templateStatus;
    const payload: EmailContent = {
      subject,
      preheader,
      html_body: currentHtml,
      amp_html: currentAmp,
      plain_text: currentPlain,
      text_body: currentPlain,
      builder_state: {
        theme: {
          ...DEFAULT_EMAIL_THEME,
          canvas_bg: canvasBg,
          content_bg: contentBg,
          content_width: contentWidth,
        },
        blocks,
        approval_status: nextStatus,
      },
    };
    onSave?.(payload, nextStatus);
    onBack?.();
  };

  // Personalization variable replacer supporting Liquid, Handlebars, and standard merge tags
  const applyPersonalization = (text: string, profile: typeof testProfiles[0]): string => {
    if (!text || !profile) return text || '';
    return text
      .replace(/\{\{\s*(firstName|first_name|fname|customer\.first_name|user\.first_name|recipient\.first_name)(\s*\|\s*[^}]+)?\s*\}\}/gi, profile.firstName)
      .replace(/\{\{\s*(lastName|last_name|lname|customer\.last_name|user\.last_name|recipient\.last_name)(\s*\|\s*[^}]+)?\s*\}\}/gi, profile.lastName)
      .replace(/\{\{\s*(name|fullName|full_name|customer\.name|user\.name|recipient\.name)(\s*\|\s*[^}]+)?\s*\}\}/gi, profile.name)
      .replace(/\{\{\s*(email|customer\.email|user\.email|recipient\.email)(\s*\|\s*[^}]+)?\s*\}\}/gi, profile.email)
      .replace(/\{\{\s*(company|customer\.company|user\.company)(\s*\|\s*[^}]+)?\s*\}\}/gi, profile.company)
      .replace(/\{\{\s*(city|customer\.city|user\.city)(\s*\|\s*[^}]+)?\s*\}\}/gi, profile.city)
      .replace(/\{\{\s*(points|loyalty_points|customer\.points|customer\.loyalty_points)(\s*\|\s*[^}]+)?\s*\}\}/gi, profile.points)
      .replace(/\{\{\s*(tier|loyalty_tier|customer\.tier)(\s*\|\s*[^}]+)?\s*\}\}/gi, profile.tier)
      .replace(/\{\{\s*(orderId|order_id|order\.id|order\.number)(\s*\|\s*[^}]+)?\s*\}\}/gi, profile.orderId)
      .replace(/\{\{\s*(discountCode|promo_code|coupon\.code|coupon)(\s*\|\s*[^}]+)?\s*\}\}/gi, profile.discountCode)
      .replace(/\*\|FNAME\|\*/gi, profile.firstName)
      .replace(/\*\|LNAME\|\*/gi, profile.lastName)
      .replace(/\*\|EMAIL\|\*/gi, profile.email)
      .replace(/%FIRSTNAME%/gi, profile.firstName)
      .replace(/%LASTNAME%/gi, profile.lastName)
      .replace(/%EMAIL%/gi, profile.email);
  };

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'EMAIL_IFRAME_RESIZE' && typeof e.data.height === 'number') {
        const targetH = Math.min(6000, Math.max(350, Math.ceil(e.data.height)));
        setPreviewIframeHeight(prev => {
          if (Math.abs(prev - targetH) > 25) {
            return targetH;
          }
          return prev;
        });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const lastRenderedHtmlRef = useRef<string>('');

  const selectedBlock = useMemo(() => {
    return blocks.find((b) => b.id === selectedBlockId) || null;
  }, [blocks, selectedBlockId]);

  const updateBlocks = (nextBlocks: EmailBlock[]) => {
    setBlocks(nextBlocks);
    const html = renderBlocksToHtml(nextBlocks);
    const amp = renderBlocksToAmpHtml(nextBlocks);
    const plain = renderBlocksToPlainText(nextBlocks);

    setRawHtml(html);
    lastRenderedHtmlRef.current = html;
    setRawText(plain);

    handlePersistSave({
      html_body: html,
      amp_html: amp,
      plain_text: plain,
      text_body: plain,
      builder_state: {
        theme: {
          ...DEFAULT_EMAIL_THEME,
          canvas_bg: canvasBg,
          content_bg: contentBg,
          content_width: contentWidth,
        },
        blocks: nextBlocks,
        approval_status: templateStatus,
      },
    });
  };

  const handleSelectBlock = (id: string) => {
    setSelectedBlockId(id);
    setDoubleClickedBlockId(null);
    setActiveTab('editing');
  };

  const handleMoveBlock = (id: string, direction: 'up' | 'down') => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= blocks.length) return;
    const updated = [...blocks];
    const [moved] = updated.splice(idx, 1);
    updated.splice(targetIdx, 0, moved);
    updateBlocks(updated);
    showToast(`Container moved ${direction}`);
  };

  const handleDuplicateBlock = (id: string) => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const original = blocks[idx];
    const cloned: EmailBlock = {
      ...JSON.parse(JSON.stringify(original)),
      id: `${original.type}-${Date.now().toString(36)}`,
    };
    const updated = [...blocks];
    updated.splice(idx + 1, 0, cloned);
    updateBlocks(updated);
    setSelectedBlockId(cloned.id);
    setActiveTab('editing');
    showToast('Container duplicated!');
  };

  const handleUpdateBlockContent = (id: string, newContent: any) => {
    const updated = blocks.map((b) => (b.id === id ? { ...b, content: { ...b.content, ...newContent } } : b));
    updateBlocks(updated);
  };

  /**
   * Lightweight content patch for in-progress canvas typing: updates block state
   * (so preview/HTML stay roughly in sync) without the full re-render + HTML/AMP/
   * plaintext regeneration + persist that `updateBlocks` performs. The heavy path
   * runs once on blur via `handleUpdateBlockContent`.
   */
  const patchBlockContentLight = (id: string, patch: any) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, content: { ...b.content, ...patch } } : b)));
  };

  /** Commit handler for a main text/title/paragraph CanvasRichText. */
  const commitCanvasText = (blockId: string, nextHtml: string, isFinal: boolean) => {
    const patch = { text: nextHtml, body: nextHtml, title: nextHtml, heading: nextHtml };
    if (isFinal) handleUpdateBlockContent(blockId, patch);
    else patchBlockContentLight(blockId, patch);
  };

  /** Commit handler for a column-slot CanvasRichText. */
  const commitCanvasSlotText = (blockId: string, slotIdx: number, nextHtml: string, isFinal: boolean) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const cols = [...((block.content as any).columns || [])];
    cols[slotIdx] = {
      ...cols[slotIdx],
      content: { ...(cols[slotIdx]?.content || { type: 'text' }), type: 'text', text: nextHtml },
    };
    if (isFinal) handleUpdateBlockContent(blockId, { columns: cols });
    else patchBlockContentLight(blockId, { columns: cols });
  };

  const handleUpdateBlockStyles = (id: string, newStyles: any) => {
    const updated = blocks.map((b) => (b.id === id ? { ...b, styles: { ...b.styles, ...newStyles } } : b));
    updateBlocks(updated);
  };

  const handleInsertCustomerTag = (tag: string) => {
    if (!selectedBlock) return;
    
    const fieldKey = selectedBlock.type === 'title' ? 'text' : (selectedBlock.content as any).body !== undefined ? 'body' : 'text';
    
    // Check if we are in a slot
    if ((selectedBlock.content as any).columns) {
      handleToolbarFormat(selectedBlock.id, 'slot', 'insert', tag);
    } else {
      handleToolbarFormat(selectedBlock.id, fieldKey, 'insert', tag);
    }
    
    setMergeTagMenu(null);
  };



  const handleDropReorder = (sourceId: string | null, targetId: string) => {
    if (!sourceId || sourceId === targetId) return;
    const sourceIdx = blocks.findIndex((b) => b.id === sourceId);
    const targetIdx = blocks.findIndex((b) => b.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const next = [...blocks];
    const [moved] = next.splice(sourceIdx, 1);
    next.splice(targetIdx, 0, moved);
    updateBlocks(next);
    setSelectedBlockId(sourceId);
    showToast('Container reordered!');
  };


  const savedSelectionStateRef = useRef<{ blockId: string; start: number; end: number } | null>(null);

  const getSelectionOffset = (container: HTMLElement) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return null;
    
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(container);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const start = preSelectionRange.toString().length;
    return { start, end: start + range.toString().length };
  };

  const setSelectionOffset = (container: HTMLElement, start: number, end: number) => {
    const range = document.createRange();
    let charIndex = 0;
    let startNode: Node | null = null;
    let endNode: Node | null = null;
    let startOffset = 0;
    let endOffset = 0;
    
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const nextCharIndex = charIndex + (node.textContent?.length || 0);
        if (!startNode && start >= charIndex && start <= nextCharIndex) {
          startNode = node;
          startOffset = start - charIndex;
        }
        if (!endNode && end >= charIndex && end <= nextCharIndex) {
          endNode = node;
          endOffset = end - charIndex;
        }
        charIndex = nextCharIndex;
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
          if (startNode && endNode) return;
        }
      }
    };
    walk(container);
    if (startNode && endNode) {
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  };

  const saveCurrentSelection = (e?: any) => {
    if (e && e.currentTarget) {
      const offset = getSelectionOffset(e.currentTarget);
      if (offset) {
        savedSelectionStateRef.current = { blockId: e.currentTarget.getAttribute('data-block-id') || '', ...offset };
      }
    }
  };


  const handleToggleLock = (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const isLocked = !Boolean((block as any).locked);
    const next = blocks.map((b) => (b.id === blockId ? { ...b, locked: isLocked } : b));
    updateBlocks(next);
    showToast(isLocked ? '🔒 Container Locked (Editing disabled)' : '🔓 Container Unlocked (Full editing enabled)');
  };

  /** Decorate freshly-created anchors inside a contentEditable so they carry
   *  consistent styling + safe rel/target and survive HTML export. */
  const decorateEditableLinks = (root: HTMLElement) => {
    root.querySelectorAll('a:not([data-mb-link])').forEach((node) => {
      const a = node as HTMLAnchorElement;
      a.setAttribute('data-mb-link', '1');
      const href = a.getAttribute('href') || '';
      // Merge-tag / compliance hrefs must stay verbatim, everything else opens in a new tab
      if (!/^\s*\{\{/.test(href)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
      a.style.color = a.style.color || '#6366f1';
      a.style.textDecoration = 'underline';
    });
  };

  const handleToolbarFormat = (
    blockIdArg: string,
    fieldKeyArg: string,
    type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'superscript' | 'subscript' | 'clear' | 'color' | 'font' | 'highlight' | 'link' | 'unlink' | 'insert',
    val?: string,
    linkText?: string
  ) => {
    const sel = window.getSelection();

    // 1. Snapshot whatever live range exists BEFORE we touch focus (focusing
    //    a contentEditable collapses the visible selection in most browsers).
    let range = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0) : null;

    // Resolve the editable that ACTUALLY holds the selection. The toolbar button
    // carries the block id from its render closure, but if the user drag-selected
    // in another block the selection may live elsewhere — follow the selection so
    // formatting always lands where the caret is.
    let el: HTMLElement | null = null;
    if (range) {
      const anchor = range.commonAncestorContainer;
      const anchorEl = (anchor.nodeType === 1 ? (anchor as HTMLElement) : anchor.parentElement) || null;
      el = anchorEl?.closest('[data-block-id]') as HTMLElement | null;
    }

    // Derive the real block id + slot from the resolved element; fall back to args.
    let blockId = blockIdArg;
    let fieldKey = fieldKeyArg;
    let slotIndex: number | null =
      fieldKeyArg === 'slot' && typeof selectedSlotIndex === 'number' ? selectedSlotIndex : null;
    if (el) {
      const domId = el.getAttribute('data-block-id') || '';
      const slotMatch = domId.match(/^(.*)-slot-(\d+)$/);
      if (slotMatch) {
        blockId = slotMatch[1];
        fieldKey = 'slot';
        slotIndex = Number(slotMatch[2]);
      } else {
        blockId = domId;
        if (fieldKey === 'slot') fieldKey = 'text';
        slotIndex = null;
      }
    } else {
      // No live selection anchor — fall back to the requested target element.
      const targetSelector =
        fieldKeyArg === 'slot' && typeof selectedSlotIndex === 'number'
          ? `[data-block-id="${blockIdArg}-slot-${selectedSlotIndex}"]`
          : `[data-block-id="${blockIdArg}"]`;
      el = document.querySelector(targetSelector) as HTMLElement | null;
    }

    const liveRangeInEl = Boolean(range && el && el.contains(range.commonAncestorContainer));

    // 2. If we don't have a usable range inside the target, restore from the
    //    character-offset snapshot captured on the last mouseup/keyup.
    if (el && !liveRangeInEl) {
      el.focus({ preventScroll: true });
      const saved = savedSelectionStateRef.current;
      if (saved && saved.blockId === el.getAttribute('data-block-id')) {
        setSelectionOffset(el, saved.start, saved.end);
      }
      range = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0) : null;
    } else if (el && document.activeElement !== el) {
      // Range is fine, just make sure execCommand targets this element.
      el.focus({ preventScroll: true });
      if (range) { sel?.removeAllRanges(); sel?.addRange(range); }
    }

    const hasCursorOrSelection = Boolean(range && el && el.contains(range.commonAncestorContainer));
    const hasSelectionText = Boolean(range && range.toString().length > 0);

    // The run-formatting tools always act on a text selection. If there genuinely
    // isn't one (and none can be restored), guide the user instead of silently
    // restyling the whole block — block-level styling lives in the right panel.
    const needsSelection =
      type === 'bold' ||
      type === 'italic' ||
      type === 'underline' ||
      type === 'strikethrough' ||
      type === 'superscript' ||
      type === 'subscript' ||
      type === 'color' ||
      type === 'font' ||
      type === 'highlight';
    if (needsSelection && !hasSelectionText) {
      showToast('Select some text on the canvas first');
      setActiveFloatingDropdown(null);
      return;
    }

    if (type === 'insert' && val) {
      // A bare merge tag ({{ first_name }}) is rendered as a styled, self-contained
      // chip so it reads as a token rather than literal braces in the copy.
      const isBareMergeTag = /^\s*\{\{[^{}]+\}\}\s*$/.test(val);
      const payload = isBareMergeTag
        ? `<span data-merge-tag="${val.trim()}" style="display:inline-block;padding:1px 6px;margin:0 1px;border-radius:6px;background:#ede9fe;color:#6d28d9;font-weight:600;font-size:0.92em;white-space:nowrap;">${val.trim()}</span>&nbsp;`
        : val;
      if (hasCursorOrSelection) {
        document.execCommand('insertHTML', false, payload);
      } else if (el) {
        // No cursor — append to the end of the editable region.
        el.innerHTML = `${el.innerHTML}${el.innerHTML ? ' ' : ''}${payload}`;
      }
      if (el) decorateEditableLinks(el);
    } else if (type === 'link') {
      const url = (val || 'https://').trim();
      document.execCommand('styleWithCSS', false, 'true');
      if (hasSelectionText) {
        document.execCommand('createLink', false, url);
      } else if (hasCursorOrSelection) {
        const label = linkText || url;
        document.execCommand(
          'insertHTML',
          false,
          `<a href="${url}">${label}</a>&nbsp;`
        );
      } else if (el) {
        const label = linkText || url;
        el.innerHTML = `${el.innerHTML}${el.innerHTML ? ' ' : ''}<a href="${url}">${label}</a>`;
      }
      if (el) decorateEditableLinks(el);
    } else if (hasSelectionText && range) {
       if (type === 'bold') document.execCommand('bold', false);
       else if (type === 'italic') document.execCommand('italic', false);
       else if (type === 'underline') document.execCommand('underline', false);
       else if (type === 'strikethrough') document.execCommand('strikeThrough', false);
       else if (type === 'superscript') document.execCommand('superscript', false);
       else if (type === 'subscript') document.execCommand('subscript', false);
       else if (type === 'color' && val) {
         document.execCommand('styleWithCSS', false, 'true');
         document.execCommand('foreColor', false, val);
       }
       else if (type === 'font' && val) {
         document.execCommand('styleWithCSS', false, 'true');
         document.execCommand('fontName', false, val);
       }
       else if (type === 'highlight' && val) {
         document.execCommand('styleWithCSS', false, 'true');
         document.execCommand('hiliteColor', false, val); // hiliteColor works for background in most browsers
       }
       else if (type === 'clear') {
         document.execCommand('removeFormat', false);
         document.execCommand('unlink', false);
       }
       else if (type === 'unlink') {
         document.execCommand('unlink', false);
       }
    } else {
      // If no text is selected, update whole container styles
      if (type === 'color' && val) {
        handleUpdateBlockStyles(blockId, { text_color: val });
      } else if (type === 'font' && val) {
        handleUpdateBlockStyles(blockId, { font_family: val });
      } else if (type === 'highlight' && val) {
        handleUpdateBlockStyles(blockId, { highlight_color: val });
      } else if (type === 'bold') {
        const cur = (blocks.find((b) => b.id === blockId)?.styles as any)?.font_weight;
        handleUpdateBlockStyles(blockId, { font_weight: cur === 'bold' || cur === '700' ? 'normal' : 'bold' });
      } else if (type === 'italic') {
        const cur = (blocks.find((b) => b.id === blockId)?.styles as any)?.font_style;
        handleUpdateBlockStyles(blockId, { font_style: cur === 'italic' ? 'normal' : 'italic' });
      } else if (type === 'underline') {
        const cur = (blocks.find((b) => b.id === blockId)?.styles as any)?.text_decoration;
        handleUpdateBlockStyles(blockId, { text_decoration: cur === 'underline' ? 'none' : 'underline' });
      }
    }

    if (el) {
      const newHtml = el.innerHTML;
      if (fieldKey === 'slot' && typeof slotIndex === 'number') {
        const block = blocks.find((b) => b.id === blockId);
        if (block) {
          const cols = [...((block.content as any).columns || [])];
          cols[slotIndex] = {
            ...cols[slotIndex],
            content: { ...(cols[slotIndex]?.content || { type: 'text' }), type: 'text', text: newHtml },
          };
          handleUpdateBlockContent(blockId, { columns: cols });
        }
      } else {
        handleUpdateBlockContent(blockId, { text: newHtml, body: newHtml, title: newHtml, heading: newHtml });
      }
    }

    setActiveFloatingDropdown(null);
  };


  const handleSwitchViewMode = (mode: ViewMode) => {
    const wasHtmlToVisual = viewMode === 'html' && mode === 'visual';
    if (mode !== 'visual') {
      setHtmlToStudioNotice(false);
    }

    if (mode === 'html') {
      // If user hasn't edited rawHtml, initialize it with current rendered blocks
      if (!rawHtml) {
        const currentHtml = renderBlocksToHtml(blocks);
        setRawHtml(currentHtml);
        lastRenderedHtmlRef.current = currentHtml;
      }
    } else if (mode === 'visual') {
      // When entering Visual Studio with custom rawHtml, parse into visual blocks
      if (rawHtml) {
        const parsed = parseHtmlToVisualBlocks(rawHtml);
        if (parsed.length > 0) {
          setBlocks(parsed);
          setSelectedBlockId(parsed[0].id);
          onChange({
            ...content,
            html_body: rawHtml,
            builder_state: {
              theme: DEFAULT_EMAIL_THEME,
              blocks: parsed,
            },
          });
          lastRenderedHtmlRef.current = rawHtml;
        }
        if (wasHtmlToVisual) {
          let muted = false;
          try { muted = localStorage.getItem('marbee.emailStudio.hideHtmlToVisualNotice') === '1'; } catch { /* noop */ }
          if (!muted) {
            setHtmlToStudioMeta({ blocks: parsed.length });
            setHtmlToStudioNotice(true);
            if (htmlToStudioTimerRef.current) clearTimeout(htmlToStudioTimerRef.current);
            htmlToStudioTimerRef.current = setTimeout(() => setHtmlToStudioNotice(false), 12000);
          }
        }
      }
    } else if (mode === 'text') {
      if (!rawText) {
        const plain = renderBlocksToPlainText(blocks);
        setRawText(plain);
      }
    }
    setViewMode(mode);
  };

  const handleAskBuddyGenerate = async (promptToUse?: string) => {
    const query = promptToUse || buddyPrompt;
    if (!query.trim()) return;
    setIsBuddyLoading(true);
    try {
      const response = await executeIntelligentReasoning(
        `Generate complete, production-ready, clean, modern, responsive HTML email code for this request:\n\n"${query}"\n\nReturn ONLY the HTML code starting with <!DOCTYPE html> or <table> without markdown codeblocks or conversational filler so it can directly be used in an email client.`,
        undefined,
        'gemini-2.0-flash',
        'gemini',
        undefined,
        'en-US'
      );
      if (response && response.text) {
        let cleanHtml = response.text;
        // 1. If wrapped in markdown code blocks, extract the code
        const codeBlockMatch = cleanHtml.match(/```(?:html)?\s*([\s\S]*?)```/i);
        if (codeBlockMatch && codeBlockMatch[1]) {
          cleanHtml = codeBlockMatch[1].trim();
        } else {
          // 2. If response has conversational preamble before <!DOCTYPE or <table or <html
          const htmlStartIdx = cleanHtml.search(/<!DOCTYPE|<table|<html/i);
          if (htmlStartIdx !== -1) {
            cleanHtml = cleanHtml.slice(htmlStartIdx).trim();
          } else {
            cleanHtml = cleanHtml.replace(/```html/gi, '').replace(/```/g, '').trim();
          }
        }
        setRawHtml(cleanHtml);
        onChange({ ...content, html_body: cleanHtml });
        const parsed = parseHtmlToVisualBlocks(cleanHtml);
        if (parsed.length > 0) setBlocks(parsed);
        showToast('✨ Ask Buddy generated and applied HTML code!');
        setIsBuddyOpen(false);
      }
    } catch (err: any) {
      showToast('Buddy AI generation completed');
    } finally {
      setIsBuddyLoading(false);
    }
  };

  const handleValidateAmp = () => {
    const result = validateAmpEmailCode(rawAmp);
    setAmpValidation(result);
    if (result.isValid) {
      showToast('✅ AMP Email is 100% valid!');
    } else {
      showToast(`⚠️ ${result.errors.length} AMP issue(s) detected`);
    }
  };

  const handleConvertHtmlToText = () => {
    const htmlSource = rawHtml || renderBlocksToHtml(blocks);
    const converted = convertHtmlToPlainText(htmlSource);
    setRawText(converted);
    onChange({ ...content, text_body: converted, plain_text: converted });
    showToast('📄 Converted HTML to Plain Text fallback!');
  };

  const handleClearAll = () => {
    updateBlocks([]);
    setSelectedBlockId(null);
    setActiveTab('editing');
    showToast('Canvas cleared! All containers erased.');
  };

  const handleRemoveBlock = (id: string) => {
    const updated = blocks.filter((b) => b.id !== id);
    updateBlocks(updated);
    if (selectedBlockId === id) {
      const nextId = updated.length > 0 ? updated[0].id : null;
      setSelectedBlockId(nextId);
    }
    showToast('Container deleted');
  };

  const handleInsertRowStructure = (cols: number[]) => {
    const newRowBlock: EmailBlock = {
      id: `columns-${Date.now().toString(36)}`,
      type: 'columns' as any,
      content: {
        columns: cols.map((width, idx) => ({
          id: `col-${idx}`,
          width,
          content: null,
        })),
      },
      styles: { padding_top: 16, padding_bottom: 16, padding_left: 24, padding_right: 24, column_gap: 16 } as any,
    };
    const updated = [...blocks, newRowBlock];
    updateBlocks(updated);
    setSelectedBlockId(newRowBlock.id);
    setSelectedSlotIndex(0);
    setActiveTab('editing');
    showToast(`Added ${cols.length}-column layout`);
  };

  // Asset Upload Handler (Direct to Assets folder & places into container slot)
  const handleTriggerUpload = (blockId: string, colIdx: number) => {
    setActiveSlotTarget({ blockId, colIdx });
    fileInputRef.current?.click();
  };

  const handleAssetFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    showToast('Uploading image to Assets folder…');
    try {
      const res = await uploadAsset(tenantId, environment, file, '/email-templates');
      const publicUrl = res.asset?.public_url || URL.createObjectURL(file);

      if (activeSlotTarget) {
        const updated = blocks.map((b) => {
          if (b.id === activeSlotTarget.blockId) {
            const cols = (b.content as any).columns || [];
            const newCols = [...cols];
            newCols[activeSlotTarget.colIdx] = {
              ...newCols[activeSlotTarget.colIdx],
              content: { type: 'image', src: publicUrl, url: publicUrl, alt: file.name },
            };
            return { ...b, content: { ...b.content, columns: newCols } };
          }
          return b;
        });
        updateBlocks(updated);
        setActiveSlotTarget(null);
      } else if (selectedBlockId) {
        // Standalone image block replacement
        const updated = blocks.map((b) => {
          if (b.id === selectedBlockId) {
            return {
              ...b,
              content: {
                ...b.content,
                src: publicUrl,
                url: publicUrl,
                alt: file.name,
              },
            };
          }
          return b;
        });
        updateBlocks(updated);
      }
      showToast('Image uploaded and saved to Assets folder!');
    } catch (err) {
      showToast('Image uploaded locally');
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Quick slot insertion handlers
  const handleSlotInsertText = (blockId: string, colIdx: number) => {
    const updated = blocks.map((b) => {
      if (b.id === blockId) {
        const cols = (b.content as any).columns || [];
        const newCols = [...cols];
        newCols[colIdx] = {
          ...newCols[colIdx],
          content: { type: 'text', text: 'Type your text and work on its text styles, add personalisation and lists' },
        };
        return { ...b, content: { ...b.content, columns: newCols } };
      }
      return b;
    });
    updateBlocks(updated);
    showToast('Text added to container');
  };

  const handleSlotInsertButton = (blockId: string, colIdx: number) => {
    const updated = blocks.map((b) => {
      if (b.id === blockId) {
        const cols = (b.content as any).columns || [];
        const newCols = [...cols];
        newCols[colIdx] = {
          ...newCols[colIdx],
          content: { type: 'button', label: 'Click Me Now', url: 'https://' },
        };
        return { ...b, content: { ...b.content, columns: newCols } };
      }
      return b;
    });
    updateBlocks(updated);
    showToast('Button added to container');
  };

  /* Modernised empty-slot drop zone for column structures. Shared by the
   * "no content" and "unknown content type" branches of the canvas render. */
  const renderSlotEmptyState = (blockId: string, colIdx: number, active: boolean) => {
    const quick = [
      { label: 'Text', icon: Type, run: () => handleSlotInsertText(blockId, colIdx) },
      { label: 'Image', icon: ImageIcon, run: () => handleTriggerUpload(blockId, colIdx) },
      { label: 'Button', icon: Zap, run: () => handleSlotInsertButton(blockId, colIdx) },
    ];
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-2 py-3 text-center">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
            active
              ? 'bg-violet-600 text-white shadow-md shadow-violet-500/30'
              : 'bg-white text-violet-500 border border-slate-200 group-hover/slot:border-violet-300'
          }`}
        >
          <ArrowDownToLine className="h-4 w-4" />
        </div>
        <div className="space-y-0.5">
          <div className={`text-[11px] font-bold ${active ? 'text-violet-700' : 'text-slate-600'}`}>
            {active ? 'Add content to this column' : 'Empty column'}
          </div>
          <div className="text-[9.5px] font-medium text-slate-400">
            Drop a module here or pick a quick element
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1 pt-0.5">
          {quick.map(({ label, icon: Icon, run }) => (
            <button
              key={label}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                run();
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 shadow-2xs transition hover:border-violet-300 hover:text-violet-700 hover:shadow-xs"
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  /* Subject / preheader personalization control used in the Settings tab:
   * token picker with insert-at-cursor, fallback helper, and a live preview
   * rendered against the selected test profile. */
  const renderPersonalizeField = (opts: {
    which: 'subject' | 'preheader';
    label: string;
    hint: string;
    value: string;
    placeholder: string;
    inputRef: React.RefObject<HTMLInputElement | null>;
    onChange: (v: string) => void;
  }) => {
    const { which, label, hint, value, placeholder, inputRef, onChange } = opts;
    const open = personalizeMenuFor === which;

    const insertAtCursor = (snippet: string) => {
      const el = inputRef.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? value.length;
      const next = value.slice(0, start) + snippet + value.slice(end);
      onChange(next);
      setPersonalizeMenuFor(null);
      requestAnimationFrame(() => {
        el?.focus();
        const caret = start + snippet.length;
        try { el?.setSelectionRange(caret, caret); } catch { /* noop */ }
      });
    };

    const addFallbackToLastTag = () => {
      // Insert a `| default: "…"` fallback into the last {{ tag }} that lacks one.
      const next = value.replace(/\{\{\s*([^}|]+?)\s*\}\}(?!.*\}\})/, (_m, inner) => `{{ ${inner.trim()} | default: "there" }}`);
      if (next === value) {
        showToast('Add a merge tag first, then a fallback');
        return;
      }
      onChange(next);
    };

    const preview = applyPersonalization(value || placeholder, selectedTestProfile);

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="font-bold text-slate-700">{label}</label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={addFallbackToLastTag}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 transition hover:border-violet-300 hover:text-violet-700"
              title='Add a { | default: "…" } fallback to the last merge tag'
            >
              + Fallback
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setPersonalizeMenuFor(open ? null : which)}
                className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold transition ${
                  open
                    ? 'border-violet-400 bg-violet-600 text-white'
                    : 'border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400'
                }`}
              >
                <Sparkles className="h-3 w-3" />
                Personalize
              </button>
              {open && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setPersonalizeMenuFor(null)} />
                  <div className="absolute right-0 top-7 z-50 max-h-72 w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl [scrollbar-width:thin]">
                    {CUSTOMER_MERGE_TAGS.map((g, gi) => (
                      <div key={gi} className="mb-1.5 last:mb-0">
                        <div className="px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">{g.group}</div>
                        {g.tags.map((t, ti) => (
                          <button
                            key={ti}
                            type="button"
                            onClick={() => insertAtCursor(t.tag)}
                            className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-violet-50"
                          >
                            <span className="truncate text-[11px] font-medium text-slate-700">{t.label}</span>
                            <span className="shrink-0 font-mono text-[9px] text-slate-400">{t.tag}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-8.5 w-full rounded-lg border border-slate-200 px-3 text-xs focus:border-violet-500 focus:outline-hidden"
        />
        <div className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5">
          <Eye className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
              Preview · {selectedTestProfile?.firstName || 'Sample'}
            </div>
            <div className="truncate text-[11px] font-medium text-slate-700">{preview}</div>
          </div>
        </div>
        <p className="text-[10px] text-slate-400">{hint}</p>
      </div>
    );
  };

  /* ============================================================== *
   * Right inspector panel — one consistent, contextual editor per
   * selected element. Inline formatting (bold, colour, links, …) now
   * happens on the canvas; this panel owns block-level style + content.
   * ============================================================== */
  const renderSpacingControls = (st: any, setS: (p: any) => void) => (
    <>
      <FieldRow label="Padding — top / bottom" stack>
        <RangeControl
          value={st.padding_top ?? 16}
          min={0}
          max={80}
          step={2}
          suffix="px"
          onChange={(n) => setS({ padding_top: n, padding_bottom: n })}
        />
      </FieldRow>
      <FieldRow label="Padding — left / right" stack>
        <RangeControl
          value={st.padding_left ?? 24}
          min={0}
          max={80}
          step={2}
          suffix="px"
          onChange={(n) => setS({ padding_left: n, padding_right: n })}
        />
      </FieldRow>
      <FieldRow label="Background">
        <ColorControl value={st.bg_color} fallback="#ffffff" onChange={(v) => setS({ bg_color: v })} />
      </FieldRow>
    </>
  );

  const renderInspector = () => {
    const b = selectedBlock;
    if (!b) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <Pencil className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-800">Nothing selected</h4>
            <p className="text-[11px] text-slate-500">Click a block on the canvas to edit it.</p>
          </div>
        </div>
      );
    }

    const st: any = b.styles || {};
    const ct: any = b.content || {};
    const setS = (patch: any) => handleUpdateBlockStyles(b.id, patch);
    const setC = (patch: any) => handleUpdateBlockContent(b.id, patch);
    const locked = Boolean((b as any).locked);
    const isText = b.type === 'title' || b.type === 'paragraph' || b.type === 'text';
    const isCols = Boolean(ct.columns);
    const slot = selectedSlotIndex || 0;
    const fieldKey = b.type === 'title' ? 'text' : ct.body !== undefined ? 'body' : 'text';

    const TypeIcon = isCols
      ? Grid
      : b.type === 'button'
      ? Zap
      : b.type === 'image'
      ? ImageIcon
      : b.type === 'list'
      ? List
      : b.type === 'divider'
      ? Minus
      : b.type === 'spacer'
      ? Move
      : b.type === 'video'
      ? Video
      : b.type === 'html'
      ? Code
      : b.type === 'table'
      ? Table
      : Type;
    const headerLabel = isCols ? 'Row / columns' : b.type.replace(/_/g, ' ');

    const openLinkForSelection = () => {
      const sel = window.getSelection();
      const selected = sel ? sel.toString().trim() : '';
      const editable = document.querySelector(`[data-block-id="${b.id}"]`) as HTMLElement | null;
      if (editable) {
        const offset = getSelectionOffset(editable);
        if (offset) savedSelectionStateRef.current = { blockId: b.id, ...offset };
      }
      setLinkModal({
        open: true,
        blockId: b.id,
        fieldKey,
        url: 'https://',
        text: selected || 'Click here',
        start: 0,
        end: 0,
        canvas: true,
        hadSelection: selected.length > 0,
      });
    };

    return (
      <>
        {/* Element header + quick actions */}
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-600 text-white">
              <TypeIcon className="h-3.5 w-3.5" />
            </span>
            <span className="truncate text-xs font-bold capitalize text-slate-800">{headerLabel}</span>
          </div>
          <div className="flex items-center gap-0.5">
            {[
              { key: 'up', icon: ArrowUp, t: 'Move up', fn: () => handleMoveBlock(b.id, 'up') },
              { key: 'down', icon: ArrowDown, t: 'Move down', fn: () => handleMoveBlock(b.id, 'down') },
              {
                key: 'lock',
                icon: locked ? Lock : Unlock,
                t: locked ? 'Unlock' : 'Lock',
                fn: () => handleToggleLock(b.id),
                on: locked,
              },
              { key: 'dup', icon: Copy, t: 'Duplicate', fn: () => handleDuplicateBlock(b.id) },
              { key: 'del', icon: Trash2, t: 'Delete', fn: () => handleRemoveBlock(b.id), danger: true },
            ].map(({ key, icon: Ic, t, fn, on, danger }) => (
              <button
                key={key}
                type="button"
                title={t}
                onClick={fn}
                className={`cursor-pointer rounded-md border p-1 transition ${
                  on
                    ? 'border-amber-500 bg-amber-500 text-white'
                    : danger
                    ? 'border-slate-200 bg-white text-rose-500 hover:bg-rose-50'
                    : 'border-slate-200 bg-white text-slate-500 hover:text-slate-900'
                }`}
              >
                <Ic className="h-3 w-3" />
              </button>
            ))}
          </div>
        </div>

        {locked && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
            <span className="text-[11px] font-semibold">Locked — unlock to edit content &amp; style.</span>
            <button
              type="button"
              onClick={() => handleToggleLock(b.id)}
              className="shrink-0 cursor-pointer rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white"
            >
              Unlock
            </button>
          </div>
        )}

        {!locked && (
          <>
            {/* ---------- ROW / COLUMNS ---------- */}
            {isCols && (
              <>
                <InspectorSection title="Column layout" icon={Grid}>
                  <SegControl
                    cols={4}
                    value={(ct.columns as any[]).map((c: any) => c.width).join('-')}
                    options={[
                      { value: '100', label: '1' },
                      { value: '50-50', label: '2' },
                      { value: '33-33-33', label: '3' },
                      { value: '25-25-25-25', label: '4' },
                      { value: '70-30', label: '70/30' },
                      { value: '30-70', label: '30/70' },
                      { value: '60-20-20', label: '60/20' },
                      { value: '40-40-20', label: '40/40' },
                    ]}
                    onChange={(v) => {
                      const widths = String(v).split('-').map(Number);
                      const newCols = widths.map((w, i) => ({
                        id: `col-${i}`,
                        width: w,
                        content: (ct.columns as any[])[i]?.content || null,
                      }));
                      setC({ columns: newCols });
                      if (slot >= newCols.length) setSelectedSlotIndex(0);
                    }}
                  />
                  <FieldRow label="Gap between columns" stack>
                    <RangeControl
                      value={st.column_gap ?? 16}
                      min={0}
                      max={48}
                      step={2}
                      suffix="px"
                      onChange={(n) => setS({ column_gap: n })}
                    />
                  </FieldRow>
                  <FieldRow label="Vertical align">
                    <SegControl
                      value={st.vertical_align || 'top'}
                      options={[
                        { value: 'top', label: 'Top' },
                        { value: 'middle', label: 'Mid' },
                        { value: 'bottom', label: 'Btm' },
                      ]}
                      onChange={(v) => setS({ vertical_align: v })}
                    />
                  </FieldRow>
                </InspectorSection>

                <InspectorSection title={`Column ${slot + 1} content`} icon={LayoutGrid}>
                  <div className="flex gap-1">
                    {(ct.columns as any[]).map((_: any, i: number) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedSlotIndex(i)}
                        className={`flex-1 cursor-pointer rounded-lg border py-1 text-[10px] font-bold transition ${
                          slot === i
                            ? 'border-violet-600 bg-violet-600 text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>

                  {(() => {
                    const sc = (ct.columns as any[])[slot]?.content;
                    if (!sc) {
                      return (
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSlotInsertText(b.id, slot)}
                            className="cursor-pointer rounded-lg border border-slate-200 bg-white py-1.5 text-[10px] font-bold text-slate-600 hover:border-violet-400 hover:text-violet-700"
                          >
                            + Text
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTriggerUpload(b.id, slot)}
                            className="cursor-pointer rounded-lg border border-slate-200 bg-white py-1.5 text-[10px] font-bold text-slate-600 hover:border-violet-400 hover:text-violet-700"
                          >
                            + Image
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSlotInsertButton(b.id, slot)}
                            className="cursor-pointer rounded-lg border border-slate-200 bg-white py-1.5 text-[10px] font-bold text-slate-600 hover:border-violet-400 hover:text-violet-700"
                          >
                            + Button
                          </button>
                        </div>
                      );
                    }
                    const patchSlot = (patch: any) => {
                      const cols = [...(ct.columns as any[])];
                      cols[slot] = { ...cols[slot], content: { ...cols[slot].content, ...patch } };
                      setC({ columns: cols });
                    };
                    if (sc.type === 'image') {
                      return (
                        <>
                          <FieldRow label="Image URL" stack>
                            <PanelInput mono value={sc.src || ''} onChange={(v) => patchSlot({ src: v, url: v })} placeholder="https://…" />
                          </FieldRow>
                          <FieldRow label="Alt text" stack>
                            <PanelInput value={sc.alt || ''} onChange={(v) => patchSlot({ alt: v })} placeholder="Describe the image" />
                          </FieldRow>
                          <button
                            type="button"
                            onClick={() => handleTriggerUpload(b.id, slot)}
                            className="w-full cursor-pointer rounded-lg border border-slate-200 bg-white py-1.5 text-[10px] font-bold text-violet-700 hover:bg-violet-50"
                          >
                            Replace image…
                          </button>
                        </>
                      );
                    }
                    if (sc.type === 'button') {
                      return (
                        <>
                          <FieldRow label="Label" stack>
                            <PanelInput value={sc.label || sc.text || ''} onChange={(v) => patchSlot({ label: v, text: v })} />
                          </FieldRow>
                          <FieldRow label="Link URL" stack>
                            <PanelInput mono value={sc.url || ''} onChange={(v) => patchSlot({ url: v })} placeholder="https://…" />
                          </FieldRow>
                        </>
                      );
                    }
                    return (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-2 text-center text-[10px] text-slate-500">
                        Edit this text directly on the canvas. Select words to style them.
                      </p>
                    );
                  })()}
                </InspectorSection>
              </>
            )}

            {/* ---------- TEXT / TITLE / PARAGRAPH ---------- */}
            {isText && (
              <>
                <InspectorSection title="Text" icon={Type}>
                  {b.type === 'title' && (
                    <FieldRow label="Heading level" stack>
                      <SegControl
                        cols={4}
                        value={ct.heading_level || 'h1'}
                        options={[
                          { value: 'h1', label: 'H1' },
                          { value: 'h2', label: 'H2' },
                          { value: 'h3', label: 'H3' },
                          { value: 'h4', label: 'H4' },
                        ]}
                        onChange={(v) => {
                          const map: any = { h1: 28, h2: 24, h3: 20, h4: 16 };
                          const wmap: any = { h1: '800', h2: '700', h3: '700', h4: '600' };
                          setC({ heading_level: v });
                          setS({ font_size: map[v], font_weight: wmap[v] });
                        }}
                      />
                    </FieldRow>
                  )}
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={openLinkForSelection}
                      className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-blue-100 bg-blue-50 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
                    >
                      <Link className="h-3 w-3" /> Link selection
                    </button>
                    <button
                      type="button"
                      onClick={() => setMergeTagMenu(mergeTagMenu === 'body' ? null : 'body')}
                      className="relative flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-violet-200 bg-violet-50 py-1.5 text-[11px] font-bold text-violet-700 hover:bg-violet-100"
                    >
                      <User className="h-3 w-3" /> Personalize
                      {mergeTagMenu === 'body' && (
                        <div className="absolute right-0 top-9 z-50 w-60 space-y-1.5 rounded-xl border border-slate-200 bg-white p-2 text-left shadow-2xl animate-in fade-in zoom-in-95">
                          <div className="max-h-56 space-y-2 overflow-y-auto [scrollbar-width:thin]">
                            {CUSTOMER_MERGE_TAGS.map((group, gi) => (
                              <div key={gi} className="space-y-0.5">
                                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                  {group.group}
                                </span>
                                {group.tags.map((t, ti) => (
                                  <button
                                    key={ti}
                                    type="button"
                                    onClick={() => {
                                      handleInsertCustomerTag(t.tag);
                                      setMergeTagMenu(null);
                                    }}
                                    className="flex w-full items-center justify-between rounded px-1.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-violet-50"
                                  >
                                    <span>{t.label}</span>
                                    <span className="font-mono text-[9px] text-slate-400">{t.tag}</span>
                                  </button>
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] leading-tight text-slate-400">
                    Tip: type on the canvas. Select words there to make them bold, coloured, linked, etc.
                  </p>
                </InspectorSection>

                <InspectorSection title="Typography" icon={Type}>
                  <FieldRow label="Font">
                    <select
                      value={st.font_family || 'Inter, sans-serif'}
                      onChange={(e) => setS({ font_family: e.target.value })}
                      className="h-8 w-36 cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-xs focus:border-violet-500 focus:outline-hidden"
                    >
                      {PANEL_FONTS.map((f) => (
                        <option key={f.val} value={f.val}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </FieldRow>
                  <FieldRow label="Size" stack>
                    <RangeControl
                      value={st.font_size ?? (b.type === 'title' ? 28 : 15)}
                      min={10}
                      max={64}
                      suffix="px"
                      onChange={(n) => setS({ font_size: n })}
                    />
                  </FieldRow>
                  <FieldRow label="Weight">
                    <SegControl
                      value={String(st.font_weight || (b.type === 'title' ? '800' : '400'))}
                      options={[
                        { value: '400', label: 'Reg' },
                        { value: '600', label: 'Med' },
                        { value: '700', label: 'Bold' },
                        { value: '800', label: 'X' },
                      ]}
                      onChange={(v) => setS({ font_weight: v })}
                    />
                  </FieldRow>
                  <FieldRow label="Line height" stack>
                    <RangeControl
                      value={Number(st.line_height ?? (b.type === 'title' ? 1.2 : 1.6))}
                      min={1}
                      max={2.4}
                      step={0.1}
                      onChange={(n) => setS({ line_height: n })}
                    />
                  </FieldRow>
                  <FieldRow label="Letter spacing" stack>
                    <RangeControl
                      value={Number(st.letter_spacing ?? 0)}
                      min={-2}
                      max={4}
                      step={0.5}
                      suffix="px"
                      onChange={(n) => setS({ letter_spacing: n })}
                    />
                  </FieldRow>
                </InspectorSection>

                <InspectorSection title="Colour & alignment" icon={Type}>
                  <FieldRow label="Text colour">
                    <ColorControl value={st.text_color} fallback="#0f172a" onChange={(v) => setS({ text_color: v })} />
                  </FieldRow>
                  <FieldRow label="Block highlight">
                    <ColorControl value={st.highlight_color} fallback="#ffffff" onChange={(v) => setS({ highlight_color: v })} />
                  </FieldRow>
                  <FieldRow label="Align" stack>
                    <SegControl
                      cols={4}
                      value={st.alignment || 'left'}
                      options={[
                        { value: 'left', label: <AlignLeft className="h-3.5 w-3.5" /> },
                        { value: 'center', label: <AlignCenter className="h-3.5 w-3.5" /> },
                        { value: 'right', label: <AlignRight className="h-3.5 w-3.5" /> },
                        { value: 'justify', label: <AlignJustify className="h-3.5 w-3.5" /> },
                      ]}
                      onChange={(v) => setS({ alignment: v })}
                    />
                  </FieldRow>
                </InspectorSection>
              </>
            )}

            {/* ---------- BUTTON ---------- */}
            {b.type === 'button' && (
              <InspectorSection title="Button" icon={Zap}>
                <FieldRow label="Label" stack>
                  <PanelInput value={ct.label || ct.text || ''} onChange={(v) => setC({ label: v, text: v })} placeholder="Click here" />
                </FieldRow>
                <FieldRow label="Link URL" stack>
                  <PanelInput mono value={ct.url || ''} onChange={(v) => setC({ url: v })} placeholder="https://…" />
                </FieldRow>
                <FieldRow label="Button colour">
                  <ColorControl
                    value={st.button_bg || st.bg_color}
                    fallback="#6d28d9"
                    onChange={(v) => setS({ button_bg: v, bg_color: v })}
                  />
                </FieldRow>
                <FieldRow label="Text colour">
                  <ColorControl
                    value={st.button_color || st.text_color}
                    fallback="#ffffff"
                    onChange={(v) => setS({ button_color: v, text_color: v })}
                  />
                </FieldRow>
                <FieldRow label="Corner radius" stack>
                  <RangeControl value={st.border_radius ?? 8} min={0} max={40} suffix="px" onChange={(n) => setS({ border_radius: n })} />
                </FieldRow>
                <FieldRow label="Align" stack>
                  <SegControl
                    value={st.alignment || 'center'}
                    options={[
                      { value: 'left', label: 'Left' },
                      { value: 'center', label: 'Center' },
                      { value: 'right', label: 'Right' },
                    ]}
                    onChange={(v) => setS({ alignment: v })}
                  />
                </FieldRow>
                <FieldRow label="Full width">
                  <SegControl
                    value={st.full_width ? 'yes' : 'no'}
                    options={[
                      { value: 'no', label: 'No' },
                      { value: 'yes', label: 'Yes' },
                    ]}
                    onChange={(v) => setS({ full_width: v === 'yes' })}
                  />
                </FieldRow>
              </InspectorSection>
            )}

            {/* ---------- IMAGE ---------- */}
            {b.type === 'image' && (
              <InspectorSection title="Image" icon={ImageIcon}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-violet-600 py-2 text-xs font-bold text-white hover:bg-violet-500"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload / replace
                </button>
                <FieldRow label="Image URL" stack>
                  <PanelInput mono value={ct.src || ct.url || ''} onChange={(v) => setC({ src: v, url: v })} placeholder="https://…" />
                </FieldRow>
                <FieldRow label="Alt text" stack>
                  <PanelInput value={ct.alt || ''} onChange={(v) => setC({ alt: v })} placeholder="Describe the image" />
                </FieldRow>
                <FieldRow label="Links to" stack>
                  <PanelInput mono value={ct.link_url || ''} onChange={(v) => setC({ link_url: v })} placeholder="https://… (optional)" />
                </FieldRow>
                <FieldRow label="Width" stack>
                  <RangeControl value={st.image_width ?? 100} min={20} max={100} suffix="%" onChange={(n) => setS({ image_width: n })} />
                </FieldRow>
                <FieldRow label="Corner radius" stack>
                  <RangeControl value={st.border_radius ?? 0} min={0} max={40} suffix="px" onChange={(n) => setS({ border_radius: n })} />
                </FieldRow>
                <FieldRow label="Align" stack>
                  <SegControl
                    value={st.alignment || 'center'}
                    options={[
                      { value: 'left', label: 'Left' },
                      { value: 'center', label: 'Center' },
                      { value: 'right', label: 'Right' },
                    ]}
                    onChange={(v) => setS({ alignment: v })}
                  />
                </FieldRow>
              </InspectorSection>
            )}

            {/* ---------- IMAGE CTA OVERLAY ---------- */}
            {b.type === 'image' && (
              <InspectorSection title="CTA on image" icon={Zap} defaultOpen={Boolean(ct.cta_enabled)}>
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                  <span className="text-[11px] font-bold text-slate-700">Show button over image</span>
                  <input
                    type="checkbox"
                    checked={Boolean(ct.cta_enabled)}
                    onChange={(e) => setC({ cta_enabled: e.target.checked })}
                    className="h-3.5 w-3.5 accent-violet-600"
                  />
                </label>
                {ct.cta_enabled && (
                  <>
                    <FieldRow label="Button text" stack>
                      <PanelInput value={ct.cta_text || ''} onChange={(v) => setC({ cta_text: v })} placeholder="Shop now" />
                    </FieldRow>
                    <FieldRow label="Button URL" stack>
                      <PanelInput mono value={ct.cta_url || ''} onChange={(v) => setC({ cta_url: v })} placeholder="https://… (defaults to image link)" />
                    </FieldRow>
                    <FieldRow label="Position" stack>
                      <div className="grid grid-cols-3 gap-1">
                        {['top-left', 'top-center', 'top-right', 'center-left', 'center-center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'].map((p) => {
                          const active = (ct.cta_position || 'center-center') === p;
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setC({ cta_position: p })}
                              title={p.replace('-', ' ')}
                              className={`flex h-7 items-center justify-center rounded-md border text-[9px] font-bold transition ${
                                active
                                  ? 'border-violet-600 bg-violet-600 text-white'
                                  : 'border-slate-200 bg-white text-slate-400 hover:border-violet-300'
                              }`}
                            >
                              ●
                            </button>
                          );
                        })}
                      </div>
                    </FieldRow>
                    <FieldRow label="Button colour">
                      <ColorControl value={ct.cta_bg} fallback="#7c3aed" onChange={(v) => setC({ cta_bg: v })} />
                    </FieldRow>
                    <FieldRow label="Text colour">
                      <ColorControl value={ct.cta_color} fallback="#ffffff" onChange={(v) => setC({ cta_color: v })} />
                    </FieldRow>
                    <p className="text-[10px] text-slate-400">Outlook falls back to a button directly under the image.</p>
                  </>
                )}
              </InspectorSection>
            )}

            {/* ---------- LIST ---------- */}
            {b.type === 'list' && (
              <InspectorSection title="List" icon={List}>
                <FieldRow label="Style">
                  <SegControl
                    value={ct.list_type || 'bullet'}
                    options={[
                      { value: 'bullet', label: '• Bullets' },
                      { value: 'numbered', label: '1. Numbered' },
                    ]}
                    onChange={(v) => setC({ list_type: v })}
                  />
                </FieldRow>
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-700">Items</div>
                  {((Array.isArray(ct.items) ? ct.items : ['Item 1', 'Item 2']) as string[]).map((it, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <PanelInput
                        value={it}
                        onChange={(v) => {
                          const cur = [...(ct.items || [])];
                          cur[i] = v;
                          setC({ items: cur });
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setC({ items: (ct.items || []).filter((_: any, x: number) => x !== i) })}
                        className="cursor-pointer rounded p-1 text-rose-500 hover:bg-rose-50"
                        title="Remove"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setC({ items: [...(ct.items || []), 'New item'] })}
                    className="w-full cursor-pointer rounded-lg border border-dashed border-violet-300 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-50"
                  >
                    + Add item
                  </button>
                </div>
                <FieldRow label="Text size" stack>
                  <RangeControl value={st.font_size ?? 14} min={10} max={24} suffix="px" onChange={(n) => setS({ font_size: n })} />
                </FieldRow>
                <FieldRow label="Text colour">
                  <ColorControl value={st.text_color} fallback="#334155" onChange={(v) => setS({ text_color: v })} />
                </FieldRow>
              </InspectorSection>
            )}

            {/* ---------- TABLE ---------- */}
            {b.type === 'table' && (
              <InspectorSection title="Table" icon={Table}>
                <FieldRow label="Headers (comma-separated)" stack>
                  <PanelInput
                    value={(ct.headers || []).join(', ')}
                    onChange={(v) => setC({ headers: v.split(',').map((s) => s.trim()) })}
                  />
                </FieldRow>
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-700">Rows</div>
                  {((Array.isArray(ct.rows) ? ct.rows : []) as string[][]).map((row, ri) => (
                    <div key={ri} className="flex items-center gap-1">
                      <PanelInput
                        value={row.join(' | ')}
                        onChange={(v) => {
                          const rows = [...(ct.rows || [])];
                          rows[ri] = v.split('|').map((s) => s.trim());
                          setC({ rows });
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setC({ rows: (ct.rows || []).filter((_: any, x: number) => x !== ri) })}
                        className="cursor-pointer rounded p-1 text-rose-500 hover:bg-rose-50"
                        title="Remove row"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setC({ rows: [...(ct.rows || []), (ct.headers || ['', '', '']).map(() => 'New')] })
                    }
                    className="w-full cursor-pointer rounded-lg border border-dashed border-violet-300 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-50"
                  >
                    + Add row
                  </button>
                  <p className="text-[10px] text-slate-400">Separate cells with “ | ”.</p>
                </div>
              </InspectorSection>
            )}

            {/* ---------- DIVIDER ---------- */}
            {b.type === 'divider' && (
              <InspectorSection title="Divider" icon={Minus}>
                <FieldRow label="Style">
                  <SegControl
                    value={st.border_style || 'solid'}
                    options={[
                      { value: 'solid', label: 'Solid' },
                      { value: 'dashed', label: 'Dashed' },
                      { value: 'dotted', label: 'Dotted' },
                    ]}
                    onChange={(v) => setS({ border_style: v })}
                  />
                </FieldRow>
                <FieldRow label="Thickness" stack>
                  <RangeControl value={st.border_width ?? 1} min={1} max={10} suffix="px" onChange={(n) => setS({ border_width: n })} />
                </FieldRow>
                <FieldRow label="Colour">
                  <ColorControl value={st.border_color || st.text_color} fallback="#e2e8f0" onChange={(v) => setS({ border_color: v, text_color: v })} />
                </FieldRow>
              </InspectorSection>
            )}

            {/* ---------- SPACER ---------- */}
            {b.type === 'spacer' && (
              <InspectorSection title="Spacer" icon={Move}>
                <FieldRow label="Height" stack>
                  <RangeControl value={ct.height ?? 28} min={8} max={140} step={2} suffix="px" onChange={(n) => setC({ height: n })} />
                </FieldRow>
              </InspectorSection>
            )}

            {/* ---------- VIDEO ---------- */}
            {b.type === 'video' && (
              <InspectorSection title="Video" icon={Video}>
                <FieldRow label="Title" stack>
                  <PanelInput value={ct.title || ''} onChange={(v) => setC({ title: v })} placeholder="Watch the demo" />
                </FieldRow>
                <FieldRow label="Video URL" stack>
                  <PanelInput mono value={ct.video_url || ''} onChange={(v) => setC({ video_url: v })} placeholder="https://youtube.com/…" />
                </FieldRow>
                <FieldRow label="Thumbnail URL" stack>
                  <PanelInput mono value={ct.thumbnail_url || ''} onChange={(v) => setC({ thumbnail_url: v })} placeholder="https://…" />
                </FieldRow>
                <FieldRow label="Align" stack>
                  <SegControl
                    value={st.alignment || 'center'}
                    options={[
                      { value: 'left', label: 'Left' },
                      { value: 'center', label: 'Center' },
                      { value: 'right', label: 'Right' },
                    ]}
                    onChange={(v) => setS({ alignment: v })}
                  />
                </FieldRow>
              </InspectorSection>
            )}

            {/* ---------- HTML ---------- */}
            {b.type === 'html' && (
              <InspectorSection title="Custom HTML" icon={Code}>
                <textarea
                  value={ct.code || ''}
                  onChange={(e) => setC({ code: e.target.value })}
                  rows={8}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white p-2 font-mono text-[11px] focus:border-violet-500 focus:outline-hidden"
                  placeholder="<div>…</div>"
                />
              </InspectorSection>
            )}

            {/* ---------- ICONS ---------- */}
            {b.type === 'icons' && (
              <InspectorSection title="Icons" icon={Star}>
                {((Array.isArray(ct.items) ? ct.items : []) as any[]).map((it, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <PanelInput
                      value={it.icon || ''}
                      onChange={(v) => {
                        const items = [...(ct.items || [])];
                        items[i] = { ...items[i], icon: v };
                        setC({ items });
                      }}
                    />
                    <PanelInput
                      value={it.label || ''}
                      onChange={(v) => {
                        const items = [...(ct.items || [])];
                        items[i] = { ...items[i], label: v };
                        setC({ items });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setC({ items: (ct.items || []).filter((_: any, x: number) => x !== i) })}
                      className="cursor-pointer rounded p-1 text-rose-500 hover:bg-rose-50"
                      title="Remove"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setC({ items: [...(ct.items || []), { icon: '⭐', label: 'New' }] })}
                  className="w-full cursor-pointer rounded-lg border border-dashed border-violet-300 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-50"
                >
                  + Add icon
                </button>
              </InspectorSection>
            )}

            {/* ---------- COUPON ---------- */}
            {b.type === 'coupon' && (
              <InspectorSection title="Coupon" icon={Tag}>
                <FieldRow label="Discount label" stack>
                  <PanelInput value={ct.discount_label || ''} onChange={(v) => setC({ discount_label: v })} placeholder="20% OFF" />
                </FieldRow>
                <FieldRow label="Promo code" stack>
                  <PanelInput mono value={ct.code || ''} onChange={(v) => setC({ code: v })} placeholder="WELCOME20 or {{discount_code}}" />
                </FieldRow>
                <FieldRow label="Expiry text" stack>
                  <PanelInput value={ct.expiry_text || ''} onChange={(v) => setC({ expiry_text: v })} placeholder="Expires in 48 hours" />
                </FieldRow>
              </InspectorSection>
            )}

            {/* ---------- COUNTDOWN ---------- */}
            {b.type === 'countdown' && (
              <InspectorSection title="Countdown" icon={Clock}>
                <FieldRow label="Headline" stack>
                  <PanelInput value={ct.label || ''} onChange={(v) => setC({ label: v })} placeholder="⏳ FLASH SALE ENDS SOON" />
                </FieldRow>
                <FieldRow label="Deadline" stack>
                  <input
                    type="datetime-local"
                    value={ct.deadline || ''}
                    onChange={(e) => setC({ deadline: e.target.value })}
                    className="h-8 w-full rounded-lg border border-slate-200 px-2 text-xs focus:border-violet-500 focus:outline-hidden"
                  />
                </FieldRow>
                <FieldRow label="Subtext" stack>
                  <PanelInput value={ct.subtext || ''} onChange={(v) => setC({ subtext: v })} placeholder="Prices revert once the timer expires" />
                </FieldRow>
                <p className="text-[10px] text-slate-400">Live digits render in the recipient's inbox from the deadline.</p>
              </InspectorSection>
            )}

            {/* ---------- PRODUCT CARD ---------- */}
            {b.type === 'product_card' && (
              <InspectorSection title="Product card" icon={ImageIcon}>
                <FieldRow label="Image URL" stack>
                  <PanelInput mono value={ct.image_url || ''} onChange={(v) => setC({ image_url: v })} placeholder="https://…" />
                </FieldRow>
                <FieldRow label="Badge" stack>
                  <PanelInput value={ct.badge || ''} onChange={(v) => setC({ badge: v })} placeholder="POPULAR (optional)" />
                </FieldRow>
                <FieldRow label="Title" stack>
                  <PanelInput value={ct.title || ''} onChange={(v) => setC({ title: v })} placeholder="Product name" />
                </FieldRow>
                <FieldRow label="Description" stack>
                  <PanelInput value={ct.description || ''} onChange={(v) => setC({ description: v })} placeholder="Short blurb" />
                </FieldRow>
                <FieldRow label="Price">
                  <PanelInput value={ct.price || ''} onChange={(v) => setC({ price: v })} placeholder="$49/mo" />
                </FieldRow>
                <FieldRow label="Original price">
                  <PanelInput value={ct.original_price || ''} onChange={(v) => setC({ original_price: v })} placeholder="$99/mo (optional)" />
                </FieldRow>
                <FieldRow label="Button text" stack>
                  <PanelInput value={ct.button_text || ''} onChange={(v) => setC({ button_text: v })} placeholder="Claim Offer" />
                </FieldRow>
                <FieldRow label="Button URL" stack>
                  <PanelInput mono value={ct.button_url || ''} onChange={(v) => setC({ button_url: v })} placeholder="https://…" />
                </FieldRow>
              </InspectorSection>
            )}

            {/* ---------- TESTIMONIAL ---------- */}
            {b.type === 'testimonial' && (
              <InspectorSection title="Testimonial" icon={Star}>
                <FieldRow label="Quote" stack>
                  <PanelInput value={ct.quote || ''} onChange={(v) => setC({ quote: v })} placeholder='"This product changed everything."' />
                </FieldRow>
                <FieldRow label="Author" stack>
                  <PanelInput value={ct.author || ''} onChange={(v) => setC({ author: v })} placeholder="Sarah Jenkins" />
                </FieldRow>
                <FieldRow label="Role / company" stack>
                  <PanelInput value={ct.role || ''} onChange={(v) => setC({ role: v })} placeholder="VP Marketing, TechFlow" />
                </FieldRow>
              </InspectorSection>
            )}

            {/* ---------- FOOTER ---------- */}
            {b.type === 'footer' && (
              <InspectorSection title="Footer" icon={Move}>
                <FieldRow label="Company" stack>
                  <PanelInput value={ct.company || ''} onChange={(v) => setC({ company: v })} placeholder="Marbee Technologies Inc." />
                </FieldRow>
                <FieldRow label="Mailing address" stack>
                  <PanelInput value={ct.address || ''} onChange={(v) => setC({ address: v })} placeholder="100 Innovation Blvd…" />
                </FieldRow>
                <FieldRow label="Unsubscribe URL" stack>
                  <PanelInput mono value={ct.unsubscribe_url || ''} onChange={(v) => setC({ unsubscribe_url: v })} placeholder="https://…/unsubscribe" />
                </FieldRow>
              </InspectorSection>
            )}

            {/* ---------- UNIVERSAL SPACING ---------- */}
            <InspectorSection title="Spacing & background" icon={Move} defaultOpen={false}>
              {renderSpacingControls(st, setS)}
            </InspectorSection>
          </>
        )}
      </>
    );
  };

  // 15 CONTENT TILES (Matching Image 2: media_1787167517837.png)

  // Helper to build iframe srcDoc for preview (shared between desktop & mobile)
  const buildIframeSrc = (isMobile: boolean): string => {
    let html = rawHtml || renderBlocksToHtml(blocks);
    // Apply dynamic test profile personalization
    html = applyPersonalization(html, selectedTestProfile);
    html = html
      .replace(/<%@\s*include[^>]*%>/gi, '')
      .replace(/<%[\s\S]*?%>/gi, '')
      .replace(/max-device-width/gi, 'max-width')
      .replace(/min-device-width/gi, 'min-width');

    if (isMobile) {
      html = html
        .replace(/width=["'](5[0-9]{2}|6[0-9]{2}|7[0-9]{2}|8[0-9]{2})["']/gi, 'width="100%"')
        .replace(/width:\s*(5[0-9]{2}|6[0-9]{2}|7[0-9]{2}|8[0-9]{2})px/gi, 'width: 100%')
        .replace(/max-width:\s*(5[0-9]{2}|6[0-9]{2}|7[0-9]{2}|8[0-9]{2})px/gi, 'max-width: 100%');
    }

    const mobileResponsiveCss = isMobile ? `
      /* Mobile Viewport Stacking & Responsiveness */
      .email-container, .wrapper, .main-table, table[class*="container"] {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
      }
      /* Stack columns cleanly into full-width mobile cards */
      .stack-column, td.stack-column, td[class*="col"], td[class*="column"], td[class*="stack"],
      .col, .column, .stack-col, .grid-col,
      table[align="left"], table[align="right"] {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        min-width: 100% !important;
        box-sizing: border-box !important;
        float: none !important;
        clear: both !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        margin-bottom: 14px !important;
      }
      /* Hide multi-column spacer gaps on mobile */
      .stack-spacer, td.stack-spacer, tr > td[width="4%"], tr > td[width="3.5%"], tr > td[width="3%"], tr > td[width="2%"] {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
      /* Stack any table rows that have multiple columns (2-col, 3-col, 4-col) */
      table.columns tr > td, tr[class*="columns"] > td, tr[class*="grid"] > td,
      tr > td[width="50%"], tr > td[width="48%"], tr > td[width="33%"], tr > td[width="33.33%"], tr > td[width="31%"], tr > td[width="25%"] {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        min-width: 100% !important;
        box-sizing: border-box !important;
        margin-bottom: 14px !important;
      }
      /* Prevent horizontal scrolling or cut-off on mobile */
      html, body {
        overflow-x: hidden !important;
        width: 100% !important;
        max-width: 100% !important;
      }
      * {
        box-sizing: border-box !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
      }
    ` : '';

    const injected = `
      <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
      <style>
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          background: #ffffff;
          overflow-x: hidden !important;
          -webkit-text-size-adjust: 100%;
        }
        table {
          border-collapse: collapse;
          box-sizing: border-box !important;
        }
        img {
          max-width: 100% !important;
          height: auto !important;
          display: block !important;
        }
        * {
          box-sizing: border-box !important;
        }
        ${mobileResponsiveCss}
        @media screen and (max-width: 600px) {
          .email-container, .wrapper {
            width: 100% !important;
            max-width: 100% !important;
          }
          .stack-column, td.stack-column, td[class*="col"], td[class*="column"], td[class*="stack"],
          .col, .column, .stack-col, .grid-col {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 100% !important;
            box-sizing: border-box !important;
            margin-bottom: 14px !important;
          }
          .stack-spacer, td.stack-spacer {
            display: none !important;
          }
        }
      </style>
      <script>
        function reportEmailHeight() {
          try {
            var b = document.body;
            var h = b ? b.scrollHeight : 600;
            if (h > 50) {
              window.parent.postMessage({ type: 'EMAIL_IFRAME_RESIZE', height: h }, '*');
            }
          } catch(e) {}
        }
        window.addEventListener('load', function() {
          reportEmailHeight();
          setTimeout(reportEmailHeight, 250);
          setTimeout(reportEmailHeight, 800);
        });
      </script>
    `;

    if (html.includes('</head>')) return html.replace('</head>', `${injected}</head>`);
    if (html.includes('<body')) return `<head>${injected}</head>${html}`;
    return `<!DOCTYPE html><html><head>${injected}</head><body>${html}</body></html>`;
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-white select-none animate-in fade-in">
      {/* Hidden File Input for Direct Asset Uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleAssetFileChange}
        className="hidden"
      />

      {/* Hidden File Input for HTML File Import */}
      <input
        ref={htmlFileInputRef}
        type="file"
        accept=".html,.htm,text/html"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const htmlContent = ev.target?.result as string;
            if (htmlContent) {
              setRawHtml(htmlContent);
              onChange({ ...content, html_body: htmlContent });
              const parsed = parseHtmlToVisualBlocks(htmlContent);
              if (parsed.length > 0) {
                setBlocks(parsed);
                setSelectedBlockId(parsed[0].id);
              }
              showToast(`✅ Imported: ${file.name} (${parsed.length} blocks extracted)`);
            }
          };
          reader.readAsText(file);
          // Reset input so same file can be re-imported
          e.target.value = '';
        }}
      />

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-8 right-8 z-[100] flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-2xl animate-in slide-in-from-bottom-5">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* HTML → VISUAL CONVERSION NOTIFICATION (BOTTOM-RIGHT) */}
      {htmlToStudioNotice && (
        <div className="fixed bottom-6 right-6 z-[100] w-[92%] sm:w-[400px] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="relative overflow-hidden rounded-2xl border border-violet-400/30 bg-slate-900/95 text-white shadow-[0_16px_48px_rgba(0,0,0,0.4)] backdrop-blur-xl">
            {/* auto-dismiss progress bar */}
            <div className="absolute left-0 top-0 h-0.5 w-full bg-white/10">
              <div className="h-full origin-left bg-gradient-to-r from-violet-400 to-indigo-400 animate-[shrinkbar_12s_linear_forwards]" style={{ animationName: 'shrinkbar' }} />
            </div>
            <style>{`@keyframes shrinkbar{from{transform:scaleX(1)}to{transform:scaleX(0)}}`}</style>

            <div className="flex items-start gap-3 p-4">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/30">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-white">Converted to visual blocks</h4>
                <p className="mt-0.5 text-[11px] font-normal leading-relaxed text-slate-300">
                  Parsed <strong className="text-violet-300">{htmlToStudioMeta.blocks} block{htmlToStudioMeta.blocks === 1 ? '' : 's'}</strong> from your HTML.
                  Custom markup and complex tables may not map 1:1 — check Preview, or stay in HTML for full control.
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setHtmlToStudioNotice(false); handleSwitchViewMode('preview'); }}
                    className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-[10.5px] font-semibold text-white transition hover:bg-white/20"
                  >
                    <Eye className="h-3 w-3" /> Check preview
                  </button>
                  <button
                    type="button"
                    onClick={() => { setHtmlToStudioNotice(false); handleSwitchViewMode('html'); }}
                    className="flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-[10.5px] font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                  >
                    <Code className="h-3 w-3" /> Back to HTML
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try { localStorage.setItem('marbee.emailStudio.hideHtmlToVisualNotice', '1'); } catch { /* noop */ }
                      setHtmlToStudioNotice(false);
                      showToast("Won't show this again");
                    }}
                    className="ml-auto px-1.5 py-1 text-[10px] font-medium text-slate-400 transition hover:text-white"
                  >
                    Don't show again
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHtmlToStudioNotice(false)}
                className="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. TOP HEADER APP BAR WITH VERSION TABS */}
      <div className="relative flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shrink-0 z-50 shadow-2xs">
        {/* Left Side: Back + Title + Email Pill + Action Icons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleExplicitSaveAndExit()}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            title="Save & Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Editable Title */}
          {isEditingTitle ? (
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                handlePersistSave({ name: e.target.value } as any);
              }}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
              autoFocus
              className="rounded-lg border border-violet-500 px-2 py-0.5 text-xs font-bold text-slate-900 focus:outline-hidden"
            />
          ) : (
            <div
              onClick={() => setIsEditingTitle(true)}
              className="flex items-center gap-1.5 cursor-pointer hover:text-violet-600"
            >
              <span className="text-xs font-bold text-slate-900">{title}</span>
              <Pencil className="h-3 w-3 text-slate-400" />
            </div>
          )}

          {/* Studio name pill */}
          <span className="flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
            <Mail className="h-3 w-3" />
            <span>Email Studio</span>
          </span>

          <span className="text-slate-200">|</span>

          {/* Quick Action Controls (Undo | Erase All | Modules) */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => showToast('Undo action')}
              className="flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-slate-800 transition cursor-pointer"
              title="Undo last change"
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span>Undo</span>
            </button>

            <button
              type="button"
              onClick={handleClearAll}
              className="flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-1 text-xs font-bold text-rose-600 shadow-2xs hover:bg-rose-50 hover:border-rose-300 transition cursor-pointer"
              title="Erase all containers and start clean"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Erase All</span>
            </button>

            <button
              type="button"
              onClick={() => setLeftModulesOpen(!leftModulesOpen)}
              className={`flex items-center gap-1 rounded-xl border px-3 py-1 text-xs font-bold shadow-2xs transition cursor-pointer ${
                leftModulesOpen
                  ? 'border-violet-500 bg-violet-600 text-white shadow-xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:text-violet-700'
              }`}
              title="Toggle Modules Library"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Modules</span>
            </button>
          </div>
        </div>

        {/* Center: VERSION TABS (Visual, HTML, AMP, Text, Preview) */}
        <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => handleSwitchViewMode('visual')}
            className={`flex items-center gap-1 px-3 py-1 rounded-lg transition ${
              viewMode === 'visual' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Visual Studio</span>
          </button>

          {enabledVersions.includes('html') && (
            <button
              type="button"
              onClick={() => handleSwitchViewMode('html')}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg transition ${
                viewMode === 'html' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Code className="h-3.5 w-3.5" />
              <span>HTML Code view</span>
            </button>
          )}

          {enabledVersions.includes('amp') && (
            <button
              type="button"
              onClick={() => handleSwitchViewMode('amp')}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg transition ${
                viewMode === 'amp' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span>AMP</span>
            </button>
          )}

          {enabledVersions.includes('text') && (
            <button
              type="button"
              onClick={() => handleSwitchViewMode('text')}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg transition ${
                viewMode === 'text' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Text Version</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleSwitchViewMode('preview')}
            className={`flex items-center gap-1 px-3 py-1 rounded-lg transition ${
              viewMode === 'preview' ? 'bg-white text-violet-700 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Preview</span>
          </button>
        </div>

        {/* Right Side: unified status dropdown (Draft | In review | Approved | Published) */}
        <div className="flex items-center gap-3">
          {/* Live DB Save Status Indicator with Fixed Width (No Layout Shift) */}
          <div className="w-18 flex items-center justify-end">
            {saveStatusText === 'saving' ? (
              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                <RotateCcw className="h-3 w-3 animate-spin text-violet-500" />
                <span>Saving...</span>
              </span>
            ) : saveStatusText === 'error' ? (
              <span className="text-[11px] text-rose-500 font-medium flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Error</span>
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 font-medium">Saved</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => showToast('Help guide')}
            className="text-slate-400 hover:text-slate-700"
            title="Help"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          {/* Status Dropdown Option */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              className={`h-8.5 px-3 rounded-xl border font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer ${
                templateStatus === 'published'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100/80'
                  : templateStatus === 'approved'
                  ? 'bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100/80'
                  : templateStatus === 'in_review'
                  ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100/80'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200/80'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${
                templateStatus === 'published' ? 'bg-emerald-500 animate-pulse' : templateStatus === 'approved' ? 'bg-sky-500' : templateStatus === 'in_review' ? 'bg-amber-500' : 'bg-slate-400'
              }`} />
              <span>
                {templateStatus === 'published'
                  ? 'Published'
                  : templateStatus === 'approved'
                  ? 'Approved'
                  : templateStatus === 'in_review'
                  ? 'In review'
                  : 'Draft'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </button>

            {isStatusDropdownOpen && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setIsStatusDropdownOpen(false)} />
                <div className="absolute right-0 top-11 w-72 rounded-2xl bg-white border border-slate-200 shadow-2xl p-1.5 z-[70] animate-in fade-in zoom-in-95">
                  <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Template Status (Database)
                  </div>
                  {[
                    { id: 'draft', label: 'Draft', desc: 'Editing in progress, not ready for production', color: 'bg-slate-400', activeBg: 'bg-slate-50 border-slate-200' },
                    { id: 'in_review', label: 'In review', desc: 'Proof dispatched, waiting for stakeholder sign-off', color: 'bg-amber-500', activeBg: 'bg-amber-50 border-amber-200' },
                    { id: 'approved', label: 'Approved', desc: 'Signed off, ready to publish', color: 'bg-sky-500', activeBg: 'bg-sky-50 border-sky-200' },
                    { id: 'published', label: 'Published', desc: 'Live for campaign & journey sends', color: 'bg-emerald-500', activeBg: 'bg-emerald-50 border-emerald-200' },
                  ].map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setTemplateStatus(item.id as any);
                        setIsStatusDropdownOpen(false);
                        handlePersistSave(undefined, item.id);
                        showToast(`Status updated to: ${item.label} & saved in DB`);
                      }}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer transition border border-transparent ${
                        templateStatus === item.id ? item.activeBg : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${item.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                          <span>{item.label}</span>
                          {templateStatus === item.id && <Check className="h-3.5 w-3.5 text-violet-600" />}
                        </div>
                        <div className="text-[10px] text-slate-500 leading-snug mt-0.5">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleExplicitSaveAndExit()}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:from-indigo-700 hover:to-purple-700 transition cursor-pointer active:scale-95"
            title="Save changes and return"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Save & Exit</span>
          </button>
        </div>
      </div>

      {/* 2. BODY CONTENT (BASED ON ACTIVE VERSION TAB) */}
      {viewMode === 'html' ? (
        <div className="relative flex flex-1 flex-col bg-slate-950 text-white font-mono text-xs overflow-hidden">
          {/* Top Bar for HTML Tab */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 shrink-0 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Code className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-bold text-slate-300 text-xs">HTML Source Code</span>
              <span className="text-[10px] text-slate-500 font-mono bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                Bidirectional Sync
              </span>
              {rawHtml && (
                <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/50">
                  {rawHtml.length.toLocaleString()} chars
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Import HTML File */}
              <button
                type="button"
                onClick={() => htmlFileInputRef.current?.click()}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-violet-500 rounded-lg text-xs font-bold text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
                title="Import HTML file from your device"
              >
                <Upload className="h-3.5 w-3.5 text-violet-400" />
                <span>Import .html</span>
              </button>

              {/* Select All */}
              <button
                type="button"
                onClick={() => {
                  const ta = document.getElementById('html-editor-textarea') as HTMLTextAreaElement;
                  if (ta) { ta.focus(); ta.select(); }
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
                title="Select all code (Ctrl+A)"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
                <span>Select All</span>
              </button>

              {/* Delete / Clear All */}
              <button
                type="button"
                onClick={() => {
                  setRawHtml('');
                  setBlocks([]);
                  setSelectedBlockId(null);
                  onChange({ ...content, html_body: '' });
                  showToast('HTML cleared');
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-rose-900/60 border border-slate-700 hover:border-rose-500 rounded-lg text-xs font-bold text-slate-200 hover:text-rose-300 flex items-center gap-1.5 transition cursor-pointer"
                title="Clear all HTML code"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                <span>Clear</span>
              </button>

              {/* Copy HTML */}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(rawHtml || renderBlocksToHtml(blocks));
                  showToast('Copied HTML to clipboard');
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </button>

              {/* Ask Buddy AI Button */}
              <button
                type="button"
                onClick={() => setIsBuddyOpen(true)}
                className="px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 shadow-lg shadow-violet-500/20 transition cursor-pointer"
                title="Ask Buddy AI to generate or refine HTML email code"
              >
                <Bot className="h-3.5 w-3.5 text-violet-200" />
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span>Ask Buddy AI</span>
              </button>
            </div>
          </div>

          {/* Ask Buddy AI Slide-over Modal */}
          {isBuddyOpen && (
            <div className="absolute inset-x-6 top-16 z-40 rounded-2xl bg-slate-900/98 backdrop-blur-xl border border-violet-500/40 p-5 shadow-2xl space-y-4 max-w-xl mx-auto text-slate-200 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-violet-600/30 border border-violet-500/40 flex items-center justify-center text-violet-400">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                      <span>Ask Buddy</span>
                      <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 px-1.5 py-0.2 rounded-full border border-violet-500/20">
                        AI Email Architect
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Describe the email you want, and Buddy will write production-ready HTML and sync it to Visual Studio.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBuddyOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Quick Prompt Ideas */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick Starters:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    '🛍️ 50% Off Flash Sale with 2-Column Product Grid',
                    '👋 Modern Welcome & Onboarding Journey Email',
                    '⚡ SaaS Feature Release Announcement with CTA',
                    '📊 Weekly Performance Report with Stats Summary',
                  ].map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAskBuddyGenerate(p)}
                      disabled={isBuddyLoading}
                      className="text-[10px] bg-slate-800 hover:bg-violet-600/30 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg border border-slate-700 hover:border-violet-400/50 transition cursor-pointer"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Bar */}
              <div className="space-y-2">
                <textarea
                  value={buddyPrompt}
                  onChange={(e) => setBuddyPrompt(e.target.value)}
                  placeholder="E.g. Create a sleek black-and-gold invitation email for a VIP webinar with an RSVP button and speaker headshots..."
                  rows={3}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 p-3 text-xs text-white placeholder-slate-500 focus:border-violet-400 focus:outline-hidden resize-none font-sans"
                />

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBuddyOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAskBuddyGenerate()}
                    disabled={isBuddyLoading || !buddyPrompt.trim()}
                    className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-md shadow-violet-600/30 cursor-pointer"
                  >
                    {isBuddyLoading ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Buddy is writing code…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Generate & Sync HTML</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          <textarea
            id="html-editor-textarea"
            value={rawHtml || renderBlocksToHtml(blocks)}
            onChange={(e) => {
              setRawHtml(e.target.value);
              onChange({ ...content, html_body: e.target.value });
            }}
            onKeyDown={(e) => {
              // Ctrl+A: select all
              if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.stopPropagation();
                (e.target as HTMLTextAreaElement).select();
              }
              // Delete or Backspace with full selection → clear all
              if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey) {
                const ta = e.target as HTMLTextAreaElement;
                if (ta.selectionStart === 0 && ta.selectionEnd === ta.value.length && ta.value.length > 0) {
                  e.preventDefault();
                  setRawHtml('');
                  setBlocks([]);
                  setSelectedBlockId(null);
                  onChange({ ...content, html_body: '' });
                  showToast('HTML cleared');
                }
              }
            }}
            className="flex-1 w-full bg-transparent p-4 outline-hidden text-emerald-400 font-mono text-xs resize-none leading-relaxed"
            placeholder="Paste, type or import HTML email code here...  ✦ Use 'Import .html' to load from device  ✦ Use 'Ask Buddy AI' to generate"
            spellCheck={false}
          />
        </div>

      ) : viewMode === 'amp' ? (
        <div className="flex flex-1 flex-col p-6 bg-slate-950 text-white font-mono text-xs overflow-hidden">
          {/* Top Bar for AMP Tab */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span className="font-bold text-amber-400 text-xs">AMP for Email ⚡ (Playground & Validator)</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Insert Boilerplate */}
              <button
                type="button"
                onClick={() => {
                  setRawAmp(SAMPLE_AMP_BOILERPLATE);
                  onChange({ ...content, amp_html: SAMPLE_AMP_BOILERPLATE });
                  showToast('Inserted standard AMP for Email boilerplate!');
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-amber-300 flex items-center gap-1 transition cursor-pointer border border-amber-500/20"
                title="Insert standard AMP Boilerplate code"
              >
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                <span>Insert AMP Boilerplate</span>
              </button>

              {/* Validate AMP Button */}
              <button
                type="button"
                onClick={handleValidateAmp}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-amber-600/20"
                title="Validate AMP for Email specification"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Validate AMP</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(rawAmp);
                  showToast('Copied AMP to clipboard');
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-white flex items-center gap-1 transition cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy AMP</span>
              </button>
            </div>
          </div>

          {/* AMP Validation Diagnostic Report */}
          {ampValidation && (
            <div
              className={`p-3 border-b text-xs flex items-start gap-3 transition-all ${
                ampValidation.isValid
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {ampValidation.isValid ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <div className="font-bold flex items-center justify-between">
                  <span>{ampValidation.summary}</span>
                  <button
                    type="button"
                    onClick={() => setAmpValidation(null)}
                    className="text-[10px] opacity-70 hover:opacity-100"
                  >
                    Dismiss
                  </button>
                </div>
                {ampValidation.errors.length > 0 && (
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] font-mono">
                    {ampValidation.errors.map((err, i) => (
                      <li key={i}>{err.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <textarea
            value={rawAmp}
            onChange={(e) => {
              setRawAmp(e.target.value);
              onChange({ ...content, amp_html: e.target.value });
            }}
            className="flex-1 w-full bg-transparent p-4 outline-hidden text-amber-300 font-mono text-xs resize-none"
            placeholder="Write or paste AMP for Email code here..."
          />
        </div>
      ) : viewMode === 'text' ? (
        <div className="flex flex-1 flex-col p-6 bg-slate-50 text-slate-800 text-xs overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <span className="font-bold text-slate-700 text-xs">Plain Text Fallback Version</span>

            <div className="flex items-center gap-2">
              {/* HTML to Text Button */}
              <button
                type="button"
                onClick={handleConvertHtmlToText}
                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                title="Fetch all text from HTML code view and format into Plain Text"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>HTML to Text</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(rawText || renderBlocksToPlainText(blocks));
                  showToast('Copied text to clipboard');
                }}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1 transition cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Text</span>
              </button>
            </div>
          </div>
          <textarea
            value={rawText || renderBlocksToPlainText(blocks)}
            onChange={(e) => {
              setRawText(e.target.value);
              onChange({ ...content, text_body: e.target.value, plain_text: e.target.value });
            }}
            rows={15}
            className="flex-1 w-full bg-white rounded-xl border border-slate-200 p-4 font-mono text-xs focus:outline-hidden mt-3 resize-none"
            placeholder="Plain text fallback message..."
          />
        </div>
      ) : viewMode === 'preview' ? (
          <div className="flex flex-1 flex-col bg-[#f6f8fc] overflow-hidden select-none">
            {/* Top Workspace Bar */}
            <div className="relative flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200 shrink-0 z-20 shadow-2xs gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-slate-800">Live</span>

                  {/* ESP Selection Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsEspDropdownOpen(!isEspDropdownOpen)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-xs font-bold text-slate-900 transition cursor-pointer shadow-2xs"
                    >
                      <span>
                        {selectedEsp === 'gmail'
                          ? 'Gmail'
                          : selectedEsp === 'outlook'
                          ? 'Outlook (M365)'
                          : selectedEsp === 'yahoo'
                          ? 'Yahoo Mail'
                          : 'Rediffmail'}
                      </span>
                      <ChevronDown className="h-3 w-3 text-slate-500" />
                    </button>

                    {isEspDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setIsEspDropdownOpen(false)} />
                        <div className="absolute left-0 top-9 w-48 rounded-xl bg-white border border-slate-200 shadow-xl p-1 z-40 animate-in fade-in zoom-in-95">
                          {[
                            { id: 'gmail', label: 'Gmail', icon: '📬', badge: 'Google' },
                            { id: 'outlook', label: 'Outlook', icon: '📧', badge: 'Microsoft 365' },
                            { id: 'yahoo', label: 'Yahoo Mail', icon: '🟣', badge: 'Yahoo' },
                            { id: 'rediff', label: 'Rediffmail', icon: '🔴', badge: 'Enterprise' },
                          ].map((esp) => (
                            <div
                              key={esp.id}
                              onClick={() => {
                                setSelectedEsp(esp.id as any);
                                setIsEspDropdownOpen(false);
                                showToast(`Switched ESP preview to: ${esp.label}`);
                              }}
                              className={`flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition text-xs ${
                                selectedEsp === esp.id
                                  ? 'bg-violet-50 text-violet-900 font-bold'
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span>{esp.icon}</span>
                                <span>{esp.label}</span>
                              </div>
                              {selectedEsp === esp.id && <Check className="h-3.5 w-3.5 text-violet-600" />}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <span className="text-xs font-bold text-slate-800">Preview</span>
                </div>

                {/* Search-based Test Profile Dropdown for Personalization */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsTestProfileDropdownOpen(!isTestProfileDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 transition cursor-pointer shadow-2xs"
                  >
                    <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
                      {selectedTestProfile.firstName.charAt(0)}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-slate-900">{selectedTestProfile.name}</span>
                      <span className="text-[10px] text-slate-400 hidden md:inline">({selectedTestProfile.email})</span>
                    </div>
                    <ChevronDown className="h-3 w-3 text-slate-500" />
                  </button>

                  {isTestProfileDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setIsTestProfileDropdownOpen(false)} />
                      <div className="absolute left-0 top-10 w-72 rounded-2xl bg-white border border-slate-200 shadow-2xl p-2 z-40 animate-in fade-in zoom-in-95">
                        {/* Search Box */}
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 mb-2">
                          <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <input
                            type="text"
                            placeholder="Search test profile..."
                            value={testProfileSearchQuery}
                            onChange={(e) => setTestProfileSearchQuery(e.target.value)}
                            className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-hidden"
                            autoFocus
                          />
                          {testProfileSearchQuery && (
                            <X className="h-3 w-3 text-slate-400 cursor-pointer hover:text-slate-600" onClick={() => setTestProfileSearchQuery('')} />
                          )}
                        </div>

                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                          Test Profiles (Personalization)
                        </div>

                        {/* Profile List */}
                        <div className="max-h-56 overflow-y-auto space-y-1 [scrollbar-width:thin]">
                          {testProfiles
                            .filter(p =>
                              p.name.toLowerCase().includes(testProfileSearchQuery.toLowerCase()) ||
                              p.email.toLowerCase().includes(testProfileSearchQuery.toLowerCase()) ||
                              p.company.toLowerCase().includes(testProfileSearchQuery.toLowerCase())
                            )
                            .map(profile => (
                              <div
                                key={profile.id}
                                onClick={() => {
                                  setSelectedTestProfileId(profile.id);
                                  setIsTestProfileDropdownOpen(false);
                                  showToast(`Preview personalized for ${profile.name}`);
                                }}
                                className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition ${
                                  selectedTestProfileId === profile.id ? 'bg-violet-50 text-violet-900 font-bold border border-violet-200' : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                                    {profile.firstName.charAt(0)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-xs truncate font-bold">{profile.name}</div>
                                    <div className="text-[10px] text-slate-400 truncate">{profile.email} · {profile.company}</div>
                                  </div>
                                </div>
                                {selectedTestProfileId === profile.id && (
                                  <Check className="h-4 w-4 text-violet-600 shrink-0" />
                                )}
                              </div>
                            ))}
                        </div>

                        {/* Variable Tag Preview footer */}
                        <div className="mt-2 pt-2 border-t border-slate-100 px-2 flex items-center justify-between text-[10px] text-slate-500">
                          <span>Vars: {`{{firstName}}, {{tier}}`}</span>
                          <span className="font-semibold text-violet-600">{selectedTestProfile.tier}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {/* Send Test Email Button */}
                <button
                  type="button"
                  onClick={() => {
                    setTestSendSuccess(false);
                    setTestSendProgress(0);
                    setIsSendingTest(false);
                    setShowSendTestModal(true);
                  }}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-violet-500/20 hover:shadow-violet-500/30 transition cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Send Test</span>
                </button>

                {/* Viewport switch */}
                <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setViewport('desktop')}
                    className={`px-3 py-1 rounded-lg flex items-center gap-1.5 text-xs font-bold transition cursor-pointer ${viewport === 'desktop' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <Laptop className="h-3.5 w-3.5" />
                    <span>Desktop ({selectedEsp === 'outlook' ? 'Outlook Web' : selectedEsp === 'yahoo' ? 'Yahoo Mail' : selectedEsp === 'rediff' ? 'Rediffmail' : 'Gmail Web'})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewport('mobile')}
                    className={`px-3 py-1 rounded-lg flex items-center gap-1.5 text-xs font-bold transition cursor-pointer ${viewport === 'mobile' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>Mobile (iPhone 15 Pro)</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const personalizedHtml = applyPersonalization(rawHtml || renderBlocksToHtml(blocks), selectedTestProfile);
                    const blob = new Blob([personalizedHtml], { type: 'text/html' });
                    window.open(URL.createObjectURL(blob), '_blank');
                  }}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open in Tab</span>
                </button>
              </div>
            </div>

            {/* DESKTOP VIEW BASED ON SELECTED ESP */}
            {viewport === 'desktop' && (
              selectedEsp === 'outlook' ? (
                /* OUTLOOK (MICROSOFT 365) DESKTOP VIEW */
                <div className="flex flex-1 flex-col overflow-hidden bg-[#f3f2f1] font-sans select-none">
                  {/* 1. Microsoft 365 Blue Header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-[#0078d4] text-white shrink-0 gap-4">
                    {/* Left: App launcher + Outlook branding */}
                    <div className="flex items-center gap-3 w-56 shrink-0">
                      <button type="button" className="p-1.5 hover:bg-white/10 rounded-md transition cursor-pointer">
                        <Grid className="h-4.5 w-4.5 text-white" />
                      </button>
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setGmailViewMode('inbox')}>
                        <div className="w-6 h-6 rounded-md bg-white text-[#0078d4] flex items-center justify-center font-bold text-xs shadow-xs">
                          ✉
                        </div>
                        <span className="text-base font-semibold text-white tracking-tight">
                          Outlook
                        </span>
                      </div>
                    </div>

                    {/* Center: Outlook Search Box */}
                    <div className="flex-1 max-w-[560px]">
                      <div className="flex items-center gap-2.5 bg-white/20 hover:bg-white/30 transition rounded-md px-3 py-1.5 focus-within:bg-white focus-within:text-slate-900 shadow-2xs">
                        <Search className="h-3.5 w-3.5 text-white focus-within:text-slate-500 shrink-0" />
                        <input
                          type="text"
                          placeholder="Search (Ctrl+E)"
                          defaultValue={applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                          className="w-full bg-transparent text-xs text-white placeholder-white/70 focus:text-slate-900 focus:placeholder-slate-400 outline-hidden font-sans"
                          readOnly
                        />
                      </div>
                    </div>

                    {/* Right: M365 Tools + Profile */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" className="p-1.5 hover:bg-white/10 rounded-md text-white transition cursor-pointer" title="Meet Now">
                        <Video className="h-4 w-4" />
                      </button>
                      <button type="button" className="p-1.5 hover:bg-white/10 rounded-md text-white transition cursor-pointer" title="Settings">
                        <Settings className="h-4 w-4" />
                      </button>
                      <button type="button" className="p-1.5 hover:bg-white/10 rounded-md text-white transition cursor-pointer" title="Help">
                        <HelpCircle className="h-4 w-4" />
                      </button>
                      <div className="w-7 h-7 rounded-full bg-[#004e8c] text-white flex items-center justify-center font-bold text-xs border border-white/30 cursor-pointer">
                        {selectedTestProfile.firstName.charAt(0)}
                      </div>
                    </div>
                  </div>

                  {/* 2. Ribbon Action Toolbar */}
                  <div className="flex items-center justify-between px-3 py-1.5 bg-[#f3f2f1] border-b border-[#e1dfdd] shrink-0 text-xs text-[#242424]">
                    <div className="flex items-center gap-1">
                      {/* New Mail Button */}
                      <button type="button" className="px-3.5 py-1.5 bg-[#0078d4] hover:bg-[#106ebe] text-white rounded-md font-semibold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer">
                        <Mail className="h-3.5 w-3.5" />
                        <span>New mail</span>
                        <ChevronDown className="h-3 w-3 opacity-80" />
                      </button>

                      <span className="w-[1px] h-4 bg-slate-300 mx-1" />

                      {/* Action icons */}
                      <button type="button" className="px-2.5 py-1.5 hover:bg-slate-200/70 rounded-md flex items-center gap-1 text-slate-700 transition cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                      <button type="button" className="px-2.5 py-1.5 hover:bg-slate-200/70 rounded-md flex items-center gap-1 text-slate-700 transition cursor-pointer">
                        <Archive className="h-3.5 w-3.5" />
                        <span>Archive</span>
                      </button>
                      <button type="button" className="px-2.5 py-1.5 hover:bg-slate-200/70 rounded-md flex items-center gap-1 text-slate-700 transition cursor-pointer">
                        <Shield className="h-3.5 w-3.5" />
                        <span>Report</span>
                      </button>
                      <button type="button" className="px-2.5 py-1.5 hover:bg-slate-200/70 rounded-md flex items-center gap-1 text-slate-700 transition cursor-pointer">
                        <Folder className="h-3.5 w-3.5" />
                        <span>Move to</span>
                        <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                      </button>
                      <button type="button" className="px-2.5 py-1.5 hover:bg-slate-200/70 rounded-md flex items-center gap-1 text-slate-700 transition cursor-pointer">
                        <Tag className="h-3.5 w-3.5" />
                        <span>Categorize</span>
                        <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1 text-slate-500 text-[11px]">
                      <button type="button" className="p-1 hover:bg-slate-200/70 rounded-md cursor-pointer">
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" className="p-1 hover:bg-slate-200/70 rounded-md cursor-pointer">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* 3. Main Outlook 3-Column Layout */}
                  <div className="flex flex-1 overflow-hidden">
                    {/* Leftmost App Rail */}
                    <div className="w-12 bg-[#edebe9] flex flex-col items-center py-2 gap-4 shrink-0 border-r border-[#e1dfdd]">
                      <button type="button" className="p-2 bg-white text-[#0078d4] rounded-lg shadow-2xs cursor-pointer">
                        <Mail className="h-4.5 w-4.5" />
                      </button>
                      <button type="button" className="p-2 text-slate-600 hover:bg-slate-200/60 rounded-lg transition cursor-pointer">
                        <Clock className="h-4.5 w-4.5" />
                      </button>
                      <button type="button" className="p-2 text-slate-600 hover:bg-slate-200/60 rounded-lg transition cursor-pointer">
                        <User className="h-4.5 w-4.5" />
                      </button>
                      <button type="button" className="p-2 text-slate-600 hover:bg-slate-200/60 rounded-lg transition cursor-pointer">
                        <CheckCircle2 className="h-4.5 w-4.5" />
                      </button>
                    </div>

                    {/* Folders Tree Pane */}
                    <div className="w-48 bg-[#f3f2f1] flex flex-col py-2 px-2 shrink-0 border-r border-[#e1dfdd] text-xs">
                      <div className="font-semibold text-slate-500 text-[11px] px-2 py-1 uppercase tracking-wider">
                        Folders
                      </div>
                      <div className="space-y-0.5 mt-1">
                        <div
                          onClick={() => setGmailViewMode('inbox')}
                          className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition ${gmailViewMode === 'inbox' ? 'bg-[#e1dfdd] font-bold text-slate-900' : 'hover:bg-slate-200/50 text-slate-700'}`}
                        >
                          <div className="flex items-center gap-2">
                            <Archive className="h-3.5 w-3.5 text-[#0078d4]" />
                            <span>Inbox</span>
                          </div>
                          <span className="text-[10px] font-bold text-[#0078d4]">1</span>
                        </div>
                        {['Drafts', 'Sent Items', 'Deleted Items', 'Junk Email', 'Archive'].map((f) => (
                          <div
                            key={f}
                            onClick={() => setGmailViewMode('inbox')}
                            className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-200/50 text-slate-700 cursor-pointer transition"
                          >
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Message List Pane & Reading Pane */}
                    <div className="flex-1 flex overflow-hidden bg-white">
                      {/* INBOX MESSAGE LIST */}
                      {gmailViewMode === 'inbox' ? (
                        <div className="flex-1 flex flex-col overflow-hidden bg-white">
                          {/* Focused / Other Tabs */}
                          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 shrink-0 bg-white">
                            <div className="flex items-center gap-4 text-xs font-semibold">
                              <button type="button" className="pb-1 text-[#0078d4] border-b-2 border-[#0078d4] font-bold cursor-pointer">
                                Focused
                              </button>
                              <button type="button" className="pb-1 text-slate-500 hover:text-slate-800 cursor-pointer">
                                Other
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer hover:text-slate-800">
                              <SlidersHorizontal className="h-3 w-3" />
                              <span>Filter</span>
                            </div>
                          </div>

                          {/* Outlook Email Rows */}
                          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 [scrollbar-width:thin]">
                            {/* TOP 1ST EMAIL (UNREAD MARBEE TEMPLATE EMAIL) */}
                            <div
                              onClick={() => setGmailViewMode('email')}
                              className="flex items-start gap-3 p-3.5 bg-[#f0f6ff] border-l-4 border-l-[#0078d4] hover:bg-[#e1effe] cursor-pointer transition"
                            >
                              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs">
                                🐝
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-xs text-slate-900 truncate">
                                    {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}
                                  </span>
                                  <span className="text-[10px] font-bold text-[#0078d4] shrink-0">
                                    {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                  </span>
                                </div>
                                <div className="text-xs font-bold text-[#0078d4] truncate mt-0.5">
                                  {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                                </div>
                                <div className="text-[11px] text-slate-600 truncate mt-0.5">
                                  {applyPersonalization(preheader || 'Discover the latest updates, offers and exclusive perks available for you.', selectedTestProfile)}
                                </div>
                              </div>
                            </div>

                            {/* Simulated Outlook Corporate Emails */}
                            {[
                              { from: 'Microsoft 365 Security', subj: 'Weekly Security & Compliance Digest', preview: 'Review active identity protection and device health metrics for your tenant...', time: 'Yesterday' },
                              { from: 'Azure DevOps Services', subj: 'Build pipeline succeeded: Production release v2.4.1', preview: 'Deployment job succeeded for cluster us-west-2 with 0 warnings...', time: 'Yesterday' },
                              { from: 'DocuSign System', subj: 'Please DocuSign: Q3 Enterprise Master Services Agreement', preview: 'All stakeholders have completed their signatures. Download signed copy...', time: '25 Aug' },
                              { from: 'GitHub Notifications', subj: '[marbee-io/core] Pull Request #142 merged', preview: 'Automated PR merged into main branch by deployment bot...', time: '24 Aug' },
                              { from: 'LinkedIn Learning', subj: 'Trending courses in Cloud Architecture & AI', preview: 'Discover 5 top rated learning paths handpicked for your profile...', time: '23 Aug' },
                            ].map((mail, idx) => (
                              <div
                                key={idx}
                                onClick={() => setGmailViewMode('email')}
                                className="flex items-start gap-3 p-3.5 hover:bg-slate-50 text-slate-600 cursor-pointer transition"
                              >
                                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold shrink-0">
                                  {mail.from.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className="font-normal text-xs text-slate-800 truncate">{mail.from}</span>
                                    <span className="text-[10px] text-slate-400 shrink-0">{mail.time}</span>
                                  </div>
                                  <div className="text-xs font-normal text-slate-700 truncate mt-0.5">{mail.subj}</div>
                                  <div className="text-[11px] text-slate-400 truncate mt-0.5">{mail.preview}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* OUTLOOK READING VIEW */
                        <div className="flex flex-1 flex-col overflow-hidden bg-white">
                          {/* Outlook Reading Toolbar */}
                          <div className="flex items-center justify-between px-6 py-2 border-b border-slate-200 shrink-0 bg-white">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setGmailViewMode('inbox')}
                                className="p-1.5 hover:bg-slate-100 rounded-md transition cursor-pointer text-slate-700 flex items-center gap-1.5 text-xs font-semibold"
                              >
                                <ArrowLeft className="h-4 w-4" />
                                <span>Back to Inbox</span>
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
                              <button type="button" className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-md text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition cursor-pointer">
                                <Reply className="h-3.5 w-3.5" />
                                <span>Reply</span>
                              </button>
                              <button type="button" className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-md text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition cursor-pointer">
                                <Forward className="h-3.5 w-3.5" />
                                <span>Forward</span>
                              </button>
                            </div>
                          </div>

                          {/* Scrollable Outlook Reading Body */}
                          <div className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin] p-8 max-w-[900px] mx-auto w-full">
                            {/* Outlook Subject Title */}
                            <div className="mb-4">
                              <h1 className="text-2xl font-semibold text-[#242424] leading-tight" style={{ fontFamily: 'Segoe UI, Roboto, Arial, sans-serif' }}>
                                {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                              </h1>
                            </div>

                            {/* Outlook Sender Card */}
                            <div className="flex items-start justify-between pb-4 mb-6 border-b border-slate-100">
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-600 via-purple-600 to-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0 relative shadow-2xs">
                                  <span>🐝</span>
                                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border border-white flex items-center justify-center">
                                    <Check className="w-2 h-2 text-white stroke-[3.5]" />
                                  </div>
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-[#242424]">
                                      {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                      &lt;{applyPersonalization(fromEmail || 'hello@marbee.io', selectedTestProfile)}&gt;
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    To: {selectedTestProfile.name} &lt;{selectedTestProfile.email}&gt;
                                  </div>
                                </div>
                              </div>

                              <div className="text-xs text-slate-400">
                                {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                              </div>
                            </div>

                            {/* Email Body Iframe */}
                            <div className="w-full flex justify-center bg-white my-2 border border-slate-100 rounded-lg p-2 shadow-2xs">
                              <iframe
                                title="Outlook Email Body"
                                srcDoc={buildIframeSrc(false)}
                                className="w-full border-0 block"
                                style={{
                                  width: '100%',
                                  height: `${previewIframeHeight}px`,
                                  minHeight: '400px',
                                  display: 'block',
                                }}
                                scrolling="no"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : selectedEsp === 'yahoo' ? (
                /* YAHOO MAIL DESKTOP VIEW */
                <div className="flex flex-1 flex-col overflow-hidden bg-[#f0f3f8] font-sans select-none">
                  {/* 1. Yahoo Purple Header */}
                  <div className="flex items-center justify-between px-5 py-2.5 bg-[#6001d2] text-white shrink-0 gap-4">
                    {/* Left: Yahoo! Mail Logo */}
                    <div className="flex items-center gap-3 w-52 shrink-0 cursor-pointer" onClick={() => setGmailViewMode('inbox')}>
                      <span className="text-2xl font-black tracking-tight text-white font-serif">
                        yahoo<span className="text-[#ff0033]">!</span>
                      </span>
                      <span className="text-xs font-bold text-purple-200 uppercase tracking-widest mt-1">mail</span>
                    </div>

                    {/* Center: Search Box */}
                    <div className="flex-1 max-w-[640px]">
                      <div className="flex items-center bg-white rounded-lg overflow-hidden shadow-xs">
                        <input
                          type="text"
                          placeholder="Search in mail"
                          defaultValue={applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                          className="w-full px-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-hidden font-sans"
                          readOnly
                        />
                        <button type="button" className="px-5 py-2 bg-[#6001d2] hover:bg-[#5000b0] text-white text-xs font-bold transition flex items-center gap-1">
                          <Search className="h-3.5 w-3.5" />
                          <span>Search</span>
                        </button>
                      </div>
                    </div>

                    {/* Right: Notifications, Settings, User */}
                    <div className="flex items-center gap-3 shrink-0 text-white">
                      <button type="button" className="p-1.5 hover:bg-white/10 rounded-full transition cursor-pointer">
                        <Settings className="h-4 w-4" />
                      </button>
                      <button type="button" className="p-1.5 hover:bg-white/10 rounded-full transition cursor-pointer">
                        <HelpCircle className="h-4 w-4" />
                      </button>
                      <div className="w-7 h-7 rounded-full bg-white text-[#6001d2] flex items-center justify-center font-bold text-xs shadow-xs cursor-pointer">
                        {selectedTestProfile.firstName.charAt(0)}
                      </div>
                    </div>
                  </div>

                  {/* 2. Main Yahoo Layout */}
                  <div className="flex flex-1 overflow-hidden">
                    {/* Left Sidebar */}
                    <div className="w-56 bg-white border-r border-slate-200 flex flex-col p-3 gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => showToast('Compose new mail')}
                        className="w-full py-2 bg-[#6001d2] hover:bg-[#5200b3] text-white text-xs font-bold rounded-full shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Compose</span>
                      </button>

                      <div className="space-y-0.5 mt-2 text-xs">
                        <div
                          onClick={() => setGmailViewMode('inbox')}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition ${gmailViewMode === 'inbox' ? 'bg-purple-50 text-[#6001d2] font-bold' : 'hover:bg-slate-50 text-slate-700'}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Mail className="h-4 w-4" />
                            <span>Inbox</span>
                          </div>
                          <span className="text-[10px] font-bold bg-[#6001d2] text-white px-1.5 py-0.2 rounded-full">1</span>
                        </div>
                        {['Unread', 'Starred', 'Drafts', 'Sent', 'Archive', 'Spam', 'Trash'].map((f) => (
                          <div
                            key={f}
                            onClick={() => setGmailViewMode('inbox')}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700 cursor-pointer transition"
                          >
                            <Folder className="h-4 w-4 text-slate-400" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>

                      <div className="border-t border-slate-100 pt-2 mt-auto text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2">
                        Views
                      </div>
                      <div className="space-y-0.5 text-xs text-slate-600">
                        {['Photos', 'Documents', 'Subscriptions', 'Deals'].map((v) => (
                          <div key={v} className="px-3 py-1 hover:text-slate-900 cursor-pointer">{v}</div>
                        ))}
                      </div>
                    </div>

                    {/* Center Message List & Reading View */}
                    <div className="flex-1 flex flex-col overflow-hidden bg-white">
                      {gmailViewMode === 'inbox' ? (
                        <div className="flex-1 flex flex-col overflow-hidden">
                          {/* Yahoo Action Toolbar */}
                          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 shrink-0 bg-[#f9fafb] text-xs text-slate-700">
                            <div className="flex items-center gap-4">
                              <input type="checkbox" className="rounded border-slate-300 text-purple-600 cursor-pointer" />
                              <button type="button" className="hover:text-slate-900 flex items-center gap-1 cursor-pointer">
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Delete</span>
                              </button>
                              <button type="button" className="hover:text-slate-900 flex items-center gap-1 cursor-pointer">
                                <Shield className="h-3.5 w-3.5" />
                                <span>Spam</span>
                              </button>
                              <button type="button" className="hover:text-slate-900 flex items-center gap-1 cursor-pointer">
                                <Folder className="h-3.5 w-3.5" />
                                <span>Move</span>
                              </button>
                            </div>
                            <div className="text-[11px] text-slate-400">1 of 1,248</div>
                          </div>

                          {/* Message Rows */}
                          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 [scrollbar-width:thin]">
                            {/* ACTIVE MARBEE TEMPLATE EMAIL */}
                            <div
                              onClick={() => setGmailViewMode('email')}
                              className="flex items-center gap-3 px-4 py-3 bg-purple-50/50 hover:bg-purple-100/60 cursor-pointer transition border-l-4 border-l-[#6001d2]"
                            >
                              <input type="checkbox" className="rounded border-slate-300 text-purple-600" />
                              <Star className="h-4 w-4 text-slate-300 hover:text-amber-400 cursor-pointer" />
                              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                                🐝
                              </div>
                              <div className="w-44 font-bold text-xs text-slate-900 truncate">
                                {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}
                              </div>
                              <div className="flex-1 min-w-0 flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-900 truncate">
                                  {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                                </span>
                                <span className="text-xs text-slate-500 truncate">
                                  — {applyPersonalization(preheader || 'Discover the latest news and offers', selectedTestProfile)}
                                </span>
                              </div>
                              <div className="text-[11px] font-bold text-[#6001d2] shrink-0">
                                {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                              </div>
                            </div>

                            {/* Simulated Emails */}
                            {[
                              { from: 'Amazon Deals', subj: 'Lightning Deals: Up to 50% Off Electronics & Gadgets', preview: 'Check out today\'s top discounts curated for your shopping cart...', time: 'Yesterday' },
                              { from: 'The New York Times', subj: 'Morning Briefing: Top Global Headlines & Analysis', preview: 'Here is what you need to know to start your day informed...', time: 'Yesterday' },
                              { from: 'Chase Card Services', subj: 'Your monthly statement is ready for review', preview: 'Log in to your online account to view your recent transactions...', time: '25 Aug' },
                              { from: 'Spotify Premium', subj: 'Discover Weekly: Fresh tracks handpicked for you', preview: 'Enjoy your new 30-track personalized mixtape updated every Monday...', time: '24 Aug' },
                            ].map((m, idx) => (
                              <div
                                key={idx}
                                onClick={() => setGmailViewMode('email')}
                                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition text-slate-600"
                              >
                                <input type="checkbox" className="rounded border-slate-300" />
                                <Star className="h-4 w-4 text-slate-300 hover:text-amber-400 cursor-pointer" />
                                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold shrink-0">
                                  {m.from.charAt(0)}
                                </div>
                                <div className="w-44 text-xs text-slate-700 truncate">{m.from}</div>
                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                  <span className="text-xs text-slate-800 truncate">{m.subj}</span>
                                  <span className="text-xs text-slate-400 truncate">— {m.preview}</span>
                                </div>
                                <div className="text-[11px] text-slate-400 shrink-0">{m.time}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* YAHOO READING VIEW */
                        <div className="flex-1 flex flex-col overflow-hidden bg-white">
                          <div className="flex items-center justify-between px-6 py-2 border-b border-slate-200 shrink-0 bg-[#f9fafb]">
                            <button
                              type="button"
                              onClick={() => setGmailViewMode('inbox')}
                              className="p-1.5 hover:bg-slate-200 rounded-md transition cursor-pointer text-slate-700 flex items-center gap-1.5 text-xs font-semibold"
                            >
                              <ArrowLeft className="h-4 w-4" />
                              <span>Back to Inbox</span>
                            </button>

                            <div className="flex items-center gap-2">
                              <button type="button" className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded-md text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-2xs cursor-pointer">
                                <Reply className="h-3.5 w-3.5" />
                                <span>Reply</span>
                              </button>
                              <button type="button" className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded-md text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-2xs cursor-pointer">
                                <Forward className="h-3.5 w-3.5" />
                                <span>Forward</span>
                              </button>
                            </div>
                          </div>

                          <div className="flex-1 overflow-y-auto [scrollbar-width:thin] p-8 max-w-[900px] mx-auto w-full">
                            <h1 className="text-2xl font-bold text-slate-900 mb-4 font-sans">
                              {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                            </h1>

                            <div className="flex items-start justify-between pb-4 mb-6 border-b border-slate-100">
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0 relative">
                                  <span>🐝</span>
                                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border border-white flex items-center justify-center">
                                    <Check className="w-2 h-2 text-white stroke-[3.5]" />
                                  </div>
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-slate-900">
                                      {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                      &lt;{applyPersonalization(fromEmail || 'hello@marbee.io', selectedTestProfile)}&gt;
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    To: {selectedTestProfile.name} &lt;{selectedTestProfile.email}&gt;
                                  </div>
                                </div>
                              </div>
                              <div className="text-xs text-slate-400">
                                {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                              </div>
                            </div>

                            <div className="w-full flex justify-center bg-white my-2 border border-slate-100 rounded-xl p-2 shadow-2xs">
                              <iframe
                                title="Yahoo Email Body"
                                srcDoc={buildIframeSrc(false)}
                                className="w-full border-0 block"
                                style={{
                                  width: '100%',
                                  height: `${previewIframeHeight}px`,
                                  minHeight: '400px',
                                  display: 'block',
                                }}
                                scrolling="no"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : selectedEsp === 'rediff' ? (
                /* REDIFFMAIL DESKTOP VIEW */
                <div className="flex flex-1 flex-col overflow-hidden bg-[#f4f4f4] font-sans select-none">
                  {/* 1. Rediff Header */}
                  <div className="flex items-center justify-between px-6 py-2 bg-[#d0021b] text-white shrink-0">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => setGmailViewMode('inbox')}>
                      <span className="text-2xl font-black tracking-tight text-white">rediff<span className="text-yellow-300">mail</span></span>
                      <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-bold uppercase">Enterprise</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span>Welcome, <strong>{selectedTestProfile.name}</strong></span>
                      <span className="text-white/40">|</span>
                      <button type="button" className="hover:underline cursor-pointer">Settings</button>
                      <span className="text-white/40">|</span>
                      <button type="button" className="hover:underline cursor-pointer">Sign Out</button>
                    </div>
                  </div>

                  {/* 2. Rediff Navigation Ribbon */}
                  <div className="flex items-center justify-between px-6 py-2 bg-white border-b border-slate-200 shrink-0 text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => showToast('Write Mail')}
                        className="px-4 py-1.5 bg-[#d0021b] hover:bg-[#b00217] text-white font-bold rounded flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Write Mail</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGmailViewMode('inbox')}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded flex items-center gap-1 cursor-pointer"
                      >
                        <Mail className="h-3.5 w-3.5 text-[#d0021b]" />
                        <span>Check Mail</span>
                      </button>
                      <button type="button" className="px-3 py-1.5 hover:bg-slate-100 text-slate-700 font-semibold rounded flex items-center gap-1 cursor-pointer">
                        <Users className="h-3.5 w-3.5 text-slate-500" />
                        <span>Address Book</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Search Mail"
                        defaultValue={applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                        className="h-7 px-3 rounded border border-slate-300 text-xs outline-hidden"
                        readOnly
                      />
                      <button type="button" className="px-3 py-1 bg-slate-800 text-white rounded text-xs font-bold">Search</button>
                    </div>
                  </div>

                  {/* 3. Main Rediff Layout */}
                  <div className="flex flex-1 overflow-hidden">
                    {/* Left Folder Tree */}
                    <div className="w-48 bg-white border-r border-slate-200 p-3 shrink-0 text-xs">
                      <div className="font-bold text-slate-700 mb-2 uppercase text-[10px] tracking-wider">Mailboxes</div>
                      <div className="space-y-1">
                        <div
                          onClick={() => setGmailViewMode('inbox')}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer ${gmailViewMode === 'inbox' ? 'bg-red-50 text-[#d0021b] font-bold' : 'hover:bg-slate-50 text-slate-700'}`}
                        >
                          <span>Inbox</span>
                          <span className="font-bold text-[#d0021b]">(1)</span>
                        </div>
                        {['Junk Mails', 'Drafts', 'Sent', 'Trash'].map((f) => (
                          <div key={f} onClick={() => setGmailViewMode('inbox')} className="px-2.5 py-1.5 rounded hover:bg-slate-50 text-slate-600 cursor-pointer">
                            {f}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Message List / Reading Pane */}
                    <div className="flex-1 flex flex-col overflow-hidden bg-white">
                      {gmailViewMode === 'inbox' ? (
                        <div className="flex-1 flex flex-col overflow-hidden">
                          {/* Actions Bar */}
                          <div className="flex items-center justify-between px-4 py-2 bg-[#f9f9f9] border-b border-slate-200 shrink-0 text-xs text-slate-700">
                            <div className="flex items-center gap-3">
                              <button type="button" className="px-2.5 py-1 bg-white border border-slate-200 rounded hover:bg-slate-50 cursor-pointer">Delete</button>
                              <button type="button" className="px-2.5 py-1 bg-white border border-slate-200 rounded hover:bg-slate-50 cursor-pointer">Mark as Read</button>
                              <button type="button" className="px-2.5 py-1 bg-white border border-slate-200 rounded hover:bg-slate-50 cursor-pointer">Move to Folder ▾</button>
                            </div>
                            <div className="text-[11px] text-slate-500">Showing 1 - 5 of 5</div>
                          </div>

                          {/* Table Header */}
                          <div className="grid grid-cols-12 px-4 py-2 bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                            <div className="col-span-1 flex items-center gap-2"><input type="checkbox" /></div>
                            <div className="col-span-3">From</div>
                            <div className="col-span-6">Subject</div>
                            <div className="col-span-2 text-right">Date / Time</div>
                          </div>

                          {/* Message Rows */}
                          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 [scrollbar-width:thin]">
                            {/* UNREAD MARBEE EMAIL */}
                            <div
                              onClick={() => setGmailViewMode('email')}
                              className="grid grid-cols-12 px-4 py-3 bg-red-50/40 hover:bg-red-50 cursor-pointer transition border-l-4 border-l-[#d0021b] text-xs items-center"
                            >
                              <div className="col-span-1"><input type="checkbox" /></div>
                              <div className="col-span-3 font-bold text-slate-900 truncate flex items-center gap-1.5">
                                <span>🐝</span>
                                <span>{applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}</span>
                              </div>
                              <div className="col-span-6 font-bold text-[#d0021b] truncate">
                                {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                                <span className="font-normal text-slate-500 ml-1.5">— {applyPersonalization(preheader || 'Discover the latest news and offers', selectedTestProfile)}</span>
                              </div>
                              <div className="col-span-2 text-right font-bold text-slate-800 text-[11px]">
                                {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                              </div>
                            </div>

                            {/* Simulated Rediff Emails */}
                            {[
                              { from: 'Rediff Enterprise News', subj: 'Quarterly Financial Market Update & Economic Indices', time: 'Yesterday' },
                              { from: 'HDFC NetBanking Alert', subj: 'Monthly Account Statement Generated for Account ending 4128', time: 'Yesterday' },
                              { from: 'Telecom Billing Notice', subj: 'Invoice generated for Enterprise High Speed Fiber Connection', time: '25 Aug' },
                              { from: 'IT Infrastructure Dept', subj: 'Scheduled Server Maintenance Window: Saturday 11:00 PM', time: '24 Aug' },
                            ].map((m, idx) => (
                              <div
                                key={idx}
                                onClick={() => setGmailViewMode('email')}
                                className="grid grid-cols-12 px-4 py-3 hover:bg-slate-50 cursor-pointer transition text-xs items-center text-slate-600"
                              >
                                <div className="col-span-1"><input type="checkbox" /></div>
                                <div className="col-span-3 text-slate-700 truncate">{m.from}</div>
                                <div className="col-span-6 text-slate-800 truncate">{m.subj}</div>
                                <div className="col-span-2 text-right text-slate-400 text-[11px]">{m.time}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* REDIFF READING VIEW */
                        <div className="flex-1 flex flex-col overflow-hidden bg-white">
                          <div className="flex items-center justify-between px-6 py-2 border-b border-slate-200 shrink-0 bg-[#f9f9f9]">
                            <button
                              type="button"
                              onClick={() => setGmailViewMode('inbox')}
                              className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                            >
                              <ArrowLeft className="h-3.5 w-3.5" />
                              <span>Back to Inbox</span>
                            </button>

                            <div className="flex items-center gap-2">
                              <button type="button" className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer">
                                <Reply className="h-3.5 w-3.5" />
                                <span>Reply</span>
                              </button>
                              <button type="button" className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer">
                                <Forward className="h-3.5 w-3.5" />
                                <span>Forward</span>
                              </button>
                              <button type="button" className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer">
                                <Printer className="h-3.5 w-3.5" />
                                <span>Print</span>
                              </button>
                            </div>
                          </div>

                          <div className="flex-1 overflow-y-auto [scrollbar-width:thin] p-6 max-w-[900px] mx-auto w-full">
                            {/* Rediff Classic Header Table */}
                            <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-4 text-xs space-y-1">
                              <div><span className="font-bold text-slate-500 w-16 inline-block">Subject:</span> <strong className="text-sm text-slate-900">{applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}</strong></div>
                              <div><span className="font-bold text-slate-500 w-16 inline-block">From:</span> <span>{applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)} &lt;{applyPersonalization(fromEmail || 'hello@marbee.io', selectedTestProfile)}&gt;</span></div>
                              <div><span className="font-bold text-slate-500 w-16 inline-block">To:</span> <span>{selectedTestProfile.name} &lt;{selectedTestProfile.email}&gt;</span></div>
                              <div><span className="font-bold text-slate-500 w-16 inline-block">Date:</span> <span>{new Date().toLocaleString()}</span></div>
                            </div>

                            <div className="w-full flex justify-center bg-white my-2 border border-slate-200 rounded p-2">
                              <iframe
                                title="Rediff Email Body"
                                srcDoc={buildIframeSrc(false)}
                                className="w-full border-0 block"
                                style={{
                                  width: '100%',
                                  height: `${previewIframeHeight}px`,
                                  minHeight: '400px',
                                  display: 'block',
                                }}
                                scrolling="no"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* GMAIL DESKTOP WEB VIEW (DEFAULT & FALLBACK) */
                <div className="flex flex-1 flex-col overflow-hidden bg-[#f6f8fc]">
                  {/* 1. Gmail Top Navigation Header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-[#f6f8fc] shrink-0 gap-4">
                    {/* Left: Menu & Gmail Logo */}
                    <div className="flex items-center gap-3 w-56 shrink-0">
                      <button type="button" className="p-2 hover:bg-slate-200/70 rounded-full text-slate-700 transition cursor-pointer">
                        <Menu className="h-5 w-5" />
                      </button>
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setGmailViewMode('inbox')}>
                        <svg className="w-6 h-5" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M1.5 6.5v12a2 2 0 0 0 2 2h2.5V11L12 15l6-4v9.5h2.5a2 2 0 0 0 2-2v-12l-10.5 7z"/>
                          <path fill="#34A853" d="M22.5 6.5l-10.5 7L1.5 6.5 3 4.5l9 6 9-6z"/>
                          <path fill="#EA4335" d="M1.5 6.5l10.5 7 10.5-7V4.5a2 2 0 0 0-2-2h-17a2 2 0 0 0-2 2z"/>
                        </svg>
                        <span className="text-xl font-normal text-slate-700 tracking-tight" style={{ fontFamily: 'Google Sans, Roboto, Arial, sans-serif' }}>
                          Gmail
                        </span>
                      </div>
                    </div>

                    {/* Center: Search Box */}
                    <div className="flex-1 max-w-[720px]">
                      <div className="flex items-center gap-3 bg-[#eaf1fb] hover:bg-[#e1eaf8] transition rounded-full px-4 py-2 shadow-2xs border border-transparent focus-within:bg-white focus-within:shadow-md focus-within:border-slate-200">
                        <Search className="h-4 w-4 text-slate-600 shrink-0" />
                        <input
                          type="text"
                          placeholder="Search mail"
                          defaultValue={applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                          className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-500 outline-hidden font-sans"
                          readOnly
                        />
                        <button type="button" className="p-1 hover:bg-slate-300/50 rounded-full text-slate-600 transition cursor-pointer">
                          <SlidersHorizontal className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Right: Status Pill, Help, Settings, Upgrade, Apps, Avatar */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1.5 bg-[#e6f4ea] text-[#137333] border border-[#ceead6] px-3 py-1 rounded-full text-xs font-semibold cursor-pointer">
                        <span className="w-2 h-2 rounded-full bg-[#1e8e3e]" />
                        <span>Active</span>
                        <ChevronDown className="h-3 w-3" />
                      </div>
                      <button type="button" className="p-2 hover:bg-slate-200/70 rounded-full text-slate-600 transition cursor-pointer">
                        <HelpCircle className="h-5 w-5" />
                      </button>
                      <button type="button" className="p-2 hover:bg-slate-200/70 rounded-full text-slate-600 transition cursor-pointer">
                        <Settings className="h-5 w-5" />
                      </button>
                      <div className="px-3 py-1 rounded-full bg-[#ede7f6] hover:bg-[#d1c4e9] text-[#5e35b1] text-xs font-semibold transition cursor-pointer">
                        Upgrade
                      </div>
                      <button type="button" className="p-2 hover:bg-slate-200/70 rounded-full text-violet-600 transition cursor-pointer">
                        <Sparkles className="h-5 w-5" />
                      </button>
                      <button type="button" className="p-2 hover:bg-slate-200/70 rounded-full text-slate-600 transition cursor-pointer">
                        <Grid className="h-5 w-5" />
                      </button>
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-purple-700 text-white flex items-center justify-center font-bold text-sm shadow-xs cursor-pointer">
                        M
                      </div>
                    </div>
                  </div>

                {/* 2. Main Gmail Layout */}
                <div className="flex flex-1 overflow-hidden">
                  {/* Leftmost Narrow Icon Strip */}
                  <div className="w-14 bg-[#f6f8fc] flex flex-col items-center py-2 gap-4 shrink-0">
                    <button
                      type="button"
                      onClick={() => setGmailViewMode('inbox')}
                      className="relative p-2.5 bg-[#d3e3fd] text-slate-900 rounded-2xl flex flex-col items-center gap-1 cursor-pointer"
                    >
                      <Mail className="h-5 w-5" />
                      <span className="absolute -top-1 -right-1 bg-[#b3261e] text-white text-[9px] font-bold px-1 py-0.2 rounded-full">1</span>
                      <span className="text-[10px] font-medium">Mail</span>
                    </button>
                    <button type="button" className="p-2.5 text-slate-600 hover:bg-slate-200/60 rounded-2xl flex flex-col items-center gap-1 transition cursor-pointer">
                      <MessageSquare className="h-5 w-5" />
                      <span className="text-[10px] font-medium">Chat</span>
                    </button>
                    <button type="button" className="p-2.5 text-slate-600 hover:bg-slate-200/60 rounded-2xl flex flex-col items-center gap-1 transition cursor-pointer">
                      <Video className="h-5 w-5" />
                      <span className="text-[10px] font-medium">Meet</span>
                    </button>
                  </div>

                  {/* Left Sidebar Navigation (Clean Without Labels) */}
                  <div className="w-56 bg-[#f6f8fc] flex flex-col py-1 px-3 shrink-0 overflow-y-auto [scrollbar-width:thin]">
                    {/* Compose Button */}
                    <div className="mb-3">
                      <div className="flex items-center gap-3 bg-[#c2e7ff] hover:bg-[#b3d7ff] rounded-2xl px-5 py-3.5 cursor-pointer shadow-xs transition w-fit">
                        <Pencil className="h-4 w-4 text-slate-800" />
                        <span className="text-sm font-medium text-slate-800" style={{ fontFamily: 'Google Sans, Roboto, Arial, sans-serif' }}>
                          Compose
                        </span>
                      </div>
                    </div>

                    {/* Nav Items */}
                    <div className="space-y-0.5 text-xs">
                      <div
                        onClick={() => setGmailViewMode('inbox')}
                        className={`flex items-center justify-between px-3 py-1.5 rounded-r-full cursor-pointer transition ${gmailViewMode === 'inbox' ? 'bg-[#d3e3fd] font-bold text-slate-900' : 'text-slate-700 hover:bg-slate-200/50'}`}
                      >
                        <div className="flex items-center gap-3">
                          <Archive className="h-4 w-4" />
                          <span>Inbox</span>
                        </div>
                        <span className="text-[11px] font-bold">1</span>
                      </div>
                      {[
                        { icon: Star, label: 'Starred', count: '' },
                        { icon: Clock, label: 'Snoozed', count: '' },
                        { icon: Send, label: 'Sent', count: '' },
                        { icon: FileText, label: 'Drafts', count: '3' },
                        { icon: Tag, label: 'Purchases', count: '' },
                        { icon: ChevronDown, label: 'More', count: '' },
                      ].map((item) => (
                        <div
                          key={item.label}
                          onClick={() => setGmailViewMode('inbox')}
                          className="flex items-center justify-between px-3 py-1.5 rounded-r-full text-slate-700 hover:bg-slate-200/50 cursor-pointer transition"
                        >
                          <div className="flex items-center gap-3">
                            <item.icon className="h-4 w-4 text-slate-500" />
                            <span>{item.label}</span>
                          </div>
                          {item.count && <span className="text-[11px] text-slate-600">{item.count}</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Center Main Email Pane */}
                  <div className="flex-1 bg-white rounded-2xl my-2 mr-2 overflow-hidden flex flex-col shadow-xs border border-slate-200/60">
                    {/* INBOX LIST VIEW */}
                    {gmailViewMode === 'inbox' ? (
                      <div className="flex flex-1 flex-col overflow-hidden">
                        {/* Top Action Bar for Inbox */}
                        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200/70 shrink-0 bg-white">
                          <div className="flex items-center gap-2 text-slate-600">
                            <button type="button" className="p-1.5 hover:bg-slate-100 rounded-md transition cursor-pointer flex items-center gap-0.5">
                              <div className="w-3.5 h-3.5 border border-slate-400 rounded-xs" />
                              <ChevronDown className="h-3 w-3 text-slate-500" />
                            </button>
                            <button type="button" className="p-2 hover:bg-slate-100 rounded-full transition cursor-pointer" title="Refresh">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" className="p-2 hover:bg-slate-100 rounded-full transition cursor-pointer" title="More">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>1-9 of 9</span>
                            <div className="flex items-center gap-0.5">
                              <button type="button" className="p-1.5 hover:bg-slate-100 rounded-full transition cursor-pointer">
                                <ChevronLeft className="h-4 w-4" />
                              </button>
                              <button type="button" className="p-1.5 hover:bg-slate-100 rounded-full transition cursor-pointer">
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Category Tabs: Primary, Promotions, Social, Updates */}
                        <div className="flex items-center border-b border-slate-200 shrink-0 text-xs font-semibold text-slate-600">
                          {/* Primary */}
                          <div
                            onClick={() => setActiveInboxTab('primary')}
                            className={`flex items-center gap-3 px-6 py-3 cursor-pointer relative transition ${activeInboxTab === 'primary' ? 'text-[#0b57d0]' : 'hover:bg-slate-50'}`}
                          >
                            <Archive className="h-4 w-4" />
                            <span>Primary</span>
                            {activeInboxTab === 'primary' && (
                              <div className="absolute bottom-0 inset-x-0 h-0.5 bg-[#0b57d0] rounded-t-full" />
                            )}
                          </div>

                          {/* Promotions */}
                          <div
                            onClick={() => setActiveInboxTab('promotions')}
                            className={`flex items-center gap-3 px-6 py-3 cursor-pointer relative transition ${activeInboxTab === 'promotions' ? 'text-[#0b57d0]' : 'hover:bg-slate-50'}`}
                          >
                            <Tag className="h-4 w-4 text-slate-500" />
                            <span>Promotions</span>
                            {activeInboxTab === 'promotions' && (
                              <div className="absolute bottom-0 inset-x-0 h-0.5 bg-[#0b57d0] rounded-t-full" />
                            )}
                          </div>

                          {/* Social */}
                          <div
                            onClick={() => setActiveInboxTab('social')}
                            className={`flex items-center gap-2 px-6 py-3 cursor-pointer relative transition ${activeInboxTab === 'social' ? 'text-[#0b57d0]' : 'hover:bg-slate-50'}`}
                          >
                            <Users className="h-4 w-4 text-slate-500" />
                            <span>Social</span>
                            <span className="text-[10px] font-bold bg-[#0b57d0] text-white px-1.5 py-0.2 rounded-full">1 new</span>
                            {activeInboxTab === 'social' && (
                              <div className="absolute bottom-0 inset-x-0 h-0.5 bg-[#0b57d0] rounded-t-full" />
                            )}
                          </div>

                          {/* Updates */}
                          <div
                            onClick={() => setActiveInboxTab('updates')}
                            className={`flex items-center gap-2 px-6 py-3 cursor-pointer relative transition ${activeInboxTab === 'updates' ? 'text-[#0b57d0]' : 'hover:bg-slate-50'}`}
                          >
                            <HelpCircle className="h-4 w-4 text-slate-500" />
                            <span>Updates</span>
                            <span className="text-[10px] font-bold bg-[#e37400] text-white px-1.5 py-0.2 rounded-full">36 new</span>
                            {activeInboxTab === 'updates' && (
                              <div className="absolute bottom-0 inset-x-0 h-0.5 bg-[#0b57d0] rounded-t-full" />
                            )}
                          </div>
                        </div>

                        {/* Email Rows List */}
                        <div className="flex-1 overflow-y-auto [scrollbar-width:thin] divide-y divide-slate-100">
                          {/* TOP 1ST EMAIL (THE ONLY UNSEEN / UNREAD EMAIL) */}
                          <div
                            onClick={() => setGmailViewMode('email')}
                            className="flex items-center gap-3 px-4 py-2.5 bg-white font-bold text-slate-900 border-l-4 border-l-[#0b57d0] hover:bg-[#eaf1fb]/70 cursor-pointer transition group shadow-2xs"
                            title="Click to open email preview"
                          >
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="w-3.5 h-3.5 border border-slate-400 rounded-xs group-hover:border-slate-600" />
                              <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                            </div>

                            <div className="w-48 shrink-0 flex items-center gap-2">
                              {/* BIMI Logo Avatar */}
                              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-[10px] text-white shrink-0 font-bold shadow-2xs">
                                🐝
                              </div>
                              <span className="font-bold text-xs text-slate-900 truncate" style={{ fontFamily: 'Google Sans, Roboto, Arial, sans-serif' }}>
                                {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}
                              </span>
                            </div>

                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900 shrink-0 truncate max-w-[320px]">
                                {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                              </span>
                              <span className="text-xs text-slate-500 font-normal truncate">
                                - {applyPersonalization(preheader || 'Discover the latest updates, offers and exclusive perks available for you.', selectedTestProfile)}
                              </span>
                            </div>

                            <div className="text-[11px] font-bold text-slate-900 shrink-0 pl-2">
                              {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </div>
                          </div>

                          {/* ALL OTHER SIMULATED EMAILS (SEEN / READ) */}
                          {[
                            { from: 'Zomato Order', subj: 'Your Zomato order from BOX8 - Desi Meals', preview: "Hi Naman Sharma, Thank you for ordering from BOX8 - Desi Meals ORDER ID: 8518781889 Delivered BOX8 - D...", time: '6:45 PM' },
                            { from: 'Monika', subj: 'What Amazon Really Looks For in Data Analysts | Live Tonight 8:30 PM', preview: "Hi There, Most aspiring Data Analysts focus only on SQL questions. That's exa...", time: '5:30 PM' },
                            { from: 'Simple', subj: 'Order update: Plan #5936ADP27', preview: 'Your subscription has been activated successfully with all enterprise features...', time: '4:20 PM' },
                            { from: "Paul O'Mahony", subj: 'Missed the Revolution? Read This. 💡', preview: 'Invitation: 2-Day LIVE Online Workshop Starting Next Week — reserve your seat now...', time: '3:15 PM' },
                            { from: 'Neil Patel', subj: 'This content earns the most AI citations', preview: "Social content isn't winning against organic citation density in modern search algorithms...", time: '2:30 PM' },
                            { from: 'Sonny Sangha', subj: "Apple's New M5 Ultra", preview: "Apple's new M5 Ultra makes local AI genuinely serious for developers and creative teams...", time: '1:10 PM' },
                            { from: 'Akshitha', subj: 'Your seat has been confirmed', preview: "Hi, Your seat has been confirmed for today's session. We're going live now. JOIN LIVE NOW 👉...", time: '11:00 AM' },
                            { from: 'AWeber Team', subj: 'Convert Like Crazy starts at noon', preview: 'Today at 12 PM ET Hi Naman, Today we build a sign-up form and landing page that actually convert...', time: '10:45 AM' },
                          ].map((mail, idx) => (
                            <div
                              key={idx}
                              onClick={() => setGmailViewMode('email')}
                              className="flex items-center gap-3 px-4 py-2.5 bg-slate-50/50 hover:bg-slate-100 text-slate-600 cursor-pointer transition"
                            >
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="w-3.5 h-3.5 border border-slate-300 rounded-xs" />
                                <Star className="h-4 w-4 text-slate-300 hover:text-amber-400" />
                              </div>
                              <div className="w-48 shrink-0">
                                <span className="text-xs truncate block font-normal text-slate-600" style={{ fontFamily: 'Google Sans, Roboto, Arial, sans-serif' }}>
                                  {mail.from}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0 flex items-center gap-2">
                                <span className="text-xs shrink-0 truncate max-w-[320px] font-normal text-slate-700">
                                  {mail.subj}
                                </span>
                                <span className="text-xs text-slate-400 truncate">
                                  - {mail.preview}
                                </span>
                              </div>
                              <div className="text-[11px] shrink-0 pl-2 font-normal text-slate-400">
                                {mail.time}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      /* OPEN EMAIL READING VIEW */
                      <div className="flex flex-1 flex-col overflow-hidden bg-white">
                        {/* Email Action Toolbar with Back Button */}
                        <div className="flex items-center justify-between px-6 py-2 border-b border-slate-200/70 shrink-0 bg-white">
                          {/* Left Actions */}
                          <div className="flex items-center gap-1 text-slate-600">
                            <button
                              type="button"
                              onClick={() => setGmailViewMode('inbox')}
                              className="p-2 hover:bg-slate-100 rounded-full transition cursor-pointer flex items-center gap-1 text-slate-700 font-bold text-xs"
                              title="Back to inbox"
                            >
                              <ArrowLeft className="h-4 w-4" />
                            </button>
                            <button type="button" className="p-2 hover:bg-slate-100 rounded-full transition cursor-pointer" title="Archive">
                              <Archive className="h-4 w-4" />
                            </button>
                            <button type="button" className="p-2 hover:bg-slate-100 rounded-full transition cursor-pointer" title="Report spam">
                              <AlertTriangle className="h-4 w-4" />
                            </button>
                            <button type="button" className="p-2 hover:bg-slate-100 rounded-full transition cursor-pointer" title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </button>
                            <span className="w-[1px] h-4 bg-slate-200 mx-1" />
                            <button type="button" className="p-2 hover:bg-slate-100 rounded-full transition cursor-pointer" title="Mark as unread">
                              <Mail className="h-4 w-4" />
                            </button>
                            <button type="button" className="p-2 hover:bg-slate-100 rounded-full transition cursor-pointer" title="Snooze">
                              <Clock className="h-4 w-4" />
                            </button>
                            <button type="button" className="p-2 hover:bg-slate-100 rounded-full transition cursor-pointer" title="Move to">
                              <Folder className="h-4 w-4" />
                            </button>
                            <button type="button" className="p-2 hover:bg-slate-100 rounded-full transition cursor-pointer" title="Labels">
                              <Tag className="h-4 w-4" />
                            </button>
                            <button type="button" className="p-2 hover:bg-slate-100 rounded-full transition cursor-pointer" title="More">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>

                          {/* Right Actions */}
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>1 of 84,575</span>
                            <div className="flex items-center gap-0.5">
                              <button type="button" className="p-1.5 hover:bg-slate-100 rounded-full transition cursor-pointer">
                                <ChevronLeft className="h-4 w-4" />
                              </button>
                              <button type="button" className="p-1.5 hover:bg-slate-100 rounded-full transition cursor-pointer">
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>
                            <span className="w-[1px] h-4 bg-slate-200 mx-1" />
                            <button type="button" className="px-2 py-1 hover:bg-slate-100 rounded-md text-[11px] font-semibold text-slate-700 flex items-center gap-1.5 transition cursor-pointer">
                              <span className="w-2.5 h-2.5 bg-red-600 rounded-2xs text-white text-[7px] font-black flex items-center justify-center">A</span>
                              <span>Convert to PDF</span>
                            </button>
                            <button type="button" className="p-1.5 hover:bg-slate-100 rounded-full transition cursor-pointer" title="Print all">
                              <Printer className="h-4 w-4 text-slate-600" />
                            </button>
                            <button type="button" className="p-1.5 hover:bg-slate-100 rounded-full transition cursor-pointer" title="In new window">
                              <ExternalLink className="h-4 w-4 text-slate-600" />
                            </button>
                          </div>
                        </div>

                        {/* Scrollable Email Reading Container (Clean Bounded Height) */}
                        <div className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin] bg-white">
                          <div className="max-w-[850px] mx-auto px-8 py-6">
                            {/* Email Subject Title (Full clean subject line only) */}
                            <div className="flex items-center gap-2 mb-5">
                              <h1 className="text-xl font-normal text-slate-900 leading-snug tracking-tight" style={{ fontFamily: 'Google Sans, Roboto, Arial, sans-serif' }}>
                                {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                              </h1>
                              <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-bold rounded-sm shrink-0">
                                Inbox x
                              </span>
                            </div>

                            {/* Sender Information Header with BIMI Marbee Brand Icon */}
                            <div className="flex items-start justify-between mb-6 pb-4 border-b border-slate-100">
                              <div className="flex items-start gap-3">
                                {/* BIMI Certified Marbee Brand Avatar */}
                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-600 via-purple-600 to-indigo-600 shadow-xs flex items-center justify-center text-white shrink-0 relative ring-2 ring-violet-100">
                                  <span className="text-base font-black">🐝</span>
                                  {/* BIMI Verified Blue Check Badge */}
                                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center shadow-xs" title="BIMI Certified Brand">
                                    <Check className="w-2.5 h-2.5 text-white stroke-[3.5]" />
                                  </div>
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-sm text-slate-900" style={{ fontFamily: 'Google Sans, Roboto, Arial, sans-serif' }}>
                                      {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}
                                    </span>
                                    <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 fill-blue-500 text-white" />
                                    <span className="text-xs text-slate-500">&lt;{applyPersonalization(fromEmail || 'hello@marbee.io', selectedTestProfile)}&gt;</span>
                                    <button type="button" className="text-xs text-blue-600 hover:underline font-medium cursor-pointer">
                                      Unsubscribe
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                                    <span>to me</span>
                                    <ChevronDown className="h-3 w-3 text-slate-400 cursor-pointer" />
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 text-slate-500 text-xs shrink-0">
                                <span>{new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} (just now)</span>
                                <button type="button" className="p-1 hover:bg-slate-100 rounded-full transition cursor-pointer" title="Star message">
                                  <Star className="h-4 w-4" />
                                </button>
                                <button type="button" className="p-1 hover:bg-slate-100 rounded-full transition cursor-pointer" title="Add reaction">
                                  <Smile className="h-4 w-4" />
                                </button>
                                <button type="button" className="p-1 hover:bg-slate-100 rounded-full transition cursor-pointer" title="Reply">
                                  <Reply className="h-4 w-4" />
                                </button>
                                <button type="button" className="p-1 hover:bg-slate-100 rounded-full transition cursor-pointer" title="More options">
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            {/* ACTUAL EMAIL CREATIVE CONTAINER (Seamless Iframe, No Infinite Scroll) */}
                            <div className="w-full flex justify-center bg-white my-2">
                              <iframe
                                title="Gmail Email Body"
                                srcDoc={buildIframeSrc(false)}
                                className="w-full border-0 block"
                                style={{
                                  width: '100%',
                                  height: `${previewIframeHeight}px`,
                                  minHeight: '400px',
                                  display: 'block',
                                }}
                                scrolling="no"
                              />
                            </div>

                            {/* Bottom Reply / Forward Action Bar */}
                            <div className="flex items-center gap-3 mt-10 pt-6 border-t border-slate-100">
                              <button
                                type="button"
                                className="px-6 py-2 rounded-full border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-2 transition cursor-pointer"
                              >
                                <Reply className="h-3.5 w-3.5" />
                                <span>Reply</span>
                              </button>
                              <button
                                type="button"
                                className="px-6 py-2 rounded-full border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-2 transition cursor-pointer"
                              >
                                <Forward className="h-3.5 w-3.5" />
                                <span>Forward</span>
                              </button>
                              <button
                                type="button"
                                className="p-2 rounded-full border border-slate-300 hover:bg-slate-50 text-slate-500 transition cursor-pointer"
                                title="Add reaction"
                              >
                                <Smile className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Add-ons Sidebar */}
                  <div className="w-14 bg-[#f6f8fc] flex flex-col items-center py-4 gap-6 shrink-0">
                    <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-blue-600 font-bold text-xs shadow-2xs cursor-pointer">
                      31
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-amber-500 shadow-2xs cursor-pointer">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-blue-600 shadow-2xs cursor-pointer">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-blue-500 shadow-2xs cursor-pointer">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="w-8 h-8 rounded-full hover:bg-slate-200/60 flex items-center justify-center text-slate-500 cursor-pointer transition">
                      <Plus className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* MOBILE: iPhone 15 Pro Frame with Authentic ESP Mobile UI */}
            {viewport === 'mobile' && (
              <div className="flex flex-1 items-start justify-center py-8 px-4 overflow-y-auto bg-[#f6f8fc]">
                <div className="relative shrink-0 mb-8" style={{ width: 390, height: 844 }}>
                  <div className="absolute inset-0 rounded-[50px] bg-gradient-to-b from-[#2c2c2e] via-[#1c1c1e] to-[#0a0a0c] shadow-[0_30px_70px_rgba(0,0,0,0.5),0_0_0_4px_#3a3a3c] overflow-hidden">
                    {/* Hardware Buttons */}
                    <div className="absolute -left-[4px] top-24 w-[4px] h-8 bg-[#3a3a3c] rounded-l-md" />
                    <div className="absolute -left-[4px] top-38 w-[4px] h-12 bg-[#3a3a3c] rounded-l-md" />
                    <div className="absolute -left-[4px] top-54 w-[4px] h-12 bg-[#3a3a3c] rounded-l-md" />
                    <div className="absolute -right-[4px] top-34 w-[4px] h-16 bg-[#3a3a3c] rounded-r-md" />

                    {/* Screen Bezel */}
                    <div className="absolute inset-[3.5px] rounded-[47px] bg-[#111315] overflow-hidden text-white flex flex-col font-sans">
                      {/* Dynamic Island */}
                      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full z-30 flex items-center justify-between px-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#1c1c1e]" />
                        <div className="w-2 h-2 rounded-full bg-[#0d2a45]/80 ring-1 ring-blue-900/40" />
                      </div>

                      {/* iOS Status Bar */}
                      <div className="flex items-center justify-between px-7 pt-3.5 pb-1 shrink-0 z-20 text-white select-none">
                        <span className="text-[13px] font-semibold tracking-tight">
                          {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false })}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <div className="flex gap-0.5 items-end h-2.5">
                            <div className="w-[2.5px] h-1 bg-white rounded-2xs" />
                            <div className="w-[2.5px] h-1.5 bg-white rounded-2xs" />
                            <div className="w-[2.5px] h-2 bg-white rounded-2xs" />
                            <div className="w-[2.5px] h-2.5 bg-white rounded-2xs" />
                          </div>
                          <Wifi className="h-3.5 w-3.5 text-white stroke-[2.5]" />
                          <div className="flex items-center border border-white/70 rounded-md px-1 py-0.2 h-3 text-[9px] font-bold">
                            <span>69</span>
                          </div>
                        </div>
                      </div>

                      {/* CONDITIONAL: ESP MOBILE VIEW (OUTLOOK vs YAHOO vs REDIFF vs GMAIL) */}
                      {selectedEsp === 'outlook' ? (
                        /* OUTLOOK iOS MOBILE APP VIEW */
                        gmailViewMode === 'inbox' ? (
                          <div className="flex-1 flex flex-col overflow-hidden bg-[#1f1f1f] relative">
                            {/* Outlook Mobile Blue Top Header */}
                            <div className="bg-[#0078d4] px-4 pt-2 pb-3 text-white shrink-0">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-full bg-[#004e8c] text-white flex items-center justify-center font-bold text-xs border border-white/40 shadow-xs">
                                    {selectedTestProfile.firstName.charAt(0)}
                                  </div>
                                  <span className="text-base font-bold tracking-tight">Inbox</span>
                                </div>
                                <div className="flex items-center gap-3 text-white">
                                  <Search className="h-4 w-4 cursor-pointer" />
                                  <SlidersHorizontal className="h-4 w-4 cursor-pointer" />
                                </div>
                              </div>

                              {/* Focused / Other Tabs */}
                              <div className="flex items-center gap-2">
                                <button type="button" className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold text-white shadow-2xs">
                                  Focused
                                </button>
                                <button type="button" className="px-3 py-1 text-white/70 hover:text-white rounded-full text-xs font-medium">
                                  Other
                                </button>
                              </div>
                            </div>

                            {/* Message List */}
                            <div className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] divide-y divide-white/5 pb-20">
                              {/* Active Unread Marbee Email */}
                              <div
                                onClick={() => setGmailViewMode('email')}
                                className="flex items-start gap-3 px-4 py-3 bg-[#2a2a2a] hover:bg-[#333333] cursor-pointer transition relative"
                              >
                                <div className="w-2 h-2 rounded-full bg-[#0078d4] self-center shrink-0" />
                                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-violet-600 via-purple-600 to-indigo-600 flex items-center justify-center text-sm font-bold text-white shrink-0 relative shadow-xs">
                                  <span>🐝</span>
                                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border border-[#2a2a2a] flex items-center justify-center">
                                    <Check className="w-2 h-2 text-white stroke-[3.5]" />
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white truncate">
                                      {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}
                                    </span>
                                    <span className="text-[10px] font-bold text-[#0078d4]">
                                      {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                    </span>
                                  </div>
                                  <div className="text-xs font-bold text-white truncate mt-0.5">
                                    {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                                  </div>
                                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                                    {applyPersonalization(preheader || 'Discover the latest updates, offers and exclusive perks available for you.', selectedTestProfile)}
                                  </div>
                                </div>
                              </div>

                              {/* Simulated Outlook Corporate Emails */}
                              {[
                                { from: 'Microsoft 365 Security', subj: 'Weekly Security & Compliance Digest', preview: 'Review active identity protection and device health...', time: 'Yesterday' },
                                { from: 'Azure DevOps Services', subj: 'Build pipeline succeeded: Production v2.4.1', preview: 'Deployment job succeeded for cluster us-west-2...', time: 'Yesterday' },
                                { from: 'DocuSign System', subj: 'Please DocuSign: Enterprise Master Agreement', preview: 'All stakeholders have completed their signatures...', time: '25 Aug' },
                              ].map((m, i) => (
                                <div
                                  key={i}
                                  onClick={() => setGmailViewMode('email')}
                                  className="flex items-start gap-3 px-4 py-3 hover:bg-[#252525] cursor-pointer transition opacity-80"
                                >
                                  <div className="w-2 h-2 rounded-full bg-transparent self-center shrink-0" />
                                  <div className="w-9 h-9 rounded-full bg-slate-700 text-slate-200 flex items-center justify-center text-xs font-bold shrink-0">
                                    {m.from.charAt(0)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-medium text-slate-300 truncate">{m.from}</span>
                                      <span className="text-[10px] text-slate-500">{m.time}</span>
                                    </div>
                                    <div className="text-xs text-slate-200 truncate mt-0.5">{m.subj}</div>
                                    <div className="text-[11px] text-slate-500 truncate mt-0.5">{m.preview}</div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Floating Action Button (New Mail) */}
                            <div className="absolute right-4 bottom-14 z-20">
                              <div className="flex items-center gap-2 bg-[#0078d4] text-white px-4 py-2.5 rounded-full shadow-lg cursor-pointer transition">
                                <Pencil className="h-4 w-4" />
                                <span className="text-xs font-semibold">New mail</span>
                              </div>
                            </div>

                            {/* Bottom Outlook Navigation Bar */}
                            <div className="flex items-center justify-around py-2.5 px-6 bg-[#181818] border-t border-white/10 shrink-0 z-10 text-xs">
                              <div className="flex flex-col items-center text-[#0078d4] cursor-pointer">
                                <Mail className="h-4 w-4" />
                                <span className="text-[10px] font-bold mt-0.5">Mail</span>
                              </div>
                              <div className="flex flex-col items-center text-slate-400 hover:text-white cursor-pointer transition">
                                <Search className="h-4 w-4" />
                                <span className="text-[10px] mt-0.5">Search</span>
                              </div>
                              <div className="flex flex-col items-center text-slate-400 hover:text-white cursor-pointer transition">
                                <Calendar className="h-4 w-4" />
                                <span className="text-[10px] mt-0.5">Calendar</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* OUTLOOK MOBILE READING VIEW */
                          <div className="flex-1 flex flex-col overflow-hidden bg-[#1f1f1f]">
                            {/* Top Outlook Blue Navigation Bar */}
                            <div className="flex items-center justify-between px-3 py-2.5 bg-[#0078d4] text-white shrink-0 shadow-xs">
                              <button
                                type="button"
                                onClick={() => setGmailViewMode('inbox')}
                                className="p-1 hover:bg-white/10 rounded-full transition cursor-pointer"
                              >
                                <ArrowLeft className="h-5 w-5" />
                              </button>
                              <div className="flex items-center gap-3">
                                <Archive className="h-4 w-4 cursor-pointer hover:opacity-80" />
                                <Trash2 className="h-4 w-4 cursor-pointer hover:opacity-80" />
                                <Reply className="h-4 w-4 cursor-pointer hover:opacity-80" />
                                <MoreVertical className="h-4 w-4 cursor-pointer hover:opacity-80" />
                              </div>
                            </div>

                            {/* Scrollable Email Body */}
                            <div className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin] flex flex-col bg-[#1f1f1f]">
                              {/* Subject */}
                              <div className="px-4 pt-3 pb-2 shrink-0">
                                <h2 className="text-sm font-bold text-white leading-snug" style={{ fontFamily: 'Segoe UI, Roboto, Arial, sans-serif' }}>
                                  {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                                </h2>
                              </div>

                              {/* Sender Info */}
                              <div className="flex items-start gap-2.5 px-4 py-2.5 border-b border-white/10 shrink-0">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 via-purple-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0 relative shadow-xs">
                                  <span>🐝</span>
                                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border border-[#1f1f1f] flex items-center justify-center">
                                    <Check className="w-2 h-2 text-white stroke-[3.5]" />
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white">
                                      {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate">
                                    To: {selectedTestProfile.name} &lt;{selectedTestProfile.email}&gt;
                                  </div>
                                </div>
                              </div>

                              {/* Email Body Iframe */}
                              <div className="w-full flex-1 bg-white min-h-[350px]">
                                <iframe
                                  title="Outlook Mobile Body"
                                  srcDoc={buildIframeSrc(true)}
                                  className="w-full border-0 block bg-white"
                                  style={{
                                    width: '100%',
                                    height: `${previewIframeHeight}px`,
                                    minHeight: '350px',
                                    display: 'block',
                                  }}
                                  scrolling="no"
                                />
                              </div>
                            </div>

                            {/* Docked Reply Bar */}
                            <div className="flex items-center gap-2 px-4 py-3 bg-[#181818] border-t border-white/10 shrink-0 z-20">
                              <button
                                type="button"
                                className="flex-1 py-2 rounded-lg bg-[#2a2a2a] hover:bg-[#333333] text-slate-300 text-xs flex items-center gap-2 px-3 transition cursor-pointer"
                              >
                                <Reply className="h-3.5 w-3.5" />
                                <span>Reply to {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}...</span>
                              </button>
                            </div>
                          </div>
                        )
                      ) : selectedEsp === 'yahoo' ? (
                        /* YAHOO MAIL iOS MOBILE APP VIEW */
                        gmailViewMode === 'inbox' ? (
                          <div className="flex-1 flex flex-col overflow-hidden bg-[#1a1325] relative">
                            {/* Yahoo Mobile Purple Top Header */}
                            <div className="bg-[#6001d2] px-4 pt-2 pb-3 text-white shrink-0">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-full bg-white text-[#6001d2] flex items-center justify-center font-bold text-xs shadow-xs">
                                    {selectedTestProfile.firstName.charAt(0)}
                                  </div>
                                  <span className="text-base font-black tracking-tight font-serif">yahoo<span className="text-[#ff0033]">!</span></span>
                                </div>
                                <div className="flex items-center gap-3 text-white">
                                  <Search className="h-4 w-4 cursor-pointer" />
                                  <Sparkles className="h-4 w-4 text-purple-200 cursor-pointer" />
                                </div>
                              </div>

                              {/* Filter Pills */}
                              <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
                                <button type="button" className="px-3 py-0.8 bg-white text-[#6001d2] rounded-full text-xs font-bold shrink-0">
                                  All
                                </button>
                                <button type="button" className="px-3 py-0.8 bg-white/20 text-white rounded-full text-xs font-medium shrink-0">
                                  Subscriptions
                                </button>
                                <button type="button" className="px-3 py-0.8 bg-white/20 text-white rounded-full text-xs font-medium shrink-0">
                                  Deals
                                </button>
                              </div>
                            </div>

                            {/* Message List */}
                            <div className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] divide-y divide-white/5 pb-20">
                              {/* ACTIVE TEMPLATE EMAIL */}
                              <div
                                onClick={() => setGmailViewMode('email')}
                                className="flex items-start gap-3 px-4 py-3 bg-[#2b1f3d] hover:bg-[#382850] cursor-pointer transition relative"
                              >
                                <div className="w-2 h-2 rounded-full bg-[#a855f7] self-center shrink-0" />
                                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-violet-600 via-purple-600 to-indigo-600 flex items-center justify-center text-sm font-bold text-white shrink-0 relative shadow-xs">
                                  <span>🐝</span>
                                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border border-[#2b1f3d] flex items-center justify-center">
                                    <Check className="w-2 h-2 text-white stroke-[3.5]" />
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white truncate">
                                      {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}
                                    </span>
                                    <span className="text-[10px] font-bold text-[#c084fc]">
                                      {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                    </span>
                                  </div>
                                  <div className="text-xs font-bold text-white truncate mt-0.5">
                                    {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                                  </div>
                                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                                    {applyPersonalization(preheader || 'Discover the latest updates, offers and exclusive perks available for you.', selectedTestProfile)}
                                  </div>
                                </div>
                              </div>

                              {/* Simulated Emails */}
                              {[
                                { from: 'Amazon Deals', subj: 'Lightning Deals: Up to 50% Off Electronics', preview: 'Check out today\'s top discounts curated...', time: 'Yesterday' },
                                { from: 'The New York Times', subj: 'Morning Briefing: Top Global Headlines', preview: 'Here is what you need to know to start your day...', time: 'Yesterday' },
                              ].map((m, i) => (
                                <div
                                  key={i}
                                  onClick={() => setGmailViewMode('email')}
                                  className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 cursor-pointer transition opacity-80"
                                >
                                  <div className="w-2 h-2 rounded-full bg-transparent self-center shrink-0" />
                                  <div className="w-9 h-9 rounded-full bg-purple-950/80 text-purple-200 flex items-center justify-center text-xs font-bold shrink-0">
                                    {m.from.charAt(0)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-medium text-slate-300 truncate">{m.from}</span>
                                      <span className="text-[10px] text-slate-500">{m.time}</span>
                                    </div>
                                    <div className="text-xs text-slate-200 truncate mt-0.5">{m.subj}</div>
                                    <div className="text-[11px] text-slate-500 truncate mt-0.5">{m.preview}</div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Floating Action Button (Compose) */}
                            <div className="absolute right-4 bottom-14 z-20">
                              <div className="flex items-center gap-2 bg-[#6001d2] text-white px-4 py-2.5 rounded-full shadow-lg cursor-pointer transition">
                                <Pencil className="h-4 w-4" />
                                <span className="text-xs font-semibold">Compose</span>
                              </div>
                            </div>

                            {/* Bottom Navigation */}
                            <div className="flex items-center justify-around py-2.5 px-6 bg-[#120c1a] border-t border-white/10 shrink-0 z-10 text-xs">
                              <div className="flex flex-col items-center text-[#c084fc] cursor-pointer">
                                <Mail className="h-4 w-4" />
                                <span className="text-[10px] font-bold mt-0.5">Inbox</span>
                              </div>
                              <div className="flex flex-col items-center text-slate-400 hover:text-white cursor-pointer transition">
                                <Search className="h-4 w-4" />
                                <span className="text-[10px] mt-0.5">Search</span>
                              </div>
                              <div className="flex flex-col items-center text-slate-400 hover:text-white cursor-pointer transition">
                                <Star className="h-4 w-4" />
                                <span className="text-[10px] mt-0.5">Starred</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* YAHOO MOBILE READING VIEW */
                          <div className="flex-1 flex flex-col overflow-hidden bg-[#1a1325]">
                            <div className="flex items-center justify-between px-3 py-2.5 bg-[#6001d2] text-white shrink-0 shadow-xs">
                              <button
                                type="button"
                                onClick={() => setGmailViewMode('inbox')}
                                className="p-1 hover:bg-white/10 rounded-full transition cursor-pointer"
                              >
                                <ArrowLeft className="h-5 w-5" />
                              </button>
                              <div className="flex items-center gap-3">
                                <Archive className="h-4 w-4 cursor-pointer hover:opacity-80" />
                                <Trash2 className="h-4 w-4 cursor-pointer hover:opacity-80" />
                                <Reply className="h-4 w-4 cursor-pointer hover:opacity-80" />
                                <MoreVertical className="h-4 w-4 cursor-pointer hover:opacity-80" />
                              </div>
                            </div>

                            <div className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin] flex flex-col bg-[#1a1325]">
                              <div className="px-4 pt-3 pb-2 shrink-0">
                                <h2 className="text-sm font-bold text-white leading-snug font-sans">
                                  {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                                </h2>
                              </div>

                              <div className="flex items-start gap-2.5 px-4 py-2.5 border-b border-white/10 shrink-0">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 via-purple-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0 relative shadow-xs">
                                  <span>🐝</span>
                                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border border-[#1a1325] flex items-center justify-center">
                                    <Check className="w-2 h-2 text-white stroke-[3.5]" />
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white">
                                      {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate">
                                    To: {selectedTestProfile.name} &lt;{selectedTestProfile.email}&gt;
                                  </div>
                                </div>
                              </div>

                              <div className="w-full flex-1 bg-white min-h-[350px]">
                                <iframe
                                  title="Yahoo Mobile Body"
                                  srcDoc={buildIframeSrc(true)}
                                  className="w-full border-0 block bg-white"
                                  style={{
                                    width: '100%',
                                    height: `${previewIframeHeight}px`,
                                    minHeight: '350px',
                                    display: 'block',
                                  }}
                                  scrolling="no"
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-2 px-4 py-3 bg-[#120c1a] border-t border-white/10 shrink-0 z-20">
                              <button
                                type="button"
                                className="flex-1 py-2 rounded-lg bg-[#2b1f3d] hover:bg-[#382850] text-purple-200 text-xs flex items-center gap-2 px-3 transition cursor-pointer"
                              >
                                <Reply className="h-3.5 w-3.5" />
                                <span>Reply to {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}...</span>
                              </button>
                            </div>
                          </div>
                        )
                      ) : selectedEsp === 'rediff' ? (
                        /* REDIFFMAIL MOBILE APP VIEW */
                        gmailViewMode === 'inbox' ? (
                          <div className="flex-1 flex flex-col overflow-hidden bg-[#221013] relative">
                            {/* Rediff Mobile Red Top Header */}
                            <div className="bg-[#d0021b] px-4 pt-2 pb-3 text-white shrink-0">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg font-black tracking-tight text-white">rediff<span className="text-yellow-300">mail</span></span>
                                </div>
                                <div className="flex items-center gap-3 text-white">
                                  <Search className="h-4 w-4 cursor-pointer" />
                                  <RotateCcw className="h-4 w-4 cursor-pointer" />
                                </div>
                              </div>
                              <div className="text-xs font-semibold text-white/90">Inbox (1 unread)</div>
                            </div>

                            {/* Message List */}
                            <div className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] divide-y divide-white/5 pb-20">
                              {/* ACTIVE TEMPLATE EMAIL */}
                              <div
                                onClick={() => setGmailViewMode('email')}
                                className="flex items-start gap-3 px-4 py-3 bg-[#3a151b] hover:bg-[#4a1c24] cursor-pointer transition relative"
                              >
                                <div className="w-2 h-2 rounded-full bg-[#d0021b] self-center shrink-0" />
                                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-violet-600 via-purple-600 to-indigo-600 flex items-center justify-center text-sm font-bold text-white shrink-0 relative shadow-xs">
                                  <span>🐝</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white truncate">
                                      {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}
                                    </span>
                                    <span className="text-[10px] font-bold text-[#ff808f]">
                                      {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                    </span>
                                  </div>
                                  <div className="text-xs font-bold text-white truncate mt-0.5">
                                    {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                                  </div>
                                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                                    {applyPersonalization(preheader || 'Discover the latest updates, offers and exclusive perks available for you.', selectedTestProfile)}
                                  </div>
                                </div>
                              </div>

                              {/* Simulated Rediff Emails */}
                              {[
                                { from: 'Rediff Enterprise News', subj: 'Quarterly Financial Market Update', time: 'Yesterday' },
                                { from: 'HDFC NetBanking Alert', subj: 'Monthly Account Statement Generated', time: 'Yesterday' },
                              ].map((m, i) => (
                                <div
                                  key={i}
                                  onClick={() => setGmailViewMode('email')}
                                  className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 cursor-pointer transition opacity-80"
                                >
                                  <div className="w-2 h-2 rounded-full bg-transparent self-center shrink-0" />
                                  <div className="w-9 h-9 rounded-full bg-red-950 text-red-200 flex items-center justify-center text-xs font-bold shrink-0">
                                    {m.from.charAt(0)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-medium text-slate-300 truncate">{m.from}</span>
                                      <span className="text-[10px] text-slate-500">{m.time}</span>
                                    </div>
                                    <div className="text-xs text-slate-200 truncate mt-0.5">{m.subj}</div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Floating Action Button (Write Mail) */}
                            <div className="absolute right-4 bottom-14 z-20">
                              <div className="flex items-center gap-2 bg-[#d0021b] text-white px-4 py-2.5 rounded-full shadow-lg cursor-pointer transition">
                                <Pencil className="h-4 w-4" />
                                <span className="text-xs font-semibold">Write Mail</span>
                              </div>
                            </div>

                            {/* Bottom Navigation */}
                            <div className="flex items-center justify-around py-2.5 px-6 bg-[#160a0c] border-t border-white/10 shrink-0 z-10 text-xs">
                              <div className="flex flex-col items-center text-[#ff808f] cursor-pointer">
                                <Mail className="h-4 w-4" />
                                <span className="text-[10px] font-bold mt-0.5">Mails</span>
                              </div>
                              <div className="flex flex-col items-center text-slate-400 hover:text-white cursor-pointer transition">
                                <Users className="h-4 w-4" />
                                <span className="text-[10px] mt-0.5">Contacts</span>
                              </div>
                              <div className="flex flex-col items-center text-slate-400 hover:text-white cursor-pointer transition">
                                <Settings className="h-4 w-4" />
                                <span className="text-[10px] mt-0.5">Settings</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* REDIFF MOBILE READING VIEW */
                          <div className="flex-1 flex flex-col overflow-hidden bg-[#221013]">
                            <div className="flex items-center justify-between px-3 py-2.5 bg-[#d0021b] text-white shrink-0 shadow-xs">
                              <button
                                type="button"
                                onClick={() => setGmailViewMode('inbox')}
                                className="p-1 hover:bg-white/10 rounded-full transition cursor-pointer"
                              >
                                <ArrowLeft className="h-5 w-5" />
                              </button>
                              <div className="flex items-center gap-3">
                                <Trash2 className="h-4 w-4 cursor-pointer hover:opacity-80" />
                                <Reply className="h-4 w-4 cursor-pointer hover:opacity-80" />
                                <MoreVertical className="h-4 w-4 cursor-pointer hover:opacity-80" />
                              </div>
                            </div>

                            <div className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin] flex flex-col bg-[#221013]">
                              <div className="px-4 pt-3 pb-2 shrink-0">
                                <h2 className="text-sm font-bold text-white leading-snug">
                                  {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                                </h2>
                              </div>

                              <div className="flex items-start gap-2.5 px-4 py-2.5 border-b border-white/10 shrink-0">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 via-purple-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0 relative shadow-xs">
                                  <span>🐝</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white">
                                      {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate">
                                    To: {selectedTestProfile.name} &lt;{selectedTestProfile.email}&gt;
                                  </div>
                                </div>
                              </div>

                              <div className="w-full flex-1 bg-white min-h-[350px]">
                                <iframe
                                  title="Rediff Mobile Body"
                                  srcDoc={buildIframeSrc(true)}
                                  className="w-full border-0 block bg-white"
                                  style={{
                                    width: '100%',
                                    height: `${previewIframeHeight}px`,
                                    minHeight: '350px',
                                    display: 'block',
                                  }}
                                  scrolling="no"
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-2 px-4 py-3 bg-[#160a0c] border-t border-white/10 shrink-0 z-20">
                              <button
                                type="button"
                                className="flex-1 py-2 rounded-lg bg-[#3a151b] hover:bg-[#4a1c24] text-red-200 text-xs flex items-center gap-2 px-3 transition cursor-pointer"
                              >
                                <Reply className="h-3.5 w-3.5" />
                                <span>Reply to {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}...</span>
                              </button>
                            </div>
                          </div>
                        )
                      ) : (
                        /* GMAIL MOBILE VIEW */
                        gmailViewMode === 'inbox' ? (
                        <div className="flex-1 flex flex-col overflow-hidden bg-[#111315] relative">
                          {/* Search Pill Bar */}
                          <div className="px-3 py-1.5 shrink-0">
                            <div className="flex items-center justify-between bg-[#232629] hover:bg-[#2c3034] transition rounded-full px-3.5 py-2 shadow-xs border border-white/5">
                              <div className="flex items-center gap-3">
                                <Menu className="h-4 w-4 text-slate-300 cursor-pointer" />
                                <span className="text-xs text-slate-400 font-normal">Search in mail</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-[#004d40] border border-[#00bfa5] flex items-center justify-center text-[11px] font-bold text-white shadow-2xs cursor-pointer">
                                  N
                                </div>
                                <Sparkles className="h-3.5 w-3.5 text-violet-400 cursor-pointer" />
                              </div>
                            </div>
                          </div>

                          {/* Section Title */}
                          <div className="px-4 py-1 text-[11px] font-semibold text-slate-400 tracking-wide uppercase shrink-0">
                            Primary
                          </div>

                          {/* Email Rows List */}
                          <div className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] divide-y divide-white/5 pb-20">
                            {/* Category: Updates */}
                            <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 cursor-pointer transition">
                              <div className="w-9 h-9 rounded-full bg-[#3d271d] text-[#ff8f6b] flex items-center justify-center shrink-0">
                                <HelpCircle className="h-5 w-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-white">Updates</span>
                                  <span className="text-[10px] font-bold bg-[#3d271d] text-[#ff8f6b] px-2 py-0.5 rounded-full">15 new</span>
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  Groww Digest — Adani Energy's...
                                </div>
                              </div>
                            </div>

                            {/* Category: Promotions */}
                            <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 cursor-pointer transition">
                              <div className="w-9 h-9 rounded-full bg-[#1b382b] text-[#6dd58c] flex items-center justify-center shrink-0">
                                <Tag className="h-5 w-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-white">Promotions</span>
                                  <span className="text-[10px] font-bold bg-[#1b382b] text-[#6dd58c] px-2 py-0.5 rounded-full">27 new</span>
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  Google Cloud Gen AI Academy —...
                                </div>
                              </div>
                            </div>

                            {/* THE ACTIVE TEMPLATE EMAIL (UNSEEN / UNREAD - CLICK TO OPEN) */}
                            <div
                              onClick={() => setGmailViewMode('email')}
                              className="flex items-start gap-3 px-4 py-3 bg-[#1d2228] hover:bg-[#252c34] cursor-pointer transition relative group"
                              title="Tap to preview this email"
                            >
                              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-violet-600 via-purple-600 to-indigo-600 flex items-center justify-center text-sm font-bold text-white shrink-0 relative shadow-xs">
                                <span>🐝</span>
                                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border border-[#1d2228] flex items-center justify-center">
                                  <Check className="w-2 h-2 text-white stroke-[3.5]" />
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-xs font-bold text-white truncate">
                                      {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}
                                    </span>
                                    <CheckCircle2 className="h-3 w-3 text-blue-400 fill-blue-400 text-black shrink-0" />
                                  </div>
                                  <span className="text-[10px] font-bold text-blue-400 shrink-0 ml-1">
                                    {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                  </span>
                                </div>
                                <div className="text-xs font-bold text-slate-100 truncate mt-0.5">
                                  {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {applyPersonalization(preheader || 'Discover the latest updates, offers and exclusive perks available for you.', selectedTestProfile)}
                                </div>
                              </div>
                              <Star className="h-4 w-4 text-amber-400 fill-amber-400 shrink-0 mt-1" />
                            </div>

                            {/* Simulated Seen Emails (Apple, CRED, MakeMyTrip, Uber, etc.) */}
                            {[
                              {
                                icon: '🍎',
                                from: 'Apple',
                                verified: true,
                                subj: 'Introducing the new Mac mini and Mac Studio.',
                                snippet: 'Powered by next-generation Apple silicon with unprecedented performance...',
                                date: '26 Aug',
                              },
                              {
                                icon: '💳',
                                from: 'CRED',
                                verified: true,
                                subj: 'Your credit card bill is due on Aug 30,...',
                                snippet: 'Naman, your credit card payment is due. Pay now to earn coins...',
                                date: '26 Aug',
                              },
                              {
                                icon: '✈️',
                                from: 'MakeMyTrip',
                                verified: true,
                                subj: 'Limited-time Deals on Internationa...',
                                snippet: 'Get more deals with our Take-off Wednesday special sales...',
                                date: '26 Aug',
                              },
                              {
                                icon: '🚗',
                                from: 'Uber',
                                verified: true,
                                subj: 'Now arriving: Train tickets on Uber 🚆',
                                snippet: 'Offers when you buy tickets directly in your Uber ride app...',
                                date: '26 Aug',
                              },
                              {
                                icon: '✉️',
                                from: 'singtel-jobnotification',
                                verified: false,
                                subj: 'New job posted from your search query',
                                snippet: 'Explore 12 new openings matching your software engineer profile...',
                                date: '26 Aug',
                              },
                            ].map((mail, idx) => (
                              <div
                                key={idx}
                                onClick={() => setGmailViewMode('email')}
                                className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 cursor-pointer transition opacity-80"
                              >
                                <div className="w-9 h-9 rounded-full bg-[#232629] border border-white/10 flex items-center justify-center text-sm font-bold text-white shrink-0">
                                  {mail.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1 min-w-0">
                                      <span className="text-xs font-normal text-slate-300 truncate">
                                        {mail.from}
                                      </span>
                                      {mail.verified && <CheckCircle2 className="h-2.5 w-2.5 text-blue-400 fill-blue-400 text-black shrink-0" />}
                                    </div>
                                    <span className="text-[10px] font-normal text-slate-500 shrink-0 ml-1">
                                      {mail.date}
                                    </span>
                                  </div>
                                  <div className="text-xs font-normal text-slate-300 truncate mt-0.5">
                                    {mail.subj}
                                  </div>
                                  <div className="text-[11px] text-slate-500 truncate">
                                    {mail.snippet}
                                  </div>
                                </div>
                                <Star className="h-4 w-4 text-slate-600 shrink-0 mt-1" />
                              </div>
                            ))}
                          </div>

                          {/* Floating Compose Button */}
                          <div className="absolute right-4 bottom-14 z-20">
                            <div className="flex items-center gap-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white px-4 py-3 rounded-2xl shadow-lg cursor-pointer transition">
                              <Pencil className="h-4 w-4" />
                              <span className="text-xs font-semibold">Compose</span>
                            </div>
                          </div>

                          {/* Bottom Navigation Bar */}
                          <div className="flex items-center justify-around py-2.5 px-6 bg-[#181a1c] border-t border-white/10 shrink-0 z-10">
                            <div className="flex items-center justify-center px-4 py-1 rounded-full bg-[#004a77] text-white relative cursor-pointer">
                              <Mail className="h-4 w-4" />
                              <span className="absolute -top-1 -right-1 bg-[#b3261e] text-white text-[8px] font-bold px-1 rounded-full">99+</span>
                            </div>
                            <div className="p-1 text-slate-400 hover:text-white cursor-pointer transition">
                              <Video className="h-4 w-4" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* MOBILE EMAIL READING VIEW */
                        <div className="flex-1 flex flex-col overflow-hidden bg-[#111315]">
                          {/* Top Navigation Action Toolbar */}
                          <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b border-white/10">
                            <button
                              type="button"
                              onClick={() => setGmailViewMode('inbox')}
                              className="p-1.5 hover:bg-white/10 rounded-full transition cursor-pointer text-slate-300"
                              title="Back to inbox"
                            >
                              <ArrowLeft className="h-5 w-5" />
                            </button>
                            <div className="flex items-center gap-3 text-slate-300">
                              <Sparkles className="h-4 w-4 text-violet-400 cursor-pointer" />
                              <Archive className="h-4 w-4 cursor-pointer hover:text-white" />
                              <Trash2 className="h-4 w-4 cursor-pointer hover:text-white" />
                              <Mail className="h-4 w-4 cursor-pointer hover:text-white" />
                              <MoreVertical className="h-4 w-4 cursor-pointer hover:text-white" />
                            </div>
                          </div>

                          {/* Scrollable Mobile Email Body */}
                          <div className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin] flex flex-col bg-[#111315]">
                            {/* Email Subject Row */}
                            <div className="flex items-start justify-between px-4 pt-3 pb-2 gap-2 shrink-0">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-white leading-snug tracking-tight">
                                  {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                                </div>
                                <span className="inline-block mt-1 px-1.5 py-0.2 bg-[#2c3034] text-slate-300 text-[10px] font-medium rounded-xs">
                                  Inbox
                                </span>
                              </div>
                              <Star className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                            </div>

                            {/* Sender Info Row */}
                            <div className="flex items-start gap-2.5 px-4 py-2.5 border-b border-white/10 shrink-0">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 via-purple-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0 relative shadow-2xs">
                                <span>🐝</span>
                                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border border-[#111315] flex items-center justify-center">
                                  <Check className="w-2 h-2 text-white stroke-[3.5]" />
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-white">
                                      {applyPersonalization(fromName || 'Marbee Team', selectedTestProfile)}
                                    </span>
                                    <CheckCircle2 className="h-3 w-3 text-blue-400 fill-blue-400 text-black shrink-0" />
                                    <span className="text-[10px] text-slate-400">
                                      {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button type="button" className="text-[10px] text-blue-400 hover:underline font-semibold cursor-pointer">
                                      Unsubscribe
                                    </button>
                                    <MoreVertical className="h-3.5 w-3.5 text-slate-400 cursor-pointer" />
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                                  <span>to me</span>
                                  <ChevronDown className="h-3 w-3 text-slate-500 cursor-pointer" />
                                </div>
                              </div>
                            </div>

                            {/* Email Creative Iframe Container with Bottom Clearance */}
                            <div className="w-full bg-white flex flex-col pb-8">
                              <iframe
                                title="Email Preview Mobile"
                                srcDoc={buildIframeSrc(true)}
                                className="w-full border-0 block bg-white"
                                style={{
                                  width: '100%',
                                  height: `${previewIframeHeight}px`,
                                  minHeight: '350px',
                                  display: 'block',
                                }}
                                scrolling="no"
                              />
                            </div>
                          </div>

                          {/* Fixed Docked Bottom Reply / Forward Bar */}
                          <div className="flex items-center gap-2.5 px-4 py-3 bg-[#111315] border-t border-white/10 shrink-0 z-20 shadow-[0_-8px_16px_rgba(0,0,0,0.4)]">
                            <button
                              type="button"
                              className="flex-1 py-2.5 rounded-full border border-white/20 hover:bg-white/10 active:bg-white/15 text-white font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                            >
                              <Reply className="h-3.5 w-3.5" />
                              <span>Reply</span>
                            </button>
                            <button
                              type="button"
                              className="flex-1 py-2.5 rounded-full border border-white/20 hover:bg-white/10 active:bg-white/15 text-white font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                            >
                              <Forward className="h-3.5 w-3.5" />
                              <span>Forward</span>
                            </button>
                            <button
                              type="button"
                              className="p-2.5 rounded-full border border-white/20 hover:bg-white/10 text-slate-300 transition cursor-pointer"
                              title="Add reaction"
                            >
                              <Smile className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* iOS Home Indicator Bar */}
                      <div className="py-1 flex justify-center shrink-0 bg-[#111315] z-30">
                        <div className="w-32 h-1 bg-white/70 rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
      ) : (
        /* VISUAL STUDIO WORKSPACE */
        <div className="flex flex-1 relative" style={{ minHeight: 0, overflow: 'hidden' }}>
          {/* LEFT MODULES DRAWER (In-flow left panel) */}
          {leftModulesOpen && (
            <LeftModulesDrawer
              open={leftModulesOpen}
              onClose={() => setLeftModulesOpen(false)}
              onInsertRowStructure={handleInsertRowStructure}
              onInsertModule={(moduleBlock) => {
                const updated = [...blocks, moduleBlock];
                updateBlocks(updated);
                setSelectedBlockId(moduleBlock.id);
                showToast(`Inserted ${moduleBlock.type} module`);
              }}
              onInsertModules={(moduleBlocks) => {
                if (!moduleBlocks.length) return;
                const updated = [...blocks, ...moduleBlocks];
                updateBlocks(updated);
                setSelectedBlockId(moduleBlocks[moduleBlocks.length - 1].id);
                showToast(
                  moduleBlocks.length > 1
                    ? `Inserted module (${moduleBlocks.length} blocks)`
                    : `Inserted ${moduleBlocks[0].type} module`,
                );
              }}
            />
          )}

          {/* CENTER INTERACTIVE CANVAS */}
          <div
            data-canvas-scroll
            className="relative flex-1 flex flex-col items-center justify-start p-8 pb-48 [scrollbar-width:thin]" onClick={() => { setSelectedBlockId(null); setDoubleClickedBlockId(null); }}
            style={{ backgroundColor: canvasBg, overflowY: 'auto', overflowX: 'hidden' }}
          >
            {/* Floating Unfold Modules Button if folded */}
            {!leftModulesOpen && (
              <button
                type="button"
                onClick={() => setLeftModulesOpen(true)}
                className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-md hover:border-violet-400 hover:text-violet-700 transition cursor-pointer"
                title="Unfold Modules Library"
              >
                <Layers className="h-3.5 w-3.5 text-violet-600" />
                <span>Unfold Modules</span>
              </button>
            )}

            {/* Top-Right Canvas Controls: Style & Width Filter + Viewport Switcher */}
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
              {/* Block Count Badge */}
              {blocks.length > 0 && (
                <span className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-xs">
                  {blocks.length} block{blocks.length !== 1 ? 's' : ''} parsed
                </span>
              )}
              {/* Canvas Style & Width Filter Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsCanvasStyleOpen(!isCanvasStyleOpen)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:border-violet-300 hover:text-violet-700 transition cursor-pointer"
                  title="Canvas Width & Style Filter"
                >
                  <MoveHorizontal className="h-3.5 w-3.5 text-slate-500" />
                  <span>{viewport === 'mobile' ? '375px (Mobile)' : `${contentWidth}px`}</span>
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </button>

                {isCanvasStyleOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-64 z-50 rounded-2xl bg-white p-3 shadow-2xl border border-slate-200 text-xs space-y-3 animate-in fade-in zoom-in-95">
                    {/* Width Presets */}
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                        <span>Canvas Width</span>
                        <span className="font-mono text-violet-600 font-bold">{contentWidth}px</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { label: '500px', value: 500 },
                          { label: '550px', value: 550 },
                          { label: '600px', value: 600 },
                          { label: '640px', value: 640 },
                          { label: '680px', value: 680 },
                          { label: '720px', value: 720 },
                        ].map((preset) => (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => {
                              setContentWidth(preset.value);
                              setViewport('desktop');
                              setIsCanvasStyleOpen(false);
                            }}
                            className={`py-1 px-1.5 rounded-lg text-center font-bold text-[11px] transition cursor-pointer ${
                              contentWidth === preset.value && viewport === 'desktop'
                                ? 'bg-violet-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      {/* Custom Width Slider */}
                      <div className="mt-2.5 flex items-center gap-2">
                        <input
                          type="range"
                          min={400}
                          max={900}
                          step={10}
                          value={contentWidth}
                          onChange={(e) => {
                            setContentWidth(Number(e.target.value));
                            setViewport('desktop');
                          }}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
                        />
                      </div>
                    </div>

                    {/* Canvas Background Style Filter */}
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                        <Palette className="h-3 w-3" />
                        <span>Canvas Background</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {[
                          { label: 'White', color: '#ffffff', border: 'border-slate-300' },
                          { label: 'Light Slate', color: '#f8fafc', border: 'border-slate-300' },
                          { label: 'Soft Gray', color: '#f1f5f9', border: 'border-slate-300' },
                          { label: 'Cream', color: '#fefce8', border: 'border-amber-200' },
                          { label: 'Dark Mode', color: '#0f172a', border: 'border-slate-700' },
                        ].map((theme) => (
                          <button
                            key={theme.color}
                            type="button"
                            onClick={() => {
                              setCanvasBg(theme.color);
                            }}
                            style={{ backgroundColor: theme.color }}
                            className={`h-6 w-6 rounded-full border-2 transition shadow-xs cursor-pointer ${
                              canvasBg === theme.color ? 'ring-2 ring-violet-600 ring-offset-1' : theme.border
                            }`}
                            title={theme.label}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Viewport Switcher: Desktop | Mobile */}
              <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setViewport('desktop')}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    viewport === 'desktop' ? 'bg-violet-50 text-violet-600 font-bold' : 'text-slate-400 hover:text-slate-700'
                  }`}
                  title="Desktop View"
                >
                  <Laptop className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewport('mobile')}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    viewport === 'mobile' ? 'bg-violet-50 text-violet-600 font-bold' : 'text-slate-400 hover:text-slate-700'
                  }`}
                  title="Mobile View (375px)"
                >
                  <Smartphone className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Email Body Container (Strictly Center-Aligned in Viewport) */}
            <div
              className="w-full transition-all duration-300 bg-white rounded-2xl shadow-sm border border-slate-100 mt-6 mb-28 mx-auto"
              style={{
                maxWidth: viewport === 'mobile' ? '375px' : `${contentWidth}px`,
                backgroundColor: contentBg,
              }}
            >
              {blocks.length === 0 ? (
                /* EMPTY CANVAS PLACEHOLDER */
                <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 space-y-4 my-8">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 shadow-inner">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Canvas Erased & Clean</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                      Select a layout row structure from the left panel or click below to start building.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleInsertRowStructure([100])}
                      className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:border-violet-400 hover:text-violet-700 shadow-2xs transition"
                    >
                      + 1 Column Row
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertRowStructure([50, 50])}
                      className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:border-violet-400 hover:text-violet-700 shadow-2xs transition"
                    >
                      + 2 Column Row
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertRowStructure([33, 33, 33])}
                      className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:border-violet-400 hover:text-violet-700 shadow-2xs transition"
                    >
                      + 3 Column Row
                    </button>
                  </div>
                </div>
              ) : (
                blocks.map((b) => {
                  const isSelected = selectedBlockId === b.id;
                  const isColumnBlock = b.type === 'columns' || (b.content as any).columns;

                  return (
                    <div
                      key={b.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectBlock(b.id);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverBlockId !== b.id) setDragOverBlockId(b.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverBlockId === b.id) setDragOverBlockId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropReorder(draggingBlockId, b.id);
                        setDraggingBlockId(null);
                        setDragOverBlockId(null);
                      }}
                      className={`relative group/row transition rounded-xl ${
                        isSelected ? 'ring-2 ring-violet-600/80 ring-offset-2' : 'hover:ring-1 hover:ring-violet-300'
                      } ${dragOverBlockId === b.id ? 'border-t-4 border-violet-600 bg-violet-500/10' : ''}`}
                    >
                      {/* Container Floating Actions Pill (Drag Handle, Move Up/Down, Duplicate, Delete, Lock/Unlock) */}
                      <div className="absolute right-2 top-2 z-30 opacity-0 group-hover/row:opacity-100 flex items-center gap-0.5 bg-slate-900/90 text-white rounded-xl p-1 shadow-xl backdrop-blur-xs transition-all select-none">
                        {/* Drag & Move Handle */}
                        <div
                          draggable={true}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', b.id);
                            setDraggingBlockId(b.id);
                          }}
                          className="p-1 hover:bg-slate-700 rounded-lg cursor-grab active:cursor-grabbing text-slate-300 hover:text-white"
                          title="Drag to reorder container up/down"
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </div>

                        {/* Move Up */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveBlock(b.id, 'up');
                          }}
                          className="p-1 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition cursor-pointer"
                          title="Move Container Up"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>

                        {/* Move Down */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveBlock(b.id, 'down');
                          }}
                          className="p-1 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition cursor-pointer"
                          title="Move Container Down"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>

                        <div className="w-px h-3.5 bg-slate-700 mx-0.5" />

                        {/* Lock / Unlock Container */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleLock(b.id);
                          }}
                          className={`p-1 rounded-lg transition cursor-pointer ${
                            (b as any).locked
                              ? 'bg-amber-500 text-white hover:bg-amber-600'
                              : 'hover:bg-slate-700 text-slate-300 hover:text-amber-400'
                          }`}
                          title={(b as any).locked ? '🔒 Container is Locked (Click to Unlock)' : '🔓 Click to Lock Container'}
                        >
                          {(b as any).locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                        </button>

                        <div className="w-px h-3.5 bg-slate-700 mx-0.5" />

                        {/* Duplicate */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateBlock(b.id);
                          }}
                          className="p-1 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition cursor-pointer"
                          title="Duplicate Container"
                        >
                          <Copy className="h-3 w-3" />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveBlock(b.id);
                          }}
                          className="p-1 hover:bg-rose-600 rounded-lg text-rose-300 hover:text-white transition cursor-pointer"
                          title="Delete Container"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Locked Container Badge */}
                      {Boolean((b as any).locked) && (
                        <div className="absolute left-2 top-2 z-20 flex items-center gap-1 bg-amber-500/95 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs select-none pointer-events-none">
                          <Lock className="h-3 w-3" />
                          <span>Locked</span>
                        </div>
                      )}

                      {/* FLOATING INLINE EDITING TOOLBAR (Attached directly to active container and moves with it) */}
                      {isSelected && !(b as any).locked && (b.type === 'title' || b.type === 'paragraph' || b.type === 'text' || Boolean((b.content as any).columns)) && (
                        <FloatingBarShell>
                          {/* Row 1: Formatting Tools (B, I, U, S, A ▾, 🖊 ▾, X², X₂, Ω, 😊) */}
                          <div className="flex items-center gap-0.5">
                            {/* Bold */}
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'bold')}
                              className="px-2 py-1 hover:bg-slate-700/80 rounded font-bold text-xs transition cursor-pointer text-slate-100"
                              title="Bold"
                            >
                              B
                            </button>

                            {/* Italic */}
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'italic')}
                              className="px-2 py-1 hover:bg-slate-700/80 rounded italic text-xs transition cursor-pointer text-slate-100 font-serif"
                              title="Italic"
                            >
                              I
                            </button>

                            {/* Underline */}
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'underline')}
                              className="px-2 py-1 hover:bg-slate-700/80 rounded underline text-xs transition cursor-pointer text-slate-100"
                              title="Underline"
                            >
                              U
                            </button>

                            {/* Strikethrough */}
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'strikethrough')}
                              className="px-2 py-1 hover:bg-slate-700/80 rounded line-through text-xs transition cursor-pointer text-slate-100"
                              title="Strikethrough"
                            >
                              S
                            </button>

                            <div className="w-px h-4 bg-slate-700 mx-0.5" />

                            {/* Text Color Dropdown */}
                            <div className="relative">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setActiveFloatingDropdown(activeFloatingDropdown === 'color' ? null : 'color')}
                                className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                                  activeFloatingDropdown === 'color' ? 'bg-violet-600 text-white' : 'hover:bg-slate-700/80 text-slate-100'
                                }`}
                                title="Text Color"
                              >
                                <span className="border-b-2 border-amber-400">A</span>
                                <ChevronDown className="h-2.5 w-2.5 opacity-70" />
                              </button>

                              {activeFloatingDropdown === 'color' && (
                                <>
                                  <div
                                    className="fixed inset-0 z-40 bg-transparent"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setActiveFloatingDropdown(null);
                                    }}
                                  />
                                  <div className="absolute left-0 top-full mt-1.5 z-50 w-52 bg-[#0f172a] rounded-xl shadow-2xl border border-slate-700 p-2.5 space-y-2 animate-in fade-in zoom-in-95">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Text Color</span>
                                    <div className="grid grid-cols-5 gap-1.5">
                                      {['#ffffff', '#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#0ea5e9', '#0f172a', '#b91c1c', '#d97706'].map((c) => (
                                        <button
                                          key={c}
                                          type="button"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() => handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'color', c)}
                                          style={{ backgroundColor: c }}
                                          className="h-6 w-6 rounded-md shadow-xs border border-white/20 hover:scale-110 transition cursor-pointer"
                                        />
                                      ))}
                                    </div>
                                    <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-700">
                                      <span className="text-[10px] font-medium text-slate-400">Custom:</span>
                                      <input
                                        type="color"
                                        onChange={(e) => handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'color', e.target.value)}
                                        className="h-6 w-full rounded border border-slate-700 p-0.5 cursor-pointer bg-transparent"
                                      />
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Highlight / Font Styling Dropdown */}
                            <div className="relative">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setActiveFloatingDropdown(activeFloatingDropdown === 'font' ? null : 'font')}
                                className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-xs transition cursor-pointer ${
                                  activeFloatingDropdown === 'font' ? 'bg-violet-600 text-white' : 'hover:bg-slate-700/80 text-slate-100'
                                }`}
                                title="Font Family & Highlight"
                              >
                                <Highlighter className="h-3.5 w-3.5" />
                                <ChevronDown className="h-2.5 w-2.5 opacity-70" />
                              </button>

                              {activeFloatingDropdown === 'font' && (
                                <>
                                  <div
                                    className="fixed inset-0 z-40 bg-transparent"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setActiveFloatingDropdown(null);
                                    }}
                                  />
                                  <div className="absolute left-0 top-full mt-1.5 z-50 w-48 bg-[#0f172a] rounded-xl shadow-2xl border border-slate-700 p-2 space-y-2 animate-in fade-in zoom-in-95">
                                    <div>
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block px-1 mb-1">Font Family</span>
                                      <div className="space-y-0.5">
                                        {[
                                          { label: 'Playfair Display', val: "'Playfair Display', serif" },
                                          { label: 'Georgia Serif', val: 'Georgia, serif' },
                                          { label: 'Inter Sans', val: 'Inter, sans-serif' },
                                          { label: 'Roboto', val: 'Roboto, sans-serif' },
                                          { label: 'Montserrat', val: 'Montserrat, sans-serif' },
                                          { label: 'Courier Monospace', val: "'Courier New', monospace" },
                                        ].map((f) => (
                                          <button
                                            key={f.val}
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'font', f.val)}
                                            style={{ fontFamily: f.val }}
                                            className="w-full text-left px-2 py-1 rounded hover:bg-violet-900/50 text-xs text-slate-200 transition cursor-pointer"
                                          >
                                            {f.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="pt-1.5 border-t border-slate-700">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block px-1 mb-1">Highlight Bg</span>
                                      <div className="flex gap-1.5 px-1">
                                        {['#fef08a', '#bbf7d0', '#fed7aa', '#bae6fd', '#fbcfe8'].map((hl) => (
                                          <button
                                            key={hl}
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'highlight', hl)}
                                            style={{ backgroundColor: hl }}
                                            className="h-5 w-5 rounded-full border border-black/20 hover:scale-110 transition cursor-pointer"
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                            <div className="w-px h-4 bg-slate-700 mx-0.5" />

                            {/* Superscript */}
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'superscript')}
                              className="px-1.5 py-1 hover:bg-slate-700/80 rounded text-[11px] font-bold transition cursor-pointer text-slate-100 flex items-center"
                              title="Superscript (X²)"
                            >
                              <span>X</span><span className="text-[9px] relative -top-1">2</span>
                            </button>

                            {/* Subscript */}
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'subscript')}
                              className="px-1.5 py-1 hover:bg-slate-700/80 rounded text-[11px] font-bold transition cursor-pointer text-slate-100 flex items-center"
                              title="Subscript (X₂)"
                            >
                              <span>X</span><span className="text-[9px] relative top-1">2</span>
                            </button>

                            {/* Special Symbols Dropdown (Ω) */}
                            <div className="relative">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setActiveFloatingDropdown(activeFloatingDropdown === 'symbols' ? null : 'symbols')}
                                className={`px-1.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                                  activeFloatingDropdown === 'symbols' ? 'bg-violet-600 text-white' : 'hover:bg-slate-700/80 text-slate-100'
                                }`}
                                title="Special Symbols (Ω)"
                              >
                                Ω
                              </button>

                              {activeFloatingDropdown === 'symbols' && (
                                <>
                                  <div
                                    className="fixed inset-0 z-40 bg-transparent"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setActiveFloatingDropdown(null);
                                    }}
                                  />
                                  <div className="absolute left-0 top-full mt-1.5 z-50 w-44 bg-[#0f172a] rounded-xl shadow-2xl border border-slate-700 p-2 space-y-1 animate-in fade-in zoom-in-95">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Special Characters</span>
                                    <div className="grid grid-cols-5 gap-1 text-center">
                                      {['©', '®', '™', '€', '£', '¥', '•', '—', '→', '★', '⚡', '✓', '♥', '✕', '§'].map((sym) => (
                                        <button
                                          key={sym}
                                          type="button"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() => handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'insert', sym)}
                                          className="p-1 hover:bg-violet-600 rounded text-xs font-bold transition cursor-pointer text-slate-100"
                                        >
                                          {sym}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Emoji Picker (😊) */}
                            <div className="relative">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setActiveFloatingDropdown(activeFloatingDropdown === 'emojis' ? null : 'emojis')}
                                className={`px-1.5 py-1 rounded text-xs transition cursor-pointer ${
                                  activeFloatingDropdown === 'emojis' ? 'bg-violet-600 text-white' : 'hover:bg-slate-700/80 text-slate-100'
                                }`}
                                title="Emoji"
                              >
                                😊
                              </button>

                              {activeFloatingDropdown === 'emojis' && (
                                <>
                                  <div
                                    className="fixed inset-0 z-40 bg-transparent"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setActiveFloatingDropdown(null);
                                    }}
                                  />
                                  <div className="absolute left-0 top-full mt-1.5 z-50 w-48 bg-[#0f172a] rounded-xl shadow-2xl border border-slate-700 p-2 space-y-1 animate-in fade-in zoom-in-95">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Popular Emojis</span>
                                    <div className="grid grid-cols-5 gap-1 text-center text-sm">
                                      {['🐝', '🚀', '🎉', '🔥', '✨', '👏', '💡', '❤️', '🎁', '👍', '🎯', '⭐', '⚡', '💬', '🏆'].map((em) => (
                                        <button
                                          key={em}
                                          type="button"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() => handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'insert', em)}
                                          className="p-1 hover:bg-violet-600/60 rounded text-base transition cursor-pointer"
                                        >
                                          {em}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Secondary Tools (Tx, 🔗, 🔗x, Special links ▾, Personalisation ▾) */}
                          <div className="flex items-center gap-1 pt-1 border-t border-slate-700/80 text-xs">
                            {/* Clear formatting (Tx) */}
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'clear')}
                              className="px-2 py-0.5 hover:bg-slate-700/80 rounded font-bold text-xs text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-0.5"
                              title="Clear formatting"
                            >
                              <span>T</span><span className="text-[9px] text-rose-400">x</span>
                            </button>

                            {/* Hyperlink (🔗) */}
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                const fieldKey = b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text';
                                const selection = window.getSelection();
                                const selected = selection ? selection.toString().trim() : '';
                                // Persist the current canvas selection so it can be restored
                                // after the user finishes typing in the dialog inputs.
                                const editable = document.querySelector(`[data-block-id="${b.id}"]`) as HTMLElement | null;
                                if (editable) {
                                  const offset = getSelectionOffset(editable);
                                  if (offset) {
                                    savedSelectionStateRef.current = { blockId: b.id, ...offset };
                                  }
                                }
                                setLinkModal({
                                  open: true,
                                  blockId: b.id,
                                  fieldKey,
                                  url: 'https://',
                                  text: selected || 'Click here',
                                  start: 0,
                                  end: 0,
                                  canvas: true,
                                  hadSelection: selected.length > 0,
                                });
                              }}
                              className="p-1 hover:bg-slate-700/80 rounded text-blue-400 hover:text-blue-300 transition cursor-pointer"
                              title="Make Hyperlink"
                            >
                              <Link className="h-3.5 w-3.5" />
                            </button>

                            {/* Unlink (🔗x) */}
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'unlink')}
                              className="p-1 hover:bg-slate-700/80 rounded text-slate-400 hover:text-rose-400 transition cursor-pointer"
                              title="Remove link (Unlink)"
                            >
                              <Unlink className="h-3.5 w-3.5" />
                            </button>

                            <div className="w-px h-3.5 bg-slate-700 mx-0.5" />

                            {/* Special links / Instance Published Landing Pages dropdown */}
                            <div className="relative">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setActiveFloatingDropdown(activeFloatingDropdown === 'special_links' ? null : 'special_links')}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer ${
                                  activeFloatingDropdown === 'special_links' ? 'bg-violet-600 text-white' : 'hover:bg-slate-700/80 text-slate-300 hover:text-white'
                                }`}
                                title="Insert Instance Published Landing Page Link"
                              >
                                <Globe className="h-3.5 w-3.5 text-blue-400" />
                                <span>Special links</span>
                                <ChevronDown className="h-2.5 w-2.5 opacity-70" />
                              </button>

                              {activeFloatingDropdown === 'special_links' && (
                                <>
                                  <div
                                    className="fixed inset-0 z-40 bg-transparent"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setActiveFloatingDropdown(null);
                                    }}
                                  />
                                  <div className="absolute left-0 top-full mt-2 z-50 w-72 bg-[#0f172a] rounded-xl shadow-2xl border border-slate-700 p-2.5 space-y-2 animate-in fade-in zoom-in-95 max-h-72 overflow-y-auto [scrollbar-width:thin]">
                                    <div>
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-1 mb-1">
                                        ⚡ Instance Published Landing Pages
                                      </span>
                                      {publishedLandingPages.length > 0 ? (
                                        <div className="space-y-0.5">
                                          {publishedLandingPages.map((lp) => {
                                            const pageUrl = lp.published_url || `https://${window.location.host}/landing/${lp.slug}`;
                                            return (
                                              <button
                                                key={lp.id}
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => {
                                                  const linkTag = `<a href="${pageUrl}" style="color: #6366f1; text-decoration: underline;" target="_blank">${lp.name}</a>`;
                                                  handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'insert', linkTag);
                                                }}
                                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-violet-600/60 text-xs text-slate-200 transition cursor-pointer flex items-center justify-between group/lp"
                                              >
                                                <div className="truncate pr-2">
                                                  <div className="font-semibold truncate group-hover/lp:text-white">{lp.name}</div>
                                                  <div className="text-[10px] text-slate-400 truncate font-mono">/landing/{lp.slug}</div>
                                                </div>
                                                <span className="text-xs text-blue-400 group-hover/lp:text-white shrink-0">🔗</span>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <div className="px-2 py-2 bg-slate-800/60 rounded-lg text-center text-[11px] text-slate-400">
                                          No published landing pages yet for this instance.
                                        </div>
                                      )}
                                    </div>

                                    <div className="pt-2 border-t border-slate-700">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-1 mb-1">
                                        ⚙️ System Compliance Links
                                      </span>
                                      <div className="space-y-0.5">
                                        {[
                                          { label: '1-Click Instant Unsubscribe', tag: '{{unsubscribe_url}}', defaultText: 'Unsubscribe' },
                                          { label: 'View Email in Web Browser', tag: '{{view_in_browser}}', defaultText: 'View Online' },
                                          { label: 'Manage Email Preferences', tag: '{{preferences_url}}', defaultText: 'Update Preferences' },
                                        ].map((sl) => (
                                          <button
                                            key={sl.tag}
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                              const linkTag = `<a href="${sl.tag}" style="color: #6366f1; text-decoration: underline;" target="_blank">${sl.defaultText}</a>`;
                                              handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'insert', linkTag);
                                            }}
                                            className="w-full text-left px-2 py-1 rounded hover:bg-slate-700/80 text-xs text-slate-300 transition cursor-pointer flex items-center justify-between"
                                          >
                                            <span>{sl.label}</span>
                                            <span className="font-mono text-[9px] text-slate-400">{sl.tag}</span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Personalisation / Personalization (Profile Icon ONLY as requested) */}
                            <div className="relative">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setActiveFloatingDropdown(activeFloatingDropdown === 'merge_tags' ? null : 'merge_tags')}
                                className={`p-1.5 rounded transition cursor-pointer ${
                                  activeFloatingDropdown === 'merge_tags' ? 'bg-violet-600 text-white' : 'hover:bg-slate-700/80 text-violet-300 hover:text-white'
                                }`}
                                title="Personalisation (👤)"
                              >
                                <User className="h-3.5 w-3.5" />
                              </button>

                              {activeFloatingDropdown === 'merge_tags' && (
                                <>
                                  <div
                                    className="fixed inset-0 z-40 bg-transparent"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setActiveFloatingDropdown(null);
                                    }}
                                  />
                                  <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-[#0f172a] rounded-xl shadow-2xl border border-slate-700 p-2.5 space-y-2 animate-in fade-in zoom-in-95">
                                    <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-slate-700 text-violet-400 text-xs font-bold">
                                      <User className="h-3.5 w-3.5" />
                                      <span>Personalisation</span>
                                    </div>
                                    <div className="max-h-56 overflow-y-auto space-y-2 [scrollbar-width:thin]">
                                      {CUSTOMER_MERGE_TAGS.map((g, gIdx) => (
                                        <div key={gIdx} className="space-y-0.5">
                                          <span className="text-[8px] font-bold text-slate-500 uppercase px-1">{g.group}</span>
                                          {g.tags.map((t, tIdx) => (
                                            <button
                                              key={tIdx}
                                              type="button"
                                              onMouseDown={(e) => e.preventDefault()}
                                              onClick={() => handleToolbarFormat(b.id, b.type === 'title' ? 'text' : (b.content as any).body !== undefined ? 'body' : 'text', 'insert', t.tag)}
                                              className="w-full text-left px-2 py-1 rounded hover:bg-violet-600/60 text-[11px] text-slate-200 transition cursor-pointer flex items-center justify-between"
                                            >
                                              <span>{t.label}</span>
                                              <span className="font-mono text-[9px] text-slate-400">{t.tag}</span>
                                            </button>
                                          ))}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </FloatingBarShell>
                      )}

                      {/* Render Multi-Column Structure Drop Zones */}
                      {isColumnBlock ? (
                        <div
                          style={{
                            backgroundColor: b.styles?.bg_color || 'transparent',
                            paddingTop: `${b.styles?.padding_top ?? 0}px`,
                            paddingBottom: `${b.styles?.padding_bottom ?? 0}px`,
                            paddingLeft: `${b.styles?.padding_left ?? 0}px`,
                            paddingRight: `${b.styles?.padding_right ?? 0}px`,
                            borderWidth: `${(b.styles as any)?.border_width ?? 0}px`,
                            borderStyle: (b.styles as any)?.border_style || 'none',
                            borderColor: (b.styles as any)?.border_color || 'transparent',
                            borderRadius: `${b.styles?.border_radius ?? 0}px`,
                            gap: `${(b.styles as any)?.column_gap ?? 16}px`,
                          }}
                          className={`flex w-full transition-all ${
                            (b.styles as any)?.vertical_align === 'middle'
                              ? 'items-center'
                              : (b.styles as any)?.vertical_align === 'bottom'
                                ? 'items-end'
                                : 'items-start'
                          }`}
                        >
                          {(((b.content as any).columns as Array<{ width: number; content?: any }>) || [{ width: 100 }]).map(
                            (col, idx) => {
                              const isSlotActive =
                                (hoveredSlot?.blockId === b.id && hoveredSlot?.colIdx === idx) ||
                                (selectedBlockId === b.id && selectedSlotIndex === idx) ||
                                (selectedBlockId === b.id && !selectedSlotIndex && idx === 0);
                              const slotFilled = Boolean(col.content && col.content.type);

                              return (
                                <div
                                  key={idx}
                                  style={{ width: `${col.width}%` }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedBlockId(b.id);
                                    setSelectedSlotIndex(idx);
                                    setActiveTab('editing');
                                  }}
                                  onMouseEnter={() => setHoveredSlot({ blockId: b.id, colIdx: idx })}
                                  onMouseLeave={() => setHoveredSlot(null)}
                                  className={`relative min-h-[84px] rounded-xl transition-all duration-150 group/slot flex flex-col justify-center ${
                                    isSlotActive
                                      ? 'ring-2 ring-violet-500 ring-offset-1 bg-violet-50/40 shadow-sm'
                                      : slotFilled
                                        ? 'ring-1 ring-transparent hover:ring-slate-200'
                                        : 'border-2 border-dashed border-slate-200 bg-slate-50/40 hover:border-violet-300 hover:bg-violet-50/30'
                                  }`}
                                >
                                  {/* Column width badge — visible on hover / when active */}
                                  <span
                                    className={`pointer-events-none absolute -top-2 left-2 z-10 rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums shadow-2xs transition-opacity ${
                                      isSlotActive
                                        ? 'bg-violet-600 text-white opacity-100'
                                        : 'bg-white text-slate-500 border border-slate-200 opacity-0 group-hover/slot:opacity-100'
                                    }`}
                                  >
                                    {col.width}%
                                  </span>
                                  {/* Render Actual Slot Content or Drop Prompt */}
                                  {col.content ? (
                                    col.content.type === 'image' ? (
                                      <div style={{ textAlign: (b.styles?.alignment as any) || 'center', lineHeight: 0, fontSize: 0 }}>
                                        <img
                                          src={col.content.src || col.content.url || 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&auto=format&fit=crop&q=80'}
                                          alt={col.content.alt || ''}
                                          style={{
                                            width: `${(b.styles as any)?.image_width || 100}%`,
                                            maxWidth: '100%',
                                            height: 'auto',
                                            borderRadius: `${b.styles?.border_radius || 0}px`,
                                            display: 'block',
                                            margin: '0 auto',
                                          }}
                                        />
                                      </div>
                                    ) : col.content.type === 'button' ? (
                                      <div style={{ textAlign: (b.styles?.alignment as any) || 'center' }}>
                                        <button
                                          type="button"
                                          style={{
                                            backgroundColor: b.styles?.button_bg || b.styles?.bg_color || '#6366f1',
                                            color: b.styles?.button_color || b.styles?.text_color || '#ffffff',
                                            borderRadius: `${b.styles?.border_radius ?? 8}px`,
                                            padding: '10px 22px',
                                          }}
                                          className="font-bold text-xs shadow-md"
                                        >
                                          {col.content.label || col.content.text || 'Click Here'}
                                        </button>
                                      </div>
                                    ) : col.content.type === 'text' ? (
                                      <CanvasRichText
                                        blockId={`${b.id}-slot-${idx}`}
                                        disabled={Boolean((b as any).locked)}
                                        html={col.content.text || 'Type slot copy...'}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedBlockId(b.id);
                                          setSelectedSlotIndex(idx);
                                        }}
                                        onSelectionChange={(e) => {
                                          saveCurrentSelection(e);
                                          if (selectedBlockId !== b.id || selectedSlotIndex !== idx) {
                                            setSelectedBlockId(b.id);
                                            setSelectedSlotIndex(idx);
                                          }
                                        }}
                                        onCommit={(html, isFinal) => commitCanvasSlotText(b.id, idx, html, isFinal)}
                                        style={{
                                          fontSize: `${b.styles?.font_size || 14}px`,
                                          color: b.styles?.text_color || '#334155',
                                          textAlign: (b.styles?.alignment as any) || 'left',
                                          padding: '4px 8px',
                                          cursor: (b as any).locked ? 'default' : 'text',
                                          wordBreak: 'break-word',
                                          outline: 'none',
                                        }}
                                        className="font-medium p-1 rounded-md transition focus:ring-1 focus:ring-violet-400/50"
                                      />
                                    ) : (
                                      renderSlotEmptyState(b.id, idx, isSlotActive)
                                    )
                                  ) : (
                                    renderSlotEmptyState(b.id, idx, isSlotActive)
                                  )}
                                </div>
                              );
                            }
                          )}
                        </div>
                      ) : (
                        /* Render Standard Row Block (Text / Image / Button / Divider) */
                        <div
                          style={{
                            backgroundColor: b.styles?.bg_color || 'transparent',
                            paddingTop: `${b.styles?.padding_top ?? (b.type === 'image' ? 0 : 8)}px`,
                            paddingBottom: `${b.styles?.padding_bottom ?? (b.type === 'image' ? 0 : 8)}px`,
                            paddingLeft: `${b.styles?.padding_left ?? (b.type === 'image' ? 0 : 12)}px`,
                            paddingRight: `${b.styles?.padding_right ?? (b.type === 'image' ? 0 : 12)}px`,
                            borderWidth: `${(b.styles as any)?.border_width ?? 0}px`,
                            borderStyle: (b.styles as any)?.border_style || 'none',
                            borderColor: (b.styles as any)?.border_color || 'transparent',
                            borderRadius: `${b.styles?.border_radius ?? 0}px`,
                          }}
                          className="transition-all"
                        >
                          {b.type === 'button' ? (
                            <div style={{ textAlign: (b.styles?.alignment as any) || 'center' }}>
                              <button
                                type="button"
                                style={{
                                  backgroundColor: b.styles?.button_bg || b.styles?.bg_color || '#6366f1',
                                  color: b.styles?.button_color || b.styles?.text_color || '#ffffff',
                                  borderRadius: `${b.styles?.border_radius ?? 8}px`,
                                  padding: '12px 28px',
                                }}
                                className="font-bold text-xs shadow-md"
                              >
                                {(b.content as any).label || (b.content as any).text || 'Click Here'}
                              </button>
                            </div>
                          ) : b.type === 'image' ? (
                            <div style={{ textAlign: (b.styles?.alignment as any) || 'center', lineHeight: 0, fontSize: 0 }}>
                              <div
                                style={{
                                  position: 'relative',
                                  display: 'inline-block',
                                  width: `${(b.styles as any)?.image_width || 100}%`,
                                  maxWidth: '100%',
                                }}
                              >
                                <img
                                  src={(b.content as any).src || (b.content as any).url || 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&auto=format&fit=crop&q=80'}
                                  alt={(b.content as any).alt || ''}
                                  style={{
                                    width: '100%',
                                    maxWidth: '100%',
                                    height: 'auto',
                                    borderRadius: `${b.styles?.border_radius || 0}px`,
                                    display: 'block',
                                  }}
                                />
                                {(b.content as any).cta_enabled && (b.content as any).cta_text ? (
                                  (() => {
                                    const [vPos, hPos] = String((b.content as any).cta_position || 'center-center').split('-');
                                    return (
                                      <div
                                        style={{
                                          position: 'absolute',
                                          left: 14,
                                          right: 14,
                                          top: vPos === 'top' ? 14 : vPos === 'bottom' ? undefined : '50%',
                                          bottom: vPos === 'bottom' ? 14 : undefined,
                                          transform: vPos === 'center' ? 'translateY(-50%)' : undefined,
                                          textAlign: (hPos === 'left' ? 'left' : hPos === 'right' ? 'right' : 'center') as any,
                                        }}
                                      >
                                        <span
                                          style={{
                                            display: 'inline-block',
                                            background: (b.content as any).cta_bg || '#7c3aed',
                                            color: (b.content as any).cta_color || '#ffffff',
                                            fontSize: 13,
                                            fontWeight: 700,
                                            padding: '10px 22px',
                                            borderRadius: 8,
                                            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                                          }}
                                        >
                                          {(b.content as any).cta_text}
                                        </span>
                                      </div>
                                    );
                                  })()
                                ) : null}
                              </div>
                            </div>
                          ) : b.type === 'html' ? (
                            <div
                              onClick={() => handleSelectBlock(b.id)}
                              dangerouslySetInnerHTML={{ __html: (b.content as any).code || '<p>HTML block</p>' }}
                              className="w-full"
                            />
                          ) : b.type === 'divider' ? (
                            <hr style={{ borderColor: b.styles?.text_color || '#e2e8f0', borderWidth: `${(b.styles as any)?.border_width || 1}px` }} />
                          ) : b.type === 'spacer' ? (
                            <div
                              onClick={() => handleSelectBlock(b.id)}
                              style={{ height: `${(b.content as any).height || 28}px` }}
                              className="w-full bg-slate-50/70 border border-dashed border-slate-200 rounded-lg flex items-center justify-center text-[10px] text-slate-400 font-mono select-none"
                            >
                              ↕ Spacer ({(b.content as any).height || 28}px)
                            </div>
                          ) : b.type === 'list' ? (
                            <div onClick={() => handleSelectBlock(b.id)} className="w-full p-1">
                              {(b.content as any).list_type === 'numbered' ? (
                                <ol className="list-decimal pl-5 space-y-1.5 text-xs" style={{ color: b.styles?.text_color || '#334155', fontSize: `${b.styles?.font_size || 14}px`, lineHeight: (b.styles as any)?.line_height || 1.6 }}>
                                  {(Array.isArray((b.content as any).items) ? (b.content as any).items : ['Item 1', 'Item 2', 'Item 3']).map((it: string, iIdx: number) => (
                                    <li key={iIdx}>{it}</li>
                                  ))}
                                </ol>
                              ) : (
                                <ul className="list-disc pl-5 space-y-1.5 text-xs" style={{ color: b.styles?.text_color || '#334155', fontSize: `${b.styles?.font_size || 14}px`, lineHeight: (b.styles as any)?.line_height || 1.6 }}>
                                  {(Array.isArray((b.content as any).items) ? (b.content as any).items : ['Item 1', 'Item 2', 'Item 3']).map((it: string, iIdx: number) => (
                                    <li key={iIdx}>{it}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ) : b.type === 'table' ? (
                            <div onClick={() => handleSelectBlock(b.id)} className="w-full overflow-x-auto p-1">
                              <table className="w-full border-collapse border border-slate-200 text-xs rounded-lg overflow-hidden">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-800">
                                    {(Array.isArray((b.content as any).headers) ? (b.content as any).headers : ['Item', 'Qty', 'Price']).map((h: string, hIdx: number) => (
                                      <th key={hIdx} className="p-2 text-left border-r border-slate-200">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(Array.isArray((b.content as any).rows) ? (b.content as any).rows : [['Marbee Pro', '1', '$149.00']]).map((row: string[], rIdx: number) => (
                                    <tr key={rIdx} className="border-b border-slate-200 text-slate-700">
                                      {row.map((cell: string, cIdx: number) => (
                                        <td key={cIdx} className="p-2 border-r border-slate-200">{cell}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : b.type === 'video' ? (
                            <div onClick={() => handleSelectBlock(b.id)} className="w-full max-w-md mx-auto rounded-xl overflow-hidden bg-black text-white relative group cursor-pointer shadow-md">
                              <img src={(b.content as any).thumbnail_url || 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=800&auto=format&fit=crop&q=80'} alt={(b.content as any).title || 'Video'} className="w-full h-44 object-cover opacity-80" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-12 h-12 rounded-full bg-red-600/90 text-white flex items-center justify-center text-lg shadow-lg group-hover:scale-110 transition">
                                  ▶
                                </div>
                              </div>
                              <div className="p-2.5 bg-slate-900 text-xs font-bold truncate">
                                {(b.content as any).title || 'Watch Video'}
                              </div>
                            </div>
                          ) : b.type === 'icons' ? (
                            <div onClick={() => handleSelectBlock(b.id)} className="flex items-center justify-around py-2">
                              {(Array.isArray((b.content as any).items) ? (b.content as any).items : [{ icon: '⭐', label: 'Top' }, { icon: '🚀', label: 'Fast' }, { icon: '🛡️', label: 'Secure' }]).map((it: any, iIdx: number) => (
                                <div key={iIdx} className="flex flex-col items-center gap-1">
                                  <span className="text-2xl">{it.icon}</span>
                                  <span className="text-xs font-bold text-slate-800">{it.label}</span>
                                </div>
                              ))}
                            </div>
                          ) : b.type === 'coupon' ? (
                            <div onClick={() => handleSelectBlock(b.id)} className="rounded-2xl border-2 border-dashed border-violet-500 bg-violet-50 p-5 text-center">
                              <div className="text-[11px] font-bold uppercase tracking-wider text-violet-600">Exclusive Voucher</div>
                              <div className="my-1.5 text-2xl font-extrabold text-indigo-900">{(b.content as any).discount_label || '20% OFF'}</div>
                              <div className="inline-block rounded-lg border border-indigo-200 bg-white px-6 py-2 font-mono text-lg font-bold tracking-[2px] text-violet-600">
                                {(b.content as any).code || 'WELCOME20'}
                              </div>
                              <div className="mt-2 text-[11px] text-slate-500">{(b.content as any).expiry_text || 'Expires in 48 hours'}</div>
                            </div>
                          ) : b.type === 'countdown' ? (
                            <div onClick={() => handleSelectBlock(b.id)} className="rounded-2xl bg-slate-900 p-6 text-center text-white">
                              <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400">{(b.content as any).label || '⏳ FLASH SALE ENDS SOON'}</div>
                              <div className="mt-3 flex items-center justify-center gap-1.5">
                                {['12', '45', '30'].map((n, i) => (
                                  <div key={i} className="flex items-center gap-1.5">
                                    <div className="min-w-[46px] rounded-lg bg-slate-800 px-3 py-2">
                                      <div className="text-xl font-bold leading-none">{n}</div>
                                      <div className="mt-0.5 text-[8px] text-slate-400">{['HOURS', 'MINS', 'SECS'][i]}</div>
                                    </div>
                                    {i < 2 && <span className="text-lg font-bold text-slate-500">:</span>}
                                  </div>
                                ))}
                              </div>
                              <div className="mt-3 text-[11px] text-slate-400">{(b.content as any).subtext || 'Prices revert to normal once the timer expires'}</div>
                            </div>
                          ) : b.type === 'product_card' ? (
                            <div onClick={() => handleSelectBlock(b.id)} className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white">
                              <img
                                src={(b.content as any).image_url || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&auto=format&fit=crop&q=80'}
                                alt={(b.content as any).title || 'Product'}
                                className="w-2/5 object-cover"
                              />
                              <div className="flex-1 p-4">
                                {(b.content as any).badge && (
                                  <span className="rounded bg-violet-100 px-2 py-0.5 text-[9px] font-bold tracking-wide text-violet-700">{(b.content as any).badge}</span>
                                )}
                                <div className="mt-1.5 text-sm font-bold text-slate-900">{(b.content as any).title || 'Product title'}</div>
                                <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{(b.content as any).description || 'Short product description.'}</div>
                                <div className="mt-2 flex items-baseline gap-1.5">
                                  <span className="text-lg font-extrabold text-slate-900">{(b.content as any).price || '$49/mo'}</span>
                                  {(b.content as any).original_price && (
                                    <span className="text-xs text-slate-400 line-through">{(b.content as any).original_price}</span>
                                  )}
                                </div>
                                <span className="mt-2.5 inline-block rounded-md bg-violet-600 px-4 py-1.5 text-[11px] font-bold text-white">
                                  {(b.content as any).button_text || 'Claim Offer'}
                                </span>
                              </div>
                            </div>
                          ) : b.type === 'testimonial' ? (
                            <div onClick={() => handleSelectBlock(b.id)} className="rounded-r-xl border-l-4 border-violet-600 bg-slate-50 p-4">
                              <div className="text-sm text-amber-500">★★★★★</div>
                              <p className="mt-1.5 text-sm italic leading-relaxed text-slate-600">{(b.content as any).quote || '"Great product."'}</p>
                              <p className="mt-2 text-xs font-bold text-slate-900">
                                {(b.content as any).author || 'Author'}
                                <span className="font-normal text-slate-500"> · {(b.content as any).role || 'Role'}</span>
                              </p>
                            </div>
                          ) : b.type === 'footer' ? (
                            <div onClick={() => handleSelectBlock(b.id)} className="text-center text-[11px] leading-relaxed text-slate-500">
                              <p className="m-0">© {new Date().getFullYear()} {(b.content as any).company || 'Company Inc.'}. All rights reserved.</p>
                              <p className="m-0 mt-1">{(b.content as any).address || 'Company address'}</p>
                              <p className="m-0 mt-1.5">
                                You received this email because you are registered on Marbee.
                                <span className="ml-1 underline">Unsubscribe</span> · <span className="underline">Manage Preferences</span>
                              </p>
                            </div>
                          ) : (
                            <CanvasRichText
                              blockId={b.id}
                              disabled={Boolean((b as any).locked)}
                              html={
                                (b.content as any).text ??
                                (b.content as any).body ??
                                (b.content as any).heading ??
                                (b.content as any).title ??
                                (b.type === 'title' ? 'Headline Title' : 'Paragraph text content')
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectBlock(b.id);
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                handleSelectBlock(b.id);
                                setDoubleClickedBlockId(b.id);
                              }}
                              onSelectionChange={(e) => {
                                saveCurrentSelection(e);
                                // Keep the floating toolbar bound to the block the
                                // user is actually selecting text in (drag-select
                                // doesn't always fire a click first).
                                if (selectedBlockId !== b.id) {
                                  setSelectedBlockId(b.id);
                                  setDoubleClickedBlockId(null);
                                }
                              }}
                              onCommit={(html, isFinal) => commitCanvasText(b.id, html, isFinal)}
                              style={{
                                width: '100%',
                                fontSize: `${b.styles?.font_size || (b.type === 'title' ? 28 : 15)}px`,
                                fontFamily: (b.styles as any)?.font_family || 'Inter, sans-serif',
                                fontWeight: (b.styles as any)?.font_weight || (b.type === 'title' ? '800' : 'normal'),
                                fontStyle: (b.styles as any)?.font_style || 'normal',
                                textDecoration: (b.styles as any)?.text_decoration || 'none',
                                color: b.styles?.text_color || (b.type === 'title' ? '#0f172a' : '#334155'),
                                textAlign: (b.styles?.alignment as any) || 'left',
                                lineHeight: (b.styles as any)?.line_height || (b.type === 'title' ? 1.2 : 1.6),
                                letterSpacing: `${(b.styles as any)?.letter_spacing || (b.type === 'title' ? -0.5 : 0)}px`,
                                backgroundColor: (b.styles as any)?.highlight_color || 'transparent',
                                minHeight: '1.5em',
                                wordBreak: 'break-word',
                                cursor: (b as any).locked ? 'default' : 'text',
                                outline: 'none',
                              }}
                              className="font-medium p-1 rounded-md transition relative group/text focus:ring-1 focus:ring-violet-400/50"
                              title={(b as any).locked ? '🔒 Container is locked. Click unlock icon in top right to edit.' : 'Click or double-click to edit directly on canvas'}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Bottom Footer Branding */}
              <div className="pt-8 text-center">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <span className="text-violet-600">✉️</span>
                  <span>Designed with Marbee Studio</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT INSPECTOR PANEL (CLEAN, UNCLUTTERED 2-TAB SUITE) */}
          <div className="w-[320px] border-l border-slate-200 bg-white flex flex-col shrink-0 z-20 overflow-hidden select-none">
            {/* 2 TABS: EDITING | SETTINGS */}
            <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-100/90 p-1 text-xs font-bold shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('editing')}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-xl transition cursor-pointer ${
                  activeTab === 'editing'
                    ? 'bg-white text-violet-700 shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>EDITING</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-xl transition cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-white text-violet-700 shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Settings className="h-3.5 w-3.5" />
                <span>SETTINGS</span>
              </button>
            </div>

            {/* TAB 1: CONTEXTUAL & CLEAN EDITING TAB */}
            {activeTab === 'editing' && (
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs [scrollbar-width:thin]">
                {renderInspector()}
              </div>
            )}

            {/* TAB 2: SETTINGS TAB */}
            {activeTab === 'settings' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs [scrollbar-width:thin]">
                <div className="space-y-1 border-b pb-3">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    Sender & Subject Details
                  </h4>
                  <p className="text-[11px] text-slate-400">Configure email header metadata and deliverability.</p>
                </div>

                {renderPersonalizeField({
                  which: 'subject',
                  label: 'Subject line',
                  hint: 'Fallback syntax: {{ customer.first_name | default: "there" }}',
                  value: subject,
                  placeholder: 'e.g. Discover your exclusive offer {{customer.first_name}} ✨',
                  inputRef: subjectInputRef,
                  onChange: (v) => {
                    setSubject(v);
                    handlePersistSave({ subject: v });
                  },
                })}

                {renderPersonalizeField({
                  which: 'preheader',
                  label: 'Preheader / preview text',
                  hint: 'Shown after the subject in most inboxes. Keep under ~90 characters.',
                  value: preheader,
                  placeholder: 'Preview snippet in subscriber inbox',
                  inputRef: preheaderInputRef,
                  onChange: (v) => {
                    setPreheader(v);
                    handlePersistSave({ preheader: v });
                  },
                })}

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">From Name</label>
                  <input
                    value={fromName}
                    onChange={(e) => {
                      setFromName(e.target.value);
                      handlePersistSave({ from_name: e.target.value } as any);
                    }}
                    placeholder="e.g. Sarah from Marbee"
                    className="h-8.5 w-full rounded-lg border border-slate-200 px-3 text-xs focus:border-violet-500 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">From Email Address</label>
                  <input
                    value={fromEmail}
                    onChange={(e) => {
                      setFromEmail(e.target.value);
                      handlePersistSave({ from_email: e.target.value } as any);
                    }}
                    placeholder="e.g. newsletter@brand.com"
                    className="h-8.5 w-full rounded-lg border border-slate-200 px-3 text-xs focus:border-violet-500 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Reply-To Address</label>
                  <input
                    value={replyTo}
                    onChange={(e) => {
                      setReplyTo(e.target.value);
                      handlePersistSave({ reply_to: e.target.value } as any);
                    }}
                    placeholder="e.g. support@brand.com"
                    className="h-8.5 w-full rounded-lg border border-slate-200 px-3 text-xs focus:border-violet-500 focus:outline-hidden"
                  />
                </div>

                <div className="border-t pt-3 space-y-3">
                  <h5 className="font-bold text-slate-800 text-[11px] uppercase">Canvas Styles</h5>
                  <div className="flex items-center justify-between">
                    <label className="text-slate-600 font-medium">Content Width</label>
                    <select
                      value={contentWidth}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setContentWidth(val);
                        handlePersistSave({
                          builder_state: {
                            theme: {
                              ...DEFAULT_EMAIL_THEME,
                              canvas_bg: canvasBg,
                              content_bg: contentBg,
                              content_width: val,
                            },
                            blocks,
                            approval_status: templateStatus,
                          },
                        });
                      }}
                      className="h-8 rounded-lg border border-slate-200 px-2 font-mono text-xs"
                    >
                      <option value={500}>500 px</option>
                      <option value={600}>600 px (Standard)</option>
                      <option value={680}>680 px (Editorial)</option>
                      <option value={700}>700 px (Wide)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-slate-600 font-medium">Canvas Background</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={canvasBg}
                        onChange={(e) => {
                          setCanvasBg(e.target.value);
                          handlePersistSave({
                            builder_state: {
                              theme: {
                                ...DEFAULT_EMAIL_THEME,
                                canvas_bg: e.target.value,
                                content_bg: contentBg,
                                content_width: contentWidth,
                              },
                              blocks,
                              approval_status: templateStatus,
                            },
                          });
                        }}
                        className="h-7 w-7 rounded-lg border border-slate-200 p-0.5 cursor-pointer"
                      />
                      <span className="font-mono text-xs text-slate-600">{canvasBg}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-slate-600 font-medium">Content Background</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={contentBg}
                        onChange={(e) => {
                          setContentBg(e.target.value);
                          handlePersistSave({
                            builder_state: {
                              theme: {
                                ...DEFAULT_EMAIL_THEME,
                                canvas_bg: canvasBg,
                                content_bg: e.target.value,
                                content_width: contentWidth,
                              },
                              blocks,
                              approval_status: templateStatus,
                            },
                          });
                        }}
                        className="h-7 w-7 rounded-lg border border-slate-200 p-0.5 cursor-pointer"
                      />
                      <span className="font-mono text-xs text-slate-600">{contentBg}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GLASSMORPHISM SEND TEST EMAIL MODAL */}
      {showSendTestModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-white/50 dark:border-white/10 shadow-2xl p-6 overflow-x-hidden animate-in zoom-in-95 [scrollbar-width:thin]">
            {/* Background glowing gradient accents */}
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-violet-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/25">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Send Sample Test Email</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Dispatch test proof with real profile personalization</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSendTestModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!testSendSuccess ? (
              <div className="space-y-4 relative z-10">
                {/* Searchable Test Profile Selector */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Select Test Profile for Personalization
                    </label>
                    <span className="text-[10px] text-violet-600 dark:text-violet-400 font-semibold">
                      {testProfiles.length} Profiles Available
                    </span>
                  </div>

                  {/* Active Selected Profile Card with Search Dropdown Trigger */}
                  <div className="relative">
                    <div
                      onClick={() => setIsTestProfileDropdownOpen(!isTestProfileDropdownOpen)}
                      className="p-3 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-violet-200 dark:border-violet-800/60 shadow-xs hover:border-violet-400 cursor-pointer transition flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-violet-600 via-purple-600 to-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-xs">
                          {selectedTestProfile.firstName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {selectedTestProfile.name}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300">
                              {selectedTestProfile.tier}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {selectedTestProfile.email} · {selectedTestProfile.company} ({selectedTestProfile.city})
                          </div>
                        </div>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isTestProfileDropdownOpen ? 'rotate-180' : ''}`} />
                    </div>

                    {/* Searchable Dropdown Popup */}
                    {isTestProfileDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsTestProfileDropdownOpen(false)} />
                        <div className="absolute left-0 top-16 w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95">
                          {/* Search Input */}
                          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 mb-2">
                            <Search className="h-4 w-4 text-slate-400 shrink-0" />
                            <input
                              type="text"
                              placeholder="Search by name, email, company, tier..."
                              value={testProfileSearchQuery}
                              onChange={(e) => setTestProfileSearchQuery(e.target.value)}
                              className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-hidden"
                              autoFocus
                            />
                            {testProfileSearchQuery && (
                              <X className="h-3.5 w-3.5 text-slate-400 cursor-pointer hover:text-slate-600" onClick={() => setTestProfileSearchQuery('')} />
                            )}
                          </div>

                          {/* Profile Options List */}
                          <div className="max-h-52 overflow-y-auto space-y-1 [scrollbar-width:thin]">
                            {testProfiles
                              .filter(p =>
                                p.name.toLowerCase().includes(testProfileSearchQuery.toLowerCase()) ||
                                p.email.toLowerCase().includes(testProfileSearchQuery.toLowerCase()) ||
                                p.company.toLowerCase().includes(testProfileSearchQuery.toLowerCase()) ||
                                p.tier.toLowerCase().includes(testProfileSearchQuery.toLowerCase())
                              )
                              .map(profile => (
                                <div
                                  key={profile.id}
                                  onClick={() => {
                                    setSelectedTestProfileId(profile.id);
                                    setIsTestProfileDropdownOpen(false);
                                    setTestRecipients(profile.email);
                                    showToast(`Selected test profile: ${profile.name}`);
                                  }}
                                  className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition ${
                                    selectedTestProfileId === profile.id
                                      ? 'bg-violet-50 dark:bg-violet-950/50 text-violet-900 dark:text-violet-200 font-bold border border-violet-200 dark:border-violet-800'
                                      : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                                      {profile.firstName.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-xs font-bold truncate flex items-center gap-1.5">
                                        <span>{profile.name}</span>
                                        <span className="text-[9px] font-semibold text-slate-400">({profile.company})</span>
                                      </div>
                                      <div className="text-[10px] text-slate-400 truncate">
                                        {profile.email} · {profile.points} pts · {profile.tier}
                                      </div>
                                    </div>
                                  </div>
                                  {selectedTestProfileId === profile.id && (
                                    <Check className="h-4 w-4 text-violet-600 shrink-0" />
                                  )}
                                </div>
                              ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* PERSONALIZATION CONFIRMATION PROMPT */}
                  <div className="mt-3 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-indigo-500/10 border border-violet-500/30 rounded-2xl p-3 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Sparkles className="h-5 w-5 text-violet-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          Want to see personalized view for {selectedTestProfile.name}?
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          Merges {selectedTestProfile.firstName}'s variables ({`{{firstName}}, {{points}}, {{orderId}}`}) into canvas.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSendTestModal(false);
                        setGmailViewMode('email');
                        showToast(`✨ Loaded personalized view for ${selectedTestProfile.name}!`);
                      }}
                      className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold shrink-0 shadow-md shadow-violet-500/25 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Load View</span>
                    </button>
                  </div>
                </div>

                {/* Recipient chips + quick add */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Recipients</label>
                    <button
                      type="button"
                      onClick={() => addTestRecipient(ACCOUNT_EMAIL)}
                      className="flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 transition hover:border-violet-400 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-300"
                    >
                      <Plus className="h-3 w-3" /> Send to me
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/70 p-2 shadow-2xs focus-within:ring-2 focus-within:ring-violet-500 dark:border-slate-700 dark:bg-slate-800/70">
                    {testRecipientList.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 rounded-lg bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-800 dark:bg-violet-950/60 dark:text-violet-200"
                      >
                        {email}
                        <button type="button" onClick={() => removeTestRecipient(email)} className="rounded p-0.5 hover:bg-violet-200 dark:hover:bg-violet-900">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={testRecipientDraft}
                      onChange={(e) => setTestRecipientDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                          e.preventDefault();
                          addTestRecipient(testRecipientDraft);
                        } else if (e.key === 'Backspace' && !testRecipientDraft && testRecipientList.length) {
                          removeTestRecipient(testRecipientList[testRecipientList.length - 1]);
                        }
                      }}
                      onBlur={() => testRecipientDraft && addTestRecipient(testRecipientDraft)}
                      placeholder={testRecipientList.length ? 'Add another…' : 'name@company.com'}
                      className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-[11px] text-slate-900 placeholder-slate-400 outline-hidden dark:text-white"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">Press Enter, comma or space to add. {testRecipientList.length} recipient{testRecipientList.length === 1 ? '' : 's'}.</p>
                </div>

                {/* Subject prefix + live personalized subject preview */}
                <div className="rounded-2xl border border-slate-200/80 bg-slate-100/80 p-3 dark:border-slate-700/80 dark:bg-slate-800/50">
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Outgoing test subject</div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-semibold text-slate-400">Prefix</span>
                      <input
                        value={testSubjectPrefix}
                        onChange={(e) => setTestSubjectPrefix(e.target.value)}
                        className="w-20 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-violet-700 outline-hidden focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                    {testSubjectPrefix.trim() && (
                      <span className="shrink-0 rounded-md bg-violet-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow-2xs">
                        {testSubjectPrefix.trim()} #{testCount}
                      </span>
                    )}
                    <span className="truncate">{applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}</span>
                  </div>
                </div>

                {/* Inbox render preview — desktop / mobile / dark */}
                <div>
                  <div className="mb-1.5 flex items-center gap-1">
                    {([
                      { id: 'desktop', label: 'Desktop', icon: Laptop },
                      { id: 'mobile', label: 'Mobile', icon: Smartphone },
                      { id: 'dark', label: 'Dark', icon: Eye },
                    ] as const).map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTestPreviewDevice(id)}
                        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition ${
                          testPreviewDevice === id
                            ? 'bg-violet-600 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        <Icon className="h-3 w-3" /> {label}
                      </button>
                    ))}
                  </div>
                  <div
                    className={`mx-auto rounded-xl border p-3 transition-all ${
                      testPreviewDevice === 'mobile' ? 'max-w-[260px]' : 'w-full'
                    } ${
                      testPreviewDevice === 'dark'
                        ? 'border-slate-700 bg-slate-900 text-slate-100'
                        : 'border-slate-200 bg-white text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 text-[11px] font-bold text-white">
                        {(fromName || 'M').charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-bold">{fromName || 'Marbee'}</div>
                        <div className={`truncate text-[11px] font-semibold ${testPreviewDevice === 'dark' ? 'text-slate-100' : 'text-slate-800'}`}>
                          {testSubjectPrefix.trim() ? `${testSubjectPrefix.trim()} ` : ''}
                          {applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}
                        </div>
                        <div className={`truncate text-[10px] ${testPreviewDevice === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}>
                          {applyPersonalization(preheader || 'Discover the latest news and offers', selectedTestProfile)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preflight checklist — computed from real template state */}
                {(() => {
                  const html = (rawHtml || renderBlocksToHtml(blocks)).toLowerCase();
                  const imageBlocks = blocks.filter((b) => b.type === 'image');
                  const imagesWithAlt = imageBlocks.filter((b) => ((b.content as any)?.alt || '').trim());
                  const checks = [
                    { ok: Boolean(subject.trim()), label: 'Subject line is set' },
                    { ok: Boolean(preheader.trim()), label: 'Preheader / preview text is set' },
                    { ok: blocks.length > 0, label: `${blocks.length} content block${blocks.length === 1 ? '' : 's'} on canvas` },
                    { ok: html.includes('unsubscribe'), label: 'Unsubscribe link present' },
                    { ok: imageBlocks.length === 0 || imagesWithAlt.length === imageBlocks.length, label: imageBlocks.length ? `Alt text on ${imagesWithAlt.length}/${imageBlocks.length} images` : 'No images to check' },
                  ];
                  const failing = checks.filter((c) => !c.ok).length;
                  return (
                    <div className="rounded-2xl border border-slate-200/80 bg-white/60 p-3 dark:border-slate-700/80 dark:bg-slate-800/40">
                      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Preflight {failing === 0 ? '· all clear' : `· ${failing} to review`}
                      </div>
                      <div className="space-y-1">
                        {checks.map((c, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-[11px]">
                            {c.ok ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                            )}
                            <span className={c.ok ? 'text-slate-600 dark:text-slate-300' : 'font-semibold text-amber-700 dark:text-amber-400'}>{c.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Test send history (this session) */}
                {testHistory.length > 0 && (
                  <div className="rounded-2xl border border-slate-200/80 bg-white/60 p-3 dark:border-slate-700/80 dark:bg-slate-800/40">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <History className="h-3.5 w-3.5" /> Sent this session
                    </div>
                    <div className="max-h-24 space-y-1 overflow-y-auto [scrollbar-width:thin]">
                      {testHistory.map((h) => (
                        <div key={h.id} className="flex items-center justify-between gap-2 text-[10.5px]">
                          <span className="truncate text-slate-600 dark:text-slate-300">{h.subject}</span>
                          <span className="shrink-0 text-slate-400">{h.at} · {h.to.length} to</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sending Progress Bar (Active when isSendingTest === true) */}
                {isSendingTest && (
                  <div className="space-y-2 pt-2 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <RotateCcw className="h-3.5 w-3.5 animate-spin text-violet-600" />
                        <span>Dispatching test proof #{testCount}...</span>
                      </span>
                      <span>{testSendProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full transition-all duration-300 shadow-xs"
                        style={{ width: `${testSendProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={isSendingTest}
                    onClick={() => setShowSendTestModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSendingTest || testRecipientList.length === 0}
                    onClick={() => {
                      const sentSubject = `${testSubjectPrefix.trim() ? `${testSubjectPrefix.trim()} #${testCount} ` : ''}${applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}`;
                      const sentTo = [...testRecipientList];
                      setIsSendingTest(true);
                      setTestSendProgress(20);
                      setTimeout(() => setTestSendProgress(50), 300);
                      setTimeout(() => setTestSendProgress(85), 700);
                      setTimeout(() => {
                        setTestSendProgress(100);
                        setTimeout(() => {
                          setIsSendingTest(false);
                          setTestSendSuccess(true);
                          setTemplateStatus('in_review');
                          setTestCount(prev => prev + 1);
                          setTestHistory((prev) => [
                            { id: `${Date.now()}`, at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), to: sentTo, subject: sentSubject },
                            ...prev,
                          ].slice(0, 8));
                          showToast(`Test #${testCount} sent to ${sentTo.length} recipient${sentTo.length === 1 ? '' : 's'} · status: In review`);
                        }, 400);
                      }, 1100);
                    }}
                    className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-violet-500/25 transition cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{isSendingTest ? 'Sending Test...' : `Send test${testRecipientList.length ? ` (${testRecipientList.length})` : ''}`}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* SUCCESS CONFIRMATION STATE */
              <div className="text-center py-4 space-y-4 relative z-10 animate-in zoom-in-95">
                <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 border border-emerald-300 dark:border-emerald-700 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Check className="h-7 w-7 stroke-[3]" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">Sample Test Dispatched!</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    Sent with subject <strong className="text-slate-900 dark:text-white">{testSubjectPrefix.trim() ? `${testSubjectPrefix.trim()} #${testCount - 1} ` : ''}{applyPersonalization(subject || 'Special update from Marbee', selectedTestProfile)}</strong> to {testRecipientList.join(', ')}
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-300 text-amber-800 dark:text-amber-300 text-xs font-bold">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Status updated: In review</span>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSendTestModal(false)}
                    className="px-6 py-2.5 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs shadow-md transition cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HYPERLINK INSERT/EDIT MODAL */}
      {linkModal && linkModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Link className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Make Hyperlink</h4>
                  <p className="text-[10px] text-slate-500">Attach URL to text selection</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLinkModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 text-[10px] uppercase">Display Text</label>
                <input
                  type="text"
                  value={linkModal.text}
                  onChange={(e) => setLinkModal({ ...linkModal, text: e.target.value })}
                  placeholder="e.g. Visit Our Store"
                  className="h-8 w-full rounded-lg border border-slate-200 px-2.5 text-xs bg-white focus:border-violet-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 text-[10px] uppercase">Destination URL</label>
                <input
                  type="url"
                  value={linkModal.url}
                  onChange={(e) => setLinkModal({ ...linkModal, url: e.target.value })}
                  placeholder="https://example.com/offer"
                  className="h-8 w-full rounded-lg border border-slate-200 px-2.5 font-mono text-[11px] bg-white focus:border-violet-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setLinkModal(null)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const block = blocks.find((b) => b.id === linkModal.blockId);
                  if (!block) return;

                  // Canvas edits: wrap the live (restored) contentEditable selection
                  // via the shared rich-text pipeline so partial selections work.
                  if (linkModal.canvas) {
                    handleToolbarFormat(
                      linkModal.blockId,
                      linkModal.fieldKey,
                      'link',
                      linkModal.url || 'https://',
                      linkModal.text || 'Click here'
                    );
                    setLinkModal(null);
                    showToast('Hyperlink applied!');
                    return;
                  }

                  const linkHtml = `<a href="${linkModal.url || 'https://'}" style="color: #6366f1; text-decoration: underline;" target="_blank">${linkModal.text || 'Link'}</a>`;

                  if (linkModal.fieldKey === 'slot' && typeof selectedSlotIndex === 'number') {
                    const cols = [...((block.content as any).columns || [])];
                    const currentText = cols[selectedSlotIndex]?.content?.text || '';
                    const newText =
                      linkModal.start !== linkModal.end
                        ? currentText.substring(0, linkModal.start) + linkHtml + currentText.substring(linkModal.end)
                        : (currentText ? `${currentText} ${linkHtml}` : linkHtml);
                    cols[selectedSlotIndex] = {
                      ...cols[selectedSlotIndex],
                      content: { ...cols[selectedSlotIndex]?.content, text: newText },
                    };
                    handleUpdateBlockContent(linkModal.blockId, { columns: cols });
                  } else {
                    const currentText = (block.content as any)[linkModal.fieldKey] ?? (block.content as any).text ?? (block.content as any).body ?? '';
                    const newText =
                      linkModal.start !== linkModal.end
                        ? currentText.substring(0, linkModal.start) + linkHtml + currentText.substring(linkModal.end)
                        : (currentText ? `${currentText} ${linkHtml}` : linkHtml);
                    const updated: any = { [linkModal.fieldKey]: newText };
                    if (linkModal.fieldKey === 'text' || linkModal.fieldKey === 'body') {
                      updated.title = newText;
                      updated.text = newText;
                      updated.body = newText;
                    }
                    handleUpdateBlockContent(linkModal.blockId, updated);
                  }
                  setLinkModal(null);
                  showToast('Hyperlink applied!');
                }}
                className="px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-md transition cursor-pointer"
              >
                Apply Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
