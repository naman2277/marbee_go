/**
 * DEV-ONLY harness for iterating on the Email Template Studio without a
 * Supabase session or a saved template. Mounted at /dev/email-studio and
 * only when import.meta.env.DEV is true (see App.tsx).
 */
import { useState } from 'react';
import { EmailTemplateStudio } from '@/components/content-templates/EmailTemplateStudio';
import type { EmailContent } from '@/lib/content-templates';

const SEED_BLOCKS = [
  {
    id: 'seed-title',
    type: 'title' as const,
    content: { text: 'Your headline goes here', heading_level: 'h1' },
    styles: {
      font_size: 30,
      font_weight: '800',
      line_height: 1.2,
      text_color: '#0f172a',
      alignment: 'left',
      padding_top: 24,
      padding_bottom: 8,
      padding_left: 28,
      padding_right: 28,
    },
  },
  {
    id: 'seed-para',
    type: 'paragraph' as const,
    content: {
      text: 'Select any part of this sentence and try bold, a colour, a highlight, or turn it into a link. Everything should work directly on the canvas.',
    },
    styles: {
      font_size: 15,
      line_height: 1.65,
      text_color: '#475569',
      alignment: 'left',
      padding_top: 4,
      padding_bottom: 16,
      padding_left: 28,
      padding_right: 28,
    },
  },
  {
    id: 'seed-btn',
    type: 'button' as const,
    content: { text: 'Primary action', url: 'https://example.com' },
    styles: {
      bg_color: '#6d28d9',
      text_color: '#ffffff',
      border_radius: 10,
      alignment: 'center',
      padding_top: 12,
      padding_bottom: 20,
    },
  },
  {
    id: 'seed-cols',
    type: 'columns' as const,
    content: {
      columns: [
        { id: 'c0', width: 50, content: { type: 'text', text: 'Left column copy.' } },
        { id: 'c1', width: 50, content: { type: 'text', text: 'Right column copy.' } },
      ],
    },
    styles: { padding_top: 16, padding_bottom: 16 },
  },
  {
    id: 'seed-img',
    type: 'image' as const,
    content: {
      url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1000&auto=format&fit=crop&q=80',
      alt: 'Sample',
    },
    styles: { border_radius: 14, alignment: 'center', padding_top: 16, padding_bottom: 16, padding_left: 28, padding_right: 28 },
  },
];

export function DevEmailStudioPage() {
  const [content, setContent] = useState<EmailContent>(() => ({
    subject: 'Dev harness',
    preheader: 'Iterating on the studio',
    html_body: '',
    builder_state: { theme: {}, blocks: SEED_BLOCKS as any },
    blocks: SEED_BLOCKS as any,
  }) as EmailContent);

  return (
    <div className="h-screen w-screen overflow-hidden bg-white">
      <EmailTemplateStudio
        templateId="dev-harness"
        content={content}
        initialStatus={'draft' as any}
        onChange={(next) => setContent(next as EmailContent)}
        personalizationSample={{ first_name: 'Alex', last_name: 'Morgan', company: 'Northwind' }}
        templateName="Dev Harness Template"
        createdDate="Today"
        onSave={() => {}}
        onBack={() => {
          window.location.href = '/';
        }}
      />
    </div>
  );
}
