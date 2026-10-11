import type { EmailBlock } from './email-builder-types';

/**
 * Intelligent HTML to Plain Text Converter
 * Strips HTML formatting, converts headings to title cases, links to [Text] (url),
 * list items to bullets, and cleans whitespace.
 */
export function convertHtmlToPlainText(html: string): string {
  if (!html || !html.trim()) return '';

  // 1. Remove style and script tags with content
  let text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // 2. Format headings (H1, H2, H3)
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, content) => `\n\n${content.trim().toUpperCase()}\n================================\n`);
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, content) => `\n\n${content.trim().toUpperCase()}\n--------------------------------\n`);
  text = text.replace(/<h[3-6][^>]*>([\s\S]*?)<\/h[3-6]>/gi, (_, content) => `\n\n${content.trim()}\n`);

  // 3. Format links: <a href="url">Label</a> -> Label (url)
  text = text.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
    const cleanLabel = label.replace(/<[^>]*>/g, '').trim();
    if (!cleanLabel || cleanLabel === href) return href;
    return `${cleanLabel} (${href})`;
  });

  // 4. Format buttons
  text = text.replace(/<button[^>]*>([\s\S]*?)<\/button>/gi, (_, label) => `\n[ ${label.trim()} ]\n`);

  // 5. Format lists
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, item) => `\n• ${item.trim()}`);

  // 6. Format horizontal rules & paragraphs
  text = text.replace(/<hr[^>]*>/gi, '\n--------------------------------\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');

  // 7. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // 8. Decode HTML entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&bull;/gi, '•')
    .replace(/&copy;/gi, '©');

  // 9. Normalize multiple blank lines
  text = text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

/**
 * AMP for Email Validator & Diagnostics
 * Validates AMP4Email specifications matching official AMP Playground rules.
 */
export interface AmpValidationResult {
  isValid: boolean;
  errors: { line?: number; message: string; severity: 'error' | 'warning' }[];
  summary: string;
}

