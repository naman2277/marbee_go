import type { EmailBlock, EmailGlobalTheme } from './email-builder-types';
import { DEFAULT_EMAIL_THEME } from './email-builder-types';

export type PrebuiltEmailTemplate = {
  id: string;
  name: string;
  category: 'onboarding' | 'ecommerce' | 'promotions' | 'transactional' | 'newsletter' | 'retention';
  description: string;
  subject: string;
  preheader: string;
  theme?: Partial<EmailGlobalTheme>;
  blocks: EmailBlock[];
};

export const PREBUILT_EMAIL_TEMPLATES: PrebuiltEmailTemplate[] = [
  {
    id: 'fashion-editorial',
    name: 'Fashion – Email template',
    category: 'ecommerce',
    description: 'High-fashion editorial layout with sunset gradients, display typography, and artwork recommendations.',
    subject: 'Pick only two — we dare you ✨',
    preheader: 'Explore the curated creator marketplace collection.',
    theme: {
      primary_color: '#7c3aed',
      canvas_bg: '#f3f4f6',
      card_bg: '#ffffff',
      font_family: "'Playfair Display', Georgia, serif",
      max_width: 680,
      border_radius: 24,
    },
    blocks: [
      {
        id: 'fashion-hero-1',
        type: 'fashion_hero',
        content: {
          brand_logo: 'logo-ipsum',
          nav_links: ['Marketplace', 'How it works', 'Creators', 'FAQ'],
          headline: 'Pick only two —\nwe dare you',
          hero_image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
        },
        styles: {
          gradient_bg: 'linear-gradient(180deg, #dbeafe 0%, #fed7aa 45%, #f43f5e 100%)',
          padding_top: 24,
          padding_bottom: 24,
          padding_left: 20,
          padding_right: 20,
        },
      },
      {
        id: 'rec-grid-1',
        type: 'recommendation_grid',
        content: {
          title: 'Recommended for you',
          items: [
            {
              image: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=400&auto=format&fit=crop&q=80',
              title: 'Cosmic Fluid',
              tag: 'Art Edition',
            },
            {
              image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80',
              title: 'Neon Core',
              tag: 'Limited',
            },
            {
              image: 'https://images.unsplash.com/photo-1633167606207-d840b5070fc2?w=400&auto=format&fit=crop&q=80',
              title: 'Chrome Sphere',
              tag: 'New Season',
            },
          ],
        },
        styles: {
          padding_top: 24,
          padding_bottom: 32,
          padding_left: 24,
          padding_right: 24,
        },
      },
      {
        id: 'footer-1',
        type: 'footer',
        content: {
          company: 'Themyra Cool Studio',
          address: '450 Fashion Ave, New York, NY 10018',
          unsubscribe_url: 'https://themyracool.com/unsub',
        },
        styles: {
          padding_top: 20,
          padding_bottom: 24,
          alignment: 'center',
        },
      },
    ],
  },
  {
    id: 'saas-welcome',
    name: 'SaaS Welcome & Onboarding Series',
    category: 'onboarding',
    description: 'Engage new signups, introduce core features, and guide them to their first aha moment.',
    subject: 'Welcome to Marbee, {{first_name}}! Let’s get you started 🚀',
    preheader: 'Your account is ready. Explore your personalized dashboard.',
    theme: {
      primary_color: '#4f46e5',
      canvas_bg: '#f8fafc',
      card_bg: '#ffffff',
    },
    blocks: [
      {
        id: 'hdr-1',
        type: 'header',
        content: {
          title: 'Marbee',
          logo_url: 'https://marbee.io/favicon.svg',
          nav_links: [
            { label: 'Dashboard', url: 'https://marbee.io/dashboard' },
            { label: 'Documentation', url: 'https://marbee.io/docs' },
          ],
        },
        styles: { padding_top: 24, padding_bottom: 16 },
      },
      {
        id: 'hero-1',
        type: 'hero',
        content: {
          eyebrow: 'WELCOME TO MARBEE',
          title: 'We’re thrilled to have you, {{first_name}}! 👋',
          body: 'You are now set up on the {{loyalty_tier}} plan with {{loyalty_points}} starter reward points. Experience modern omni-channel marketing automation built for high-growth teams.',
          button_text: 'Open Your Workspace →',
          button_url: 'https://marbee.io/dashboard',
          button_bg: '#4f46e5',
          button_color: '#ffffff',
        },
        styles: { padding_top: 16, padding_bottom: 24, alignment: 'center' },
      },
      {
        id: 'col3-1',
        type: 'columns_3',
        content: {
          items: [
            { icon: '🎨', title: 'Visual Builders', body: 'Drag-and-drop landing pages, forms, and emails.' },
            { icon: '⚡', title: 'Real-Time Journeys', body: 'Trigger event-based automations across 5 channels.' },
            { icon: '👥', title: 'Customer 360', body: 'Unified profiles, loyalty points, and smart segments.' },
          ],
        },
        styles: { padding_top: 12, padding_bottom: 20 },
      },
      {
        id: 'test-1',
        type: 'testimonial',
        content: {
          quote: '"Marbee unified our entire customer journey stack and saved our marketing team 20 hours a week."',
          author: 'Alex Morgan',
          role: 'Head of Growth, Acme Corp',
        },
        styles: { padding_top: 16, padding_bottom: 20 },
      },
      {
        id: 'social-1',
        type: 'social',
        content: {
          links: [
            { platform: 'Twitter / X', url: 'https://twitter.com' },
            { platform: 'LinkedIn', url: 'https://linkedin.com' },
            { platform: 'YouTube', url: 'https://youtube.com' },
          ],
        },
        styles: { padding_top: 16, padding_bottom: 12 },
      },
      {
        id: 'ftr-1',
        type: 'footer',
        content: {
          company: 'Marbee Technologies',
          address: '100 Innovation Way, San Francisco, CA 94105',
          unsubscribe_url: 'https://marbee.io/unsubscribe?email={{email}}',
        },
        styles: { padding_top: 12, padding_bottom: 24 },
      },
    ],
  },
  {
    id: 'abandoned-cart',
    name: 'E-Commerce Abandoned Cart Recovery',
    category: 'ecommerce',
    description: 'Recover lost revenue with product highlights and a personalized incentive coupon.',
    subject: 'You left something behind, {{first_name}}! 🛍️',
    preheader: 'Complete your checkout today and enjoy an extra 15% off.',
    theme: {
      primary_color: '#059669',
      canvas_bg: '#f0fdf4',
      card_bg: '#ffffff',
    },
    blocks: [
      {
        id: 'hdr-cart',
        type: 'header',
        content: {
          title: 'Marbee Store',
          nav_links: [{ label: 'Cart', url: 'https://marbee.io/cart' }],
        },
        styles: { padding_top: 20, padding_bottom: 12 },
      },
      {
        id: 'hero-cart',
        type: 'hero',
        content: {
          eyebrow: 'YOUR CART IS WAITING',
          title: 'Don’t let your favorites slip away!',
          body: 'Hi {{first_name}}, we’ve reserved the items in order #{{order_id}} for a limited time. Use code {{discount_code}} at checkout for 15% off.',
          button_text: 'Complete My Order ($149.00) →',
          button_url: 'https://marbee.io/checkout',
          button_bg: '#059669',
          button_color: '#ffffff',
        },
        styles: { padding_top: 12, padding_bottom: 16, alignment: 'center' },
      },
      {
        id: 'prod-cart',
        type: 'product_card',
        content: {
          title: 'Wireless Noise-Cancelling Headphones Pro',
          description: 'High-fidelity audio with 40-hour battery life and spatial audio.',
          price: '$149.00',
          original_price: '$199.00',
          badge: 'SAVED IN CART',
          button_text: 'Return to Cart',
          button_url: 'https://marbee.io/cart',
        },
        styles: { padding_top: 12, padding_bottom: 16 },
      },
      {
        id: 'coupon-cart',
        type: 'coupon',
        content: {
          discount_label: '15% OFF YOUR ENTIRE ORDER',
          code: '{{discount_code}}',
          expiry_text: 'Valid for the next 24 hours only.',
        },
        styles: { padding_top: 12, padding_bottom: 20 },
      },
      {
        id: 'ftr-cart',
        type: 'footer',
        content: {
          company: 'Marbee Commerce',
          address: '450 Market St, San Francisco, CA',
        },
        styles: { padding_top: 16, padding_bottom: 24 },
      },
    ],
  },
  {
    id: 'flash-sale',
    name: 'Flash Sale & Limited-Time Promo',
    category: 'promotions',
    description: 'High-urgency promotional campaign featuring live countdown timer and discount vouchers.',
    subject: '⚡ 24-HOUR FLASH SALE: Up to 50% off for {{first_name}}!',
    preheader: 'Limited stock available. Claim your exclusive coupon code.',
    theme: {
      primary_color: '#dc2626',
      canvas_bg: '#fef2f2',
      card_bg: '#ffffff',
    },
    blocks: [
      {
        id: 'hdr-sale',
        type: 'header',
        content: { title: 'Marbee Flash Deals' },
        styles: { padding_top: 20, padding_bottom: 12 },
      },
      {
        id: 'cd-sale',
        type: 'countdown',
        content: {
          label: '⚡ 24-HOUR FLASH SALE COUNTDOWN',
          subtext: 'Exclusive pricing for {{loyalty_tier}} members',
        },
        styles: { padding_top: 12, padding_bottom: 16 },
      },
      {
        id: 'hero-sale',
        type: 'hero',
        content: {
          eyebrow: 'EXCLUSIVE MEMBER REWARD',
          title: 'Special 30% Off Everything, {{first_name}}! 🎁',
          body: 'Use your VIP coupon code below to unlock massive discounts across all product lines.',
          button_text: 'Shop the Sale Now →',
          button_url: 'https://marbee.io/shop',
          button_bg: '#dc2626',
          button_color: '#ffffff',
        },
        styles: { padding_top: 12, padding_bottom: 16, alignment: 'center' },
      },
      {
        id: 'cpn-sale',
        type: 'coupon',
        content: {
          discount_label: '30% OFF STOREWIDE',
          code: '{{discount_code}}',
          expiry_text: 'Expires midnight tonight.',
        },
        styles: { padding_top: 12, padding_bottom: 20 },
      },
      {
        id: 'ftr-sale',
        type: 'footer',
        content: { company: 'Marbee Promotions Inc.' },
        styles: { padding_top: 16, padding_bottom: 24 },
      },
    ],
  },
  {
    id: 'order-shipped',
    name: 'Order Confirmation & Shipping Update',
    category: 'transactional',
    description: 'Transactional email keeping customers updated with real-time tracking details.',
    subject: 'Good news! Your order #{{order_id}} is on the way 🚚',
    preheader: 'Track your package with real-time delivery status.',
    theme: {
      primary_color: '#2563eb',
      canvas_bg: '#f8fafc',
      card_bg: '#ffffff',
    },
    blocks: [
      {
        id: 'hdr-ord',
        type: 'header',
        content: { title: 'Marbee Shipping' },
        styles: { padding_top: 20, padding_bottom: 12 },
      },
      {
        id: 'hero-ord',
        type: 'hero',
        content: {
          eyebrow: 'ORDER SHIPPED',
          title: 'Your package is on its way, {{first_name}}! 📦',
          body: 'We’ve packed and dispatched order #{{order_id}} for {{order_total}}. Estimated delivery: Friday by 7:00 PM.',
          button_text: 'Track Your Package →',
          button_url: 'https://marbee.io/track/{{order_id}}',
          button_bg: '#2563eb',
          button_color: '#ffffff',
        },
        styles: { padding_top: 12, padding_bottom: 20, alignment: 'center' },
      },
      {
        id: 'txt-ord',
        type: 'text',
        content: {
          heading: 'Shipping Address',
          body: '<p style="margin:0;color:#64748b;"><strong>{{name}}</strong><br>123 Maple Street<br>New York, NY 10001<br>Carrier: FedEx Priority (Tracking #94001118992)</p>',
        },
        styles: { padding_top: 12, padding_bottom: 20 },
      },
      {
        id: 'ftr-ord',
        type: 'footer',
        content: { company: 'Marbee Logistics' },
        styles: { padding_top: 16, padding_bottom: 24 },
      },
    ],
  },
  {
    id: 'saas-newsletter',
    name: 'Monthly SaaS Product Digest & Newsletter',
    category: 'newsletter',
    description: 'Editorial newsletter with product updates, feature spotlights, and community links.',
    subject: 'What’s new in Marbee this month, {{first_name}}? 🚀',
    preheader: 'New AI features, visual email builders, and customer success stories.',
    theme: {
      primary_color: '#7c3aed',
      canvas_bg: '#f5f3ff',
      card_bg: '#ffffff',
    },
    blocks: [
      {
        id: 'hdr-news',
        type: 'header',
        content: {
          title: 'The Marbee Monthly',
          nav_links: [{ label: 'Changelog', url: 'https://marbee.io/changelog' }],
        },
        styles: { padding_top: 20, padding_bottom: 12 },
      },
      {
        id: 'hero-news',
        type: 'hero',
        content: {
          eyebrow: 'MARCH 2026 EDITION',
          title: 'Introducing Next-Gen Visual Builders ✨',
          body: 'We’re excited to unveil our drag-and-drop email suite, AMP interactive emails, and instant Customer 360 profile testing.',
          button_text: 'Read Product Changelog →',
          button_url: 'https://marbee.io/blog/release',
          button_bg: '#7c3aed',
          button_color: '#ffffff',
        },
        styles: { padding_top: 12, padding_bottom: 20, alignment: 'left' },
      },
      {
        id: 'col2-news',
        type: 'columns_2',
        content: {
          col1: {
            title: '⚡ AMP for Email',
            body: 'Interactive carousels, accordions, and embedded forms inside the inbox.',
            button_text: 'Explore AMP Docs',
            button_url: 'https://marbee.io/docs/amp',
          },
          col2: {
            title: '👥 Profile Test Dispatch',
            body: 'Preview campaigns with any customer data and dispatch directly to your test email.',
            button_text: 'View Tutorial',
            button_url: 'https://marbee.io/docs/testing',
          },
        },
        styles: { padding_top: 12, padding_bottom: 20 },
      },
      {
        id: 'ftr-news',
        type: 'footer',
        content: { company: 'Marbee News' },
        styles: { padding_top: 16, padding_bottom: 24 },
      },
    ],
  },
];