export function validateAmpEmailCode(ampCode: string): AmpValidationResult {
  const errors: AmpValidationResult['errors'] = [];
  if (!ampCode || !ampCode.trim()) {
    return {
      isValid: false,
      errors: [{ message: 'AMP code is empty. Please enter your AMP for Email markup.', severity: 'error' }],
      summary: 'Empty AMP Document',
    };
  }

  // 1. Check for ⚡4email or amp4email attribute
  const hasAmpAttr = /<html\s+[^>]*(\⚡4email|amp4email)/i.test(ampCode) || /<html\s+(\⚡4email|amp4email)/i.test(ampCode);
  if (!hasAmpAttr) {
    errors.push({
      message: 'Missing mandatory <html ⚡4email> or <html amp4email> attribute on <html> tag.',
      severity: 'error',
    });
  }

  // 2. Check for AMP JS runtime script
  const hasAmpRuntime = /<script\s+async\s+src=["']https:\/\/cdn\.ampproject\.org\/v0\.js["']><\/script>/i.test(ampCode) ||
                        /cdn\.ampproject\.org\/v0\.js/i.test(ampCode);
  if (!hasAmpRuntime) {
    errors.push({
      message: 'Missing mandatory AMP runtime script: <script async src="https://cdn.ampproject.org/v0.js"></script>',
      severity: 'error',
    });
  }

  // 3. Check for AMP boilerplate style
  const hasBoilerplate = /<style\s+amp-boilerplate>/i.test(ampCode) || /amp-boilerplate/i.test(ampCode);
  if (!hasBoilerplate) {
    errors.push({
      message: 'Missing mandatory <style amp-boilerplate> tag in <head>.',
      severity: 'warning',
    });
  }

  // 4. Check for disallowed standard <img> tags (should be <amp-img>)
  const imgMatch = ampCode.match(/<img\s+[^>]*>/gi);
  if (imgMatch) {
    errors.push({
      message: `Found ${imgMatch.length} disallowed <img> tags. AMP for Email requires <amp-img width="..." height="..." layout="responsive"></amp-img>.`,
      severity: 'error',
    });
  }

  // 5. Check for disallowed <script> tags without amp-custom components
  const disallowedScripts = ampCode.match(/<script(?!\s+async\s+src=["']https:\/\/cdn\.ampproject\.org)[^>]*>[\s\S]*?<\/script>/gi);
  if (disallowedScripts) {
    errors.push({
      message: 'Disallowed custom JavaScript <script> tags detected. AMP only allows official amp components.',
      severity: 'error',
    });
  }

  // 6. Check size limit (< 100KB)
  const byteSize = new Blob([ampCode]).size;
  if (byteSize > 100000) {
    errors.push({
      message: `Document size is ${(byteSize / 1024).toFixed(1)}KB. AMP for Email strictly requires size under 100KB.`,
      severity: 'error',
    });
  }

  const errorCount = errors.filter((e) => e.severity === 'error').length;
  return {
    isValid: errorCount === 0,
    errors,
    summary: errorCount === 0 ? '✅ Valid AMP for Email Document' : `❌ ${errorCount} Validation Error(s) Found`,
  };
}

/**
 * Standard AMP for Email Boilerplate Template
 */
export const SAMPLE_AMP_BOILERPLATE = `<!doctype html>
<html ⚡4email data-css-strict>
<head>
  <meta charset="utf-8">
  <script async src="https://cdn.ampproject.org/v0.js"></script>
  <style amp4email-boilerplate>body{visibility:hidden}</style>
  <style amp-custom>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 24px;
      color: #1e293b;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    }
    .hero-header {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #ffffff;
      padding: 32px 24px;
      text-align: center;
    }
    .content-body {
      padding: 24px;
    }
    .cta-btn {
      display: inline-block;
      background: #6366f1;
      color: #ffffff;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 8px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="hero-header">
      <h1 style="margin:0;font-size:24px;">Interactive AMP Email</h1>
      <p style="margin:8px 0 0;opacity:0.9;font-size:14px;">Powered by Marbee Studio</p>
    </div>
    <div class="content-body">
      <h2 style="font-size:18px;margin-top:0;">Experience Real-Time Interactivity</h2>
      <p style="font-size:14px;line-height:1.6;color:#475569;">
        This AMP email supports interactive components, real-time live content updates, and in-email user actions.
      </p>
      <div style="text-align:center;margin-top:24px;">
        <a href="https://marbee.io" class="cta-btn">Explore Live Journey</a>
      </div>
    </div>
  </div>
</body>
</html>`;

/**
 * Smart Bidirectional HTML to Visual Studio Blocks Parser
 * Intelligently analyzes arbitrary HTML email code and translates it into
 * fully editable visual blocks (images, buttons, text, multi-column rows, dividers, html).
 */
export function parseHtmlToVisualBlocks(html: string): EmailBlock[] {
  if (!html || !html.trim()) return [];

  try {
    // 1. Sanitize server-side include tags and meta comments before parsing
    const sanitizedHtml = html
      .replace(/<%@[\s\S]*?%>/gi, '')
      .replace(/<%\s*[\s\S]*?%>/gi, '')
      .replace(/{%[\s\S]*?%}/gi, '');

    const parser = new DOMParser();
    const doc = parser.parseFromString(sanitizedHtml, 'text/html');
    const blocks: EmailBlock[] = [];
    let blockIdCounter = 1;

    const generateId = (prefix: string) => `${prefix}-${Date.now()}-${blockIdCounter++}`;

    // Helper: Extract inline CSS style properties
    const getComputedStylesFromElement = (el: Element) => {
      const styleAttr = (el.getAttribute('style') || '').toLowerCase();
      const fontSizeMatch = styleAttr.match(/font-size:\s*(\d+)px/i);
      const colorMatch = styleAttr.match(/color:\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\)|[a-z]+)/i);
      const bgMatch = styleAttr.match(/background(?:-color)?:\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\)|[a-z]+)/i);
      const alignMatch = (el.getAttribute('align') || styleAttr.match(/text-align:\s*(left|center|right|justify)/i)?.[1] || 'left').toLowerCase();
      const fontFamilyMatch = styleAttr.match(/font-family:\s*([^;]+)/i);
      const fontWeightMatch = styleAttr.match(/font-weight:\s*(bold|[6-9]00)/i);
      const fontStyleMatch = styleAttr.match(/font-style:\s*(italic)/i);
      const padTopMatch = styleAttr.match(/padding(?:-top)?:\s*(\d+)px/i);
      const padBottomMatch = styleAttr.match(/padding(?:-bottom)?:\s*(\d+)px/i);

      return {
        font_size: fontSizeMatch ? parseInt(fontSizeMatch[1], 10) : undefined,
        text_color: colorMatch ? colorMatch[1].trim() : undefined,
        bg_color: bgMatch ? bgMatch[1].trim() : undefined,
        alignment: alignMatch as any,
        font_family: fontFamilyMatch ? fontFamilyMatch[1].trim() : undefined,
        font_weight: fontWeightMatch ? 'bold' : 'normal',
        font_style: fontStyleMatch ? 'italic' : 'normal',
        padding_top: padTopMatch ? parseInt(padTopMatch[1], 10) : 0,
        padding_bottom: padBottomMatch ? parseInt(padBottomMatch[1], 10) : 0,
      };
    };

    const processedNodes = new Set<Element>();

    const allElements = Array.from(doc.body.querySelectorAll('*'));
    allElements.forEach((el) => {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') return;

      // 1. ALWAYS extract every IMG in document order — never skip based on processedNodes
      if (el.tagName === 'IMG') {
        const src = el.getAttribute('src') || '';
        if (src) {
          const align = (
            el.getAttribute('align') ||
            el.parentElement?.getAttribute('align') ||
            'center'
          ).toLowerCase();

          blocks.push({
            id: generateId('img'),
            type: 'image',
            content: {
              src,
              url: src,
              alt: el.getAttribute('alt') || '',
              link_url: el.closest('a')?.getAttribute('href') || '',
            },
            styles: {
              padding_top: 0,
              padding_bottom: 0,
              padding_left: 0,
              padding_right: 0,
              alignment: align as any,
              bg_color: 'transparent',
            },
          });
        }
        return;
      }

      // 2. Multi-Column Row TR (2+ direct leaf TDs — no child tables inside the TDs)
      if (el.tagName === 'TR' && !processedNodes.has(el)) {
        const directTds = Array.from(el.querySelectorAll(':scope > td, :scope > th')).filter(
          (td) => td.querySelectorAll('table').length === 0
        );

        if (directTds.length >= 2) {
          processedNodes.add(el);
          // Mark only non-IMG children as processed (images were already handled above)
          directTds.forEach((td) => {
            processedNodes.add(td);
            td.querySelectorAll('a, p, span, h1, h2, h3, h4, button').forEach((child) => processedNodes.add(child));
          });

          const columns = directTds.map((td, idx) => {
            const tdWidthAttr = td.getAttribute('width') || '';
            const tdStyle = td.getAttribute('style') || '';
            const widthMatch = tdWidthAttr.match(/(\d+)/) || tdStyle.match(/width:\s*(\d+)%/i) || tdStyle.match(/width:\s*(\d+)px/i);
            let colWidth = widthMatch ? parseInt(widthMatch[1], 10) : Math.floor(100 / directTds.length);
            if (colWidth > 100) colWidth = Math.floor(100 / directTds.length);

            const cellImg = td.querySelector('img');
            const cellBtn = td.querySelector('a, button');
            const cellText = td.textContent?.trim() || '';

            let slotContent: any = null;
            if (cellImg) {
              slotContent = {
                type: 'image',
                src: cellImg.getAttribute('src') || '',
                url: cellImg.getAttribute('src') || '',
                alt: cellImg.getAttribute('alt') || '',
              };
            } else if (cellBtn && cellText.length < 30) {
              slotContent = {
                type: 'button',
                label: cellBtn.textContent?.trim() || 'Click Here',
                text: cellBtn.textContent?.trim() || 'Click Here',
                url: cellBtn.getAttribute('href') || '#',
              };
            } else if (cellText) {
              slotContent = { type: 'text', text: cellText };
            }

            return { id: `col-${idx}`, width: colWidth, content: slotContent };
          });

          const computed = getComputedStylesFromElement(el);
          blocks.push({
            id: generateId('columns'),
            type: 'columns' as any,
            content: { columns },
            styles: {
              padding_top: 0,
              padding_bottom: 0,
              padding_left: 0,
              padding_right: 0,
              bg_color: computed.bg_color || '#ffffff',
            },
          });
          return;
        }
      }

      if (processedNodes.has(el)) return;

      // 3. CTA Button
      if (el.tagName === 'A' || el.tagName === 'BUTTON') {
        const text = el.textContent?.trim() || '';
        const style = (el.getAttribute('style') || '').toLowerCase();
        if (
          text.length > 0 &&
          text.length < 40 &&
          !el.querySelector('img') &&
          (style.includes('background') || style.includes('padding') || el.className.includes('btn'))
        ) {
          processedNodes.add(el);
          const computed = getComputedStylesFromElement(el);
          blocks.push({
            id: generateId('btn'),
            type: 'button',
            content: { label: text, text, url: el.getAttribute('href') || '#' },
            styles: {
              padding_top: 10,
              padding_bottom: 10,
              alignment: computed.alignment || 'center',
              button_bg: computed.bg_color || '#6366f1',
              text_color: computed.text_color || '#ffffff',
            },
          });
          return;
        }
      }

      // 4. Text leaf node
      const isLeafText =
        (el.tagName === 'P' || el.tagName === 'H1' || el.tagName === 'H2' || el.tagName === 'H3' || el.tagName === 'H4' || el.tagName === 'TD' || el.tagName === 'DIV' || el.tagName === 'SPAN') &&
        el.querySelectorAll('img, table, p, h1, h2, h3, h4, div').length === 0;

      if (isLeafText) {
        const text = el.textContent?.trim() || '';
        if (text.length > 0 && !/^<%[@=]?/.test(text) && !text.includes('Designed with Marbee')) {
          processedNodes.add(el);
          const computed = getComputedStylesFromElement(el);
          blocks.push({
            id: generateId('txt'),
            type: 'text',
            content: { text, body: text, heading: text },
            styles: {
              padding_top: computed.padding_top || 8,
              padding_bottom: computed.padding_bottom || 8,
              alignment: computed.alignment || 'left',
              font_size: computed.font_size || 14,
              font_family: computed.font_family || 'Inter, sans-serif',
              font_weight: computed.font_weight || 'normal',
              font_style: computed.font_style || 'normal',
              text_color: computed.text_color || '#334155',
              bg_color: 'transparent',
            },
          });
          return;
        }
      }
    });

    if (blocks.length === 0) {
      blocks.push({
        id: `html-fallback-${Date.now()}`,
        type: 'html' as any,
        content: { code: sanitizedHtml },
        styles: { padding_top: 0, padding_bottom: 0 },
      });
    }

    return blocks;
  } catch (err) {
    console.warn('HTML parsing error, creating raw HTML block:', err);
    return [
      {
        id: `html-fallback-${Date.now()}`,
        type: 'html' as any,
        content: { code: html },
        styles: { padding_top: 0, padding_bottom: 0 },
      },
    ];
  }
}
