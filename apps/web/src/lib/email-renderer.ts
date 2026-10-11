import type { EmailBlock, EmailGlobalTheme } from './email-builder-types';
import { DEFAULT_EMAIL_THEME } from './email-builder-types';

export function renderBlockHtml(block: EmailBlock, theme: EmailGlobalTheme): string {
  const { type, content, styles = {} } = block;
  const padT = styles.padding_top ?? 16;
  const padB = styles.padding_bottom ?? 16;
  const padL = styles.padding_left ?? 24;
  const padR = styles.padding_right ?? 24;
  const bg = styles.bg_color ? `background-color:${styles.bg_color};` : '';
  const align = styles.alignment ?? 'left';
  const textColor = styles.text_color ?? theme.text_color;

  const containerStyle = `padding:${padT}px ${padR}px ${padB}px ${padL}px;${bg}text-align:${align};`;

  switch (type) {
    case 'header': {
      const logoUrl = content.logo_url || '';
      const title = content.title || 'Brand Logo';
      const navLinks = Array.isArray(content.nav_links) ? content.nav_links : [];
      return `
        <tr>
          <td style="${containerStyle}">
            <table width="100%" border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td align="left" style="vertical-align:middle;">
                  ${
                    logoUrl
                      ? `<img src="${logoUrl}" alt="${title}" height="36" style="max-height:36px;border:0;display:block;" />`
                      : `<span style="font-size:20px;font-weight:bold;color:${theme.heading_color};letter-spacing:-0.5px;">${title}</span>`
                  }
                </td>
                ${
                  navLinks.length > 0
                    ? `<td align="right" style="vertical-align:middle;">
                        ${navLinks
                          .map(
                            (l: any) =>
                              `<a href="${l.url || '#'}" style="color:${textColor};text-decoration:none;font-size:13px;font-weight:600;margin-left:16px;">${l.label || 'Link'}</a>`,
                          )
                          .join('')}
                      </td>`
                    : ''
                }
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case 'hero': {
      const eyebrow = content.eyebrow ? `<p style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:${theme.primary_color};margin:0 0 8px 0;">${content.eyebrow}</p>` : '';
      const title = content.title ? `<h1 style="font-size:28px;font-weight:800;color:${styles.text_color || theme.heading_color};margin:0 0 12px 0;line-height:1.2;">${content.title}</h1>` : '';
      const body = content.body ? `<p style="font-size:15px;color:${textColor};line-height:1.6;margin:0 0 20px 0;">${content.body}</p>` : '';
      const btnText = content.button_text;
      const btnUrl = content.button_url || '#';
      const btnBg = content.button_bg || theme.primary_color;
      const btnColor = content.button_color || '#ffffff';
      const button = btnText
        ? `<table border="0" cellpadding="0" cellspacing="0" style="margin:${align === 'center' ? '0 auto' : align === 'right' ? '0 0 0 auto' : '0'};">
            <tr>
              <td align="center" style="border-radius:8px;background-color:${btnBg};">
                <a href="${btnUrl}" target="_blank" style="font-size:14px;font-weight:bold;color:${btnColor};text-decoration:none;padding:12px 28px;display:inline-block;border-radius:8px;">${btnText}</a>
              </td>
            </tr>
          </table>`
        : '';

      return `
        <tr>
          <td style="${containerStyle}">
            ${eyebrow}
            ${title}
            ${body}
            ${button}
          </td>
        </tr>`;
    }

    case 'title': {
      const headingLevel = content.heading_level || 'h1';
      const rawText = content.text ?? content.title ?? 'Headline Title';
      const defaultSize = headingLevel === 'h1' ? 28 : headingLevel === 'h2' ? 24 : headingLevel === 'h3' ? 20 : 16;
      const fontSize = styles.font_size || defaultSize;
      const fontFamily = styles.font_family || theme.font_family;
      const fontWeight = styles.font_weight || '800';
      const color = styles.text_color || theme.heading_color;
      const textAlign = styles.alignment || align || 'left';
      const lineHeight = styles.line_height || 1.2;
      const letterSpacing = styles.letter_spacing !== undefined ? `letter-spacing:${styles.letter_spacing}px;` : 'letter-spacing:-0.5px;';
      const formattedHtml = rawText.replace(/\n/g, '<br />');

      const textStyle = `font-family:${fontFamily};font-size:${fontSize}px;font-weight:${fontWeight};color:${color};text-align:${textAlign};line-height:${lineHeight};${letterSpacing}margin:0;`;

      return `
        <tr>
          <td style="${containerStyle}">
            <${headingLevel} style="${textStyle}">${formattedHtml}</${headingLevel}>
          </td>
        </tr>`;
    }

    case 'paragraph': {
      const rawText = content.text ?? content.body ?? 'Paragraph copy goes here.';
      const fontSize = styles.font_size || 15;
      const fontFamily = styles.font_family || theme.font_family;
      const fontWeight = styles.font_weight || 'normal';
      const fontStyle = styles.font_style || 'normal';
      const textDecoration = styles.text_decoration || 'none';
      const color = styles.text_color || textColor;
      const textAlign = styles.alignment || align || 'left';
      const lineHeight = styles.line_height || 1.6;
      const letterSpacing = styles.letter_spacing ? `letter-spacing:${styles.letter_spacing}px;` : '';
      const formattedHtml = rawText.replace(/\n/g, '<br />');

      const textStyle = `font-family:${fontFamily};font-size:${fontSize}px;font-weight:${fontWeight};font-style:${fontStyle};text-decoration:${textDecoration};color:${color};text-align:${textAlign};line-height:${lineHeight};${letterSpacing}margin:0;`;

      return `
        <tr>
          <td style="${containerStyle}">
            <p style="${textStyle}">${formattedHtml}</p>
          </td>
        </tr>`;
    }

    case 'list': {
      const listType = content.list_type || 'bullet';
      const items: string[] = Array.isArray(content.items) ? content.items : ['Item 1', 'Item 2', 'Item 3'];
      const fontSize = styles.font_size || 14;
      const color = styles.text_color || textColor;
      const lineHeight = styles.line_height || 1.6;
      const Tag = listType === 'numbered' ? 'ol' : 'ul';

      return `
        <tr>
          <td style="${containerStyle}">
            <${Tag} style="margin:0;padding-left:24px;font-family:${theme.font_family};font-size:${fontSize}px;color:${color};line-height:${lineHeight};">
              ${items.map(it => `<li style="margin-bottom:8px;">${it}</li>`).join('')}
            </${Tag}>
          </td>
        </tr>`;
    }

    case 'table': {
      const headers: string[] = Array.isArray(content.headers) ? content.headers : ['Product / Service', 'Qty', 'Price'];
      const rows: string[][] = Array.isArray(content.rows) ? content.rows : [['Marbee Pro Plan', '1', '$149.00']];
      const borderColor = styles.border_color || '#e2e8f0';

      return `
        <tr>
          <td style="${containerStyle}">
            <table width="100%" border="0" cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid ${borderColor};font-family:${theme.font_family};font-size:13px;">
              <tr style="background:#f8fafc;font-weight:bold;color:${theme.heading_color};border-bottom:1px solid ${borderColor};">
                ${headers.map(h => `<td style="padding:10px 12px;border-right:1px solid ${borderColor};">${h}</td>`).join('')}
              </tr>
              ${rows.map(row => `
                <tr style="border-bottom:1px solid ${borderColor};color:${textColor};">
                  ${row.map(cell => `<td style="padding:8px 12px;border-right:1px solid ${borderColor};">${cell}</td>`).join('')}
                </tr>
              `).join('')}
            </table>
          </td>
        </tr>`;
    }

    case 'video': {
      const videoUrl = content.video_url || 'https://youtube.com';
      const thumbUrl = content.thumbnail_url || 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=800&auto=format&fit=crop&q=80';
      const title = content.title || 'Watch Video';

      return `
        <tr>
          <td style="${containerStyle}">
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto;border-radius:12px;overflow:hidden;background:#000000;text-align:center;">
              <tr>
                <td style="position:relative;">
                  <a href="${videoUrl}" target="_blank" style="text-decoration:none;display:block;">
                    <img src="${thumbUrl}" alt="${title}" style="width:100%;height:auto;display:block;opacity:0.85;" />
                    <div style="padding:12px;background:#0f172a;color:#ffffff;font-size:12px;font-weight:bold;font-family:${theme.font_family};">
                      ▶ ${title}
                    </div>
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case 'icons': {
      const items: Array<{ icon: string; label: string }> = Array.isArray(content.items) ? content.items : [
        { icon: '⭐', label: 'Top Rated' },
        { icon: '🚀', label: 'Fast Delivery' },
        { icon: '🛡️', label: '100% Secure' },
      ];
      return `
        <tr>
          <td style="${containerStyle}">
            <table width="100%" border="0" cellpadding="0" cellspacing="0">
              <tr>
                ${items.map(it => `
                  <td align="center" style="vertical-align:top;padding:8px;">
                    <div style="font-size:24px;margin-bottom:4px;">${it.icon}</div>
                    <div style="font-size:12px;font-weight:bold;color:${theme.heading_color};font-family:${theme.font_family};">${it.label}</div>
                  </td>
                `).join('')}
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case 'text': {
      const rawText = content.text ?? content.body ?? content.heading ?? content.title ?? '';
      const fontSize = styles.font_size || 16;
      const fontFamily = styles.font_family || theme.font_family;
      const fontWeight = styles.font_weight || 'normal';
      const fontStyle = styles.font_style || 'normal';
      const textDecoration = styles.text_decoration || 'none';
      const color = styles.text_color || textColor;
      const textAlign = styles.alignment || align || 'left';
      const lineHeight = styles.line_height || 1.4;
      const letterSpacing = styles.letter_spacing ? `letter-spacing:${styles.letter_spacing}px;` : '';
      const bgHighlight = styles.highlight_color && styles.highlight_color !== 'transparent' ? `background-color:${styles.highlight_color};` : '';

      // Format newlines into HTML breaks
      const formattedHtml = rawText.replace(/\n/g, '<br />');

      const textStyle = `font-family:${fontFamily};font-size:${fontSize}px;font-weight:${fontWeight};font-style:${fontStyle};text-decoration:${textDecoration};color:${color};text-align:${textAlign};line-height:${lineHeight};${letterSpacing}${bgHighlight}margin:0;`;

      return `
        <tr>
          <td style="${containerStyle}">
            <div style="${textStyle}">${formattedHtml}</div>
          </td>
        </tr>`;
    }

    case 'button': {
      const btnText = content.text || 'Click Here';
      const btnUrl = content.url || '#';
      const btnBg = styles.bg_color || theme.primary_color;
      const btnColor = styles.text_color || '#ffffff';
      const radius = styles.border_radius ?? 8;
      return `
        <tr>
          <td style="${containerStyle}">
            <table border="0" cellpadding="0" cellspacing="0" style="margin:${align === 'center' ? '0 auto' : align === 'right' ? '0 0 0 auto' : '0'};">
              <tr>
                <td align="center" style="border-radius:${radius}px;background-color:${btnBg};">
                  <a href="${btnUrl}" target="_blank" style="font-size:14px;font-weight:bold;color:${btnColor};text-decoration:none;padding:12px 28px;display:inline-block;border-radius:${radius}px;">${btnText}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case 'image': {
      const imgUrl = content.url || 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=600&auto=format&fit=crop&q=80';
      const alt = content.alt || 'Banner Image';
      const linkUrl = content.link_url;
      const radius = styles.border_radius ?? 8;
      const imgTag = `<img src="${imgUrl}" alt="${alt}" style="max-width:100%;height:auto;border:0;display:block;border-radius:${radius}px;margin:${align === 'center' ? '0 auto' : align === 'right' ? '0 0 0 auto' : '0'};" />`;
      const linkedImg = linkUrl ? `<a href="${linkUrl}" target="_blank">${imgTag}</a>` : imgTag;

      // Optional CTA button overlaid on the image (9-position grid).
      if (content.cta_enabled && content.cta_text) {
        const pos: string = content.cta_position || 'center-center';
        const [vPos, hPos] = pos.split('-');
        const vAlign = vPos === 'top' ? 'top' : vPos === 'bottom' ? 'bottom' : 'middle';
        const hAlign = hPos === 'left' ? 'left' : hPos === 'right' ? 'right' : 'center';
        const ctaBg = content.cta_bg || theme.primary_color || '#7c3aed';
        const ctaColor = content.cta_color || '#ffffff';
        const ctaHref = content.cta_url || linkUrl || '#';
        const ctaBtn = `<a href="${ctaHref}" target="_blank" style="display:inline-block;background:${ctaBg};color:${ctaColor};font-size:13px;font-weight:bold;text-decoration:none;padding:10px 22px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,0.25);">${content.cta_text}</a>`;
        return `
        <tr>
          <td style="${containerStyle}">
            <!--[if mso]>${linkedImg}<div style="text-align:${hAlign};margin-top:8px;">${ctaBtn}</div><![endif]-->
            <!--[if !mso]><!-->
            <div style="position:relative;display:inline-block;max-width:100%;width:100%;text-align:${hAlign};">
              ${linkedImg}
              <div style="position:absolute;${vAlign === 'top' ? 'top:14px;' : vAlign === 'bottom' ? 'bottom:14px;' : 'top:50%;transform:translateY(-50%);'}left:14px;right:14px;text-align:${hAlign};">
                ${ctaBtn}
              </div>
            </div>
            <!--<![endif]-->
          </td>
        </tr>`;
      }

      return `
        <tr>
          <td style="${containerStyle}">
            ${linkedImg}
          </td>
        </tr>`;
    }

    case 'columns_2': {
      const col1 = content.col1 || { title: 'Feature 1', body: 'Description for column 1', button_text: 'Learn More' };
      const col2 = content.col2 || { title: 'Feature 2', body: 'Description for column 2', button_text: 'Learn More' };
      return `
        <tr>
          <td style="${containerStyle}">
            <table width="100%" border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td width="48%" class="stack-column" style="vertical-align:top;background-color:#f8fafc;border-radius:12px;padding:16px;">
                  ${col1.image_url ? `<img src="${col1.image_url}" alt="" style="width:100%;height:auto;border-radius:8px;margin-bottom:12px;display:block;" />` : ''}
                  <h3 style="font-size:16px;font-weight:bold;color:${theme.heading_color};margin:0 0 6px 0;">${col1.title || ''}</h3>
                  <p style="font-size:13px;color:${textColor};line-height:1.5;margin:0 0 12px 0;">${col1.body || ''}</p>
                  ${col1.button_text ? `<a href="${col1.button_url || '#'}" style="font-size:12px;font-weight:bold;color:${theme.primary_color};text-decoration:none;">${col1.button_text} →</a>` : ''}
                </td>
                <td width="4%" class="stack-spacer"></td>
                <td width="48%" class="stack-column" style="vertical-align:top;background-color:#f8fafc;border-radius:12px;padding:16px;">
                  ${col2.image_url ? `<img src="${col2.image_url}" alt="" style="width:100%;height:auto;border-radius:8px;margin-bottom:12px;display:block;" />` : ''}
                  <h3 style="font-size:16px;font-weight:bold;color:${theme.heading_color};margin:0 0 6px 0;">${col2.title || ''}</h3>
                  <p style="font-size:13px;color:${textColor};line-height:1.5;margin:0 0 12px 0;">${col2.body || ''}</p>
                  ${col2.button_text ? `<a href="${col2.button_url || '#'}" style="font-size:12px;font-weight:bold;color:${theme.primary_color};text-decoration:none;">${col2.button_text} →</a>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case 'columns_3': {
      const items = Array.isArray(content.items) ? content.items : [
        { icon: '🚀', title: 'Fast Delivery', body: 'Same-day instant dispatch' },
        { icon: '🛡️', title: 'Secure Checkouts', body: 'Bank-grade SSL security' },
        { icon: '⭐', title: '5-Star Support', body: '24/7 priority customer care' },
      ];
      return `
        <tr>
          <td style="${containerStyle}">
            <table width="100%" border="0" cellpadding="0" cellspacing="0">
              <tr>
                ${items
                  .map(
                    (it: any) => `
                  <td width="31%" class="stack-column" style="vertical-align:top;text-align:center;padding:12px;background:#f8fafc;border-radius:12px;">
                    <div style="font-size:24px;margin-bottom:8px;">${it.icon || '✨'}</div>
                    <h4 style="font-size:14px;font-weight:bold;color:${theme.heading_color};margin:0 0 4px 0;">${it.title || ''}</h4>
                    <p style="font-size:12px;color:${textColor};margin:0;line-height:1.4;">${it.body || ''}</p>
                  </td>
                  <td width="3.5%" class="stack-spacer"></td>
                `,
                  )
                  .join('')}
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case 'product_card': {
      const title = content.title || 'Marbee Pro Subscription';
      const desc = content.description || 'Access all enterprise marketing features.';
      const price = content.price || '$49/mo';
      const originalPrice = content.original_price || '$99/mo';
      const badge = content.badge || 'POPULAR';
      const imgUrl = content.image_url || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&auto=format&fit=crop&q=80';
      const btnText = content.button_text || 'Claim Offer';
      const btnUrl = content.button_url || '#';

      return `
        <tr>
          <td style="${containerStyle}">
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;background:#ffffff;">
              <tr>
                <td width="40%" class="stack-column" style="vertical-align:middle;padding:0;">
                  <img src="${imgUrl}" alt="${title}" style="width:100%;height:100%;object-fit:cover;display:block;" />
                </td>
                <td width="60%" class="stack-column" style="vertical-align:middle;padding:20px;">
                  ${badge ? `<span style="background:${theme.primary_color}15;color:${theme.primary_color};font-size:10px;font-weight:bold;padding:3px 8px;border-radius:4px;letter-spacing:0.5px;">${badge}</span>` : ''}
                  <h3 style="font-size:16px;font-weight:bold;color:${theme.heading_color};margin:8px 0 4px 0;">${title}</h3>
                  <p style="font-size:12px;color:${textColor};line-height:1.4;margin:0 0 12px 0;">${desc}</p>
                  <div style="margin-bottom:14px;">
                    <span style="font-size:20px;font-weight:800;color:${theme.heading_color};">${price}</span>
                    ${originalPrice ? `<span style="font-size:13px;color:#94a3b8;text-decoration:line-through;margin-left:6px;">${originalPrice}</span>` : ''}
                  </div>
                  <a href="${btnUrl}" style="background:${theme.primary_color};color:#ffffff;font-size:12px;font-weight:bold;text-decoration:none;padding:8px 18px;border-radius:6px;display:inline-block;">${btnText}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case 'coupon': {
      const code = content.code || '{{discount_code}}';
      const discount = content.discount_label || '20% OFF';
      const expiry = content.expiry_text || 'Expires in 48 hours';
      return `
        <tr>
          <td style="${containerStyle}">
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border:2px dashed ${theme.primary_color};border-radius:16px;background:#f5f3ff;padding:20px;text-align:center;">
              <tr>
                <td>
                  <p style="font-size:12px;font-weight:bold;color:${theme.primary_color};text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">Exclusive Voucher</p>
                  <h2 style="font-size:26px;font-weight:800;color:#312e81;margin:0 0 10px 0;">${discount}</h2>
                  <div style="background:#ffffff;border:1px solid #c7d2fe;display:inline-block;padding:8px 24px;border-radius:8px;font-family:monospace;font-size:18px;font-weight:bold;color:${theme.primary_color};letter-spacing:2px;margin-bottom:8px;">
                    ${code}
                  </div>
                  <p style="font-size:11px;color:#6b7280;margin:0;">${expiry}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case 'countdown': {
      const label = content.label || '⏳ FLASH SALE ENDS SOON';
      const subtext = content.subtext || 'Prices revert to normal once timer expires';
      return `
        <tr>
          <td style="${containerStyle}">
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:16px;padding:24px;text-align:center;color:#ffffff;">
              <tr>
                <td>
                  <p style="font-size:12px;font-weight:bold;color:#38bdf8;letter-spacing:1px;margin:0 0 12px 0;">${label}</p>
                  <table border="0" cellpadding="0" cellspacing="0" style="margin:0 auto 12px auto;">
                    <tr>
                      <td style="background:#1e293b;border-radius:8px;padding:8px 12px;font-size:22px;font-weight:bold;color:#ffffff;min-width:44px;text-align:center;">12<div style="font-size:9px;color:#94a3b8;font-weight:normal;">HOURS</div></td>
                      <td style="font-size:18px;font-weight:bold;color:#64748b;padding:0 6px;">:</td>
                      <td style="background:#1e293b;border-radius:8px;padding:8px 12px;font-size:22px;font-weight:bold;color:#ffffff;min-width:44px;text-align:center;">45<div style="font-size:9px;color:#94a3b8;font-weight:normal;">MINS</div></td>
                      <td style="font-size:18px;font-weight:bold;color:#64748b;padding:0 6px;">:</td>
                      <td style="background:#1e293b;border-radius:8px;padding:8px 12px;font-size:22px;font-weight:bold;color:#ffffff;min-width:44px;text-align:center;">30<div style="font-size:9px;color:#94a3b8;font-weight:normal;">SECS</div></td>
                    </tr>
                  </table>
                  <p style="font-size:11px;color:#94a3b8;margin:0;">${subtext}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case 'testimonial': {
      const quote = content.quote || '"Marbee increased our campaign open rates by 34% in the first week alone!"';
      const author = content.author || 'Sarah Jenkins';
      const role = content.role || 'VP of Marketing, TechFlow';
      return `
        <tr>
          <td style="${containerStyle}">
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-left:4px solid ${theme.primary_color};border-radius:0 12px 12px 0;padding:18px;">
              <tr>
                <td>
                  <div style="font-size:14px;color:#f59e0b;margin-bottom:6px;">★★★★★</div>
                  <p style="font-size:14px;font-style:italic;color:${textColor};line-height:1.5;margin:0 0 10px 0;">${quote}</p>
                  <p style="font-size:12px;font-weight:bold;color:${theme.heading_color};margin:0;">${author} <span style="font-weight:normal;color:#64748b;">· ${role}</span></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case 'divider': {
      const color = styles.border_color || '#e2e8f0';
      return `
        <tr>
          <td style="${containerStyle}">
            <hr style="border:0;border-top:1px solid ${color};margin:0;" />
          </td>
        </tr>`;
    }

    case 'spacer': {
      const height = content.height || 24;
      return `<tr><td height="${height}" style="height:${height}px;line-height:${height}px;font-size:1px;">&nbsp;</td></tr>`;
    }

    case 'social': {
      const links = Array.isArray(content.links) ? content.links : [
        { platform: 'Twitter / X', url: 'https://twitter.com' },
        { platform: 'LinkedIn', url: 'https://linkedin.com' },
        { platform: 'Instagram', url: 'https://instagram.com' },
        { platform: 'GitHub', url: 'https://github.com' },
      ];
      return `
        <tr>
          <td style="${containerStyle}">
            <table border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr>
                ${links
                  .map(
                    (l: any) => `
                  <td style="padding:0 8px;">
                    <a href="${l.url || '#'}" target="_blank" style="font-size:12px;font-weight:600;color:${theme.primary_color};text-decoration:none;">${l.platform || 'Link'}</a>
                  </td>
                `,
                  )
                  .join('')}
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case 'footer': {
      const company = content.company || 'Marbee Technologies Inc.';
      const address = content.address || '100 Innovation Blvd, Suite 400, San Francisco, CA 94105';
      const unsubUrl = content.unsubscribe_url || 'https://marbee.io/unsubscribe?contact={{email}}';
      return `
        <tr>
          <td style="${containerStyle};color:#64748b;font-size:11px;line-height:1.5;">
            <p style="margin:0 0 6px 0;">© ${new Date().getFullYear()} ${company}. All rights reserved.</p>
            <p style="margin:0 0 10px 0;">${address}</p>
            <p style="margin:0;">
              You received this email because you are registered on Marbee.
              <a href="${unsubUrl}" style="color:#64748b;text-decoration:underline;margin-left:4px;">Unsubscribe</a> · 
              <a href="https://marbee.io/preferences" style="color:#64748b;text-decoration:underline;margin-left:4px;">Manage Preferences</a>
            </p>
          </td>
        </tr>`;
    }

    case 'fashion_hero': {
      const brandLogo = content.brand_logo || 'logo-ipsum';
      const navLinks = Array.isArray(content.nav_links) ? content.nav_links : ['Marketplace', 'How it works', 'Creators', 'FAQ'];
      const headline = content.headline || 'Pick only two — we dare you';
      const bgGradient = styles.gradient_bg || 'linear-gradient(180deg, #dbeafe 0%, #fed7aa 50%, #f43f5e 100%)';
      const heroImage = content.hero_image || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80';

      return `
        <tr>
          <td style="padding:${padT}px ${padR}px ${padB}px ${padL}px;">
            <div style="background:${bgGradient};border-radius:24px;padding:36px 28px;text-align:center;overflow:hidden;">
              <!-- Header Bar -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td align="left" style="font-weight:900;font-size:16px;letter-spacing:-0.5px;color:#0f172a;">
                    ${brandLogo}
                  </td>
                  <td align="right">
                    ${navLinks.map((l: string) => `<span style="font-size:11px;font-weight:600;color:#334155;margin-left:14px;">${l}</span>`).join('')}
                  </td>
                </tr>
              </table>

              <!-- Big Display Typography -->
              <h1 style="font-family:'Playfair Display', Georgia, serif;font-size:42px;font-weight:600;line-height:1.15;color:#0f172a;margin:0 0 28px 0;letter-spacing:-1px;">
                ${headline}
              </h1>

              <!-- Arched 3D Artwork Hero -->
              <div style="margin:0 auto;max-width:440px;background:#09090b;border-radius:180px 180px 24px 24px;overflow:hidden;border:2px dashed #3b82f6;padding:12px 12px 0 12px;box-shadow:0 20px 40px -15px rgba(0,0,0,0.5);">
                <img src="${heroImage}" alt="Fashion Artwork" style="width:100%;height:auto;display:block;border-radius:170px 170px 16px 16px;" />
              </div>
            </div>
          </td>
        </tr>`;
    }

    case 'recommendation_grid': {
      const sectionTitle = content.title || 'Recommended for you';
      const items = Array.isArray(content.items) ? content.items : [
        { image: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=400&auto=format&fit=crop&q=80', title: 'Cosmic Fluid', tag: 'Art Edition' },
        { image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80', title: 'Neon Core', tag: 'Limited' },
        { image: 'https://images.unsplash.com/photo-1633167606207-d840b5070fc2?w=400&auto=format&fit=crop&q=80', title: 'Chrome Sphere', tag: 'New Season' },
      ];

      return `
        <tr>
          <td style="padding:${padT}px ${padR}px ${padB}px ${padL}px;">
            <h3 style="font-family:'Playfair Display', Georgia, serif;font-size:22px;font-weight:600;color:#0f172a;text-align:center;margin:0 0 20px 0;">
              ${sectionTitle}
            </h3>
            <table width="100%" border="0" cellpadding="0" cellspacing="0">
              <tr>
                ${items
                  .map(
                    (it: any) => `
                  <td width="33.33%" class="stack-column" style="padding:0 6px;vertical-align:top;">
                    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.04);">
                      <img src="${it.image}" alt="${it.title}" style="width:100%;height:140px;object-fit:cover;display:block;" />
                      <div style="padding:10px 8px;text-align:center;">
                        <p style="font-size:12px;font-weight:700;color:#0f172a;margin:0;">${it.title}</p>
                        <p style="font-size:10px;color:#64748b;margin:2px 0 0 0;">${it.tag}</p>
                      </div>
                    </div>
                  </td>`
                  )
                  .join('')}
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case 'columns': {
      const columns = (content as any)?.columns || [];
      if (!Array.isArray(columns) || columns.length === 0) return '';

      const colTds = columns.map((col: any) => {
        const width = col.width || Math.floor(100 / columns.length);
        const colContent = col.content;
        let innerHtml = '&nbsp;';

        if (colContent) {
          if (colContent.type === 'image' && (colContent.src || colContent.url)) {
            const imgUrl = colContent.src || colContent.url;
            const alt = colContent.alt || '';
            innerHtml = `<img src="${imgUrl}" alt="${alt}" style="width:100%;max-width:100%;height:auto;display:block;border-radius:${styles.border_radius ?? 8}px;" />`;
          } else if (colContent.type === 'button') {
            const label = colContent.label || colContent.text || 'Click Here';
            const url = colContent.url || '#';
            const btnBg = styles.button_bg || styles.bg_color || theme.primary_color;
            const btnColor = styles.button_color || styles.text_color || '#ffffff';
            innerHtml = `<table border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr>
                <td align="center" style="border-radius:${styles.border_radius ?? 8}px;background-color:${btnBg};">
                  <a href="${url}" target="_blank" style="font-size:13px;font-weight:bold;color:${btnColor};text-decoration:none;padding:10px 22px;display:inline-block;border-radius:${styles.border_radius ?? 8}px;">${label}</a>
                </td>
              </tr>
            </table>`;
          } else if (colContent.type === 'text') {
            const text = colContent.text || '';
            innerHtml = `<div style="font-size:${styles.font_size || 14}px;font-family:${styles.font_family || theme.font_family};color:${styles.text_color || textColor};line-height:${styles.line_height || 1.5};text-align:${styles.alignment || 'left'};">${text}</div>`;
          }
        }

        return `<td width="${width}%" class="stack-column" style="vertical-align:top;padding:8px;">${innerHtml}</td>`;
      }).join('\n');

      return `
        <tr>
          <td style="${containerStyle}">
            <table width="100%" border="0" cellpadding="0" cellspacing="0">
              <tr>
                ${colTds}
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case 'html': {
      return `
        <tr>
          <td style="${containerStyle}">
            ${content.code || ''}
          </td>
        </tr>`;
    }

    case 'columns_4':
    case 'columns_2_1':
    case 'columns_1_2':
    case 'grid_2x2': {
      return `
        <tr>
          <td style="${containerStyle}">
            <table width="100%" border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:8px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;text-align:center;font-size:12px;color:#64748b;">
                  ${content.label || 'Multi-column container'}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    default:
      return '';
  }
}

export function renderBlocksToHtml(
  blocks: EmailBlock[],
  theme: EmailGlobalTheme = DEFAULT_EMAIL_THEME,
): string {
  const renderedBlocks = blocks.map((b) => renderBlockHtml(b, theme)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Template</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: ${theme.canvas_bg}; font-family: ${theme.font_family}; }
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .stack-column, td.stack-column, .grid-column {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        min-width: 100% !important;
        box-sizing: border-box !important;
        margin-bottom: 12px !important;
      }
      .stack-spacer, td.stack-spacer {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
      img {
        max-width: 100% !important;
        height: auto !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:24px 0;background-color:${theme.canvas_bg};font-family:${theme.font_family};">
  <center>
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:${theme.max_width}px;" class="email-container">
      <tr>
        <td style="background-color:${theme.card_bg};border-radius:${theme.border_radius}px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          <table width="100%" border="0" cellpadding="0" cellspacing="0">
            ${renderedBlocks}
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`;
}

export function renderBlocksToAmpHtml(
  blocks: EmailBlock[],
  theme: EmailGlobalTheme = DEFAULT_EMAIL_THEME,
): string {
  const renderedBlocks = blocks.map((b) => renderBlockHtml(b, theme)).join('\n');

  return `<!doctype html>
<html ⚡4email data-css-strict>
<head>
  <meta charset="utf-8">
  <script async src="https://cdn.ampproject.org/v0.js"></script>
  <script async custom-element="amp-carousel" src="https://cdn.ampproject.org/v0/amp-carousel-0.1.js"></script>
  <script async custom-element="amp-accordion" src="https://cdn.ampproject.org/v0/amp-accordion-0.1.js"></script>
  <style amp4email-boilerplate>body{visibility:hidden}</style>
  <style amp-custom>
    body { background-color: ${theme.canvas_bg}; font-family: ${theme.font_family}; margin: 0; padding: 20px; }
    .email-card { max-width: ${theme.max_width}px; margin: 0 auto; background: ${theme.card_bg}; border-radius: ${theme.border_radius}px; overflow: hidden; }
  </style>
</head>
<body>
  <div class="email-card">
    <table width="100%" border="0" cellpadding="0" cellspacing="0">
      ${renderedBlocks}
    </table>
  </div>
</body>
</html>`;
}

export function renderBlocksToPlainText(blocks: EmailBlock[]): string {
  const lines: string[] = [];

  for (const b of blocks) {
    const c = b.content;
    switch (b.type) {
      case 'header':
        lines.push(`${c.title || 'Brand'} - ${c.nav_links?.map((l: any) => l.label).join(' | ') || ''}`);
        lines.push('----------------------------------------');
        break;
      case 'hero':
        if (c.eyebrow) lines.push(`[${c.eyebrow}]`);
        if (c.title) lines.push(c.title);
        if (c.body) lines.push(c.body);
        if (c.button_text) lines.push(`>>> ${c.button_text}: ${c.button_url || '#'}`);
        lines.push('');
        break;
      case 'text':
        if (c.heading) lines.push(c.heading);
        if (c.body) lines.push(c.body.replace(/<[^>]*>?/gm, ''));
        lines.push('');
        break;
      case 'button':
        lines.push(`>>> ${c.text || 'Click Here'}: ${c.url || '#'}`);
        lines.push('');
        break;
      case 'product_card':
        lines.push(`* ${c.title || 'Product'} - ${c.price || ''}`);
        lines.push(`  ${c.description || ''}`);
        lines.push(`  Buy: ${c.button_url || '#'}`);
        lines.push('');
        break;
      case 'coupon':
        lines.push(`*** PROMO VOUCHER: ${c.discount_label || ''} ***`);
        lines.push(`Code: ${c.code || ''} (${c.expiry_text || ''})`);
        lines.push('');
        break;
      case 'testimonial':
        lines.push(`"${c.quote || ''}" - ${c.author || ''} (${c.role || ''})`);
        lines.push('');
        break;
      case 'footer':
        lines.push('----------------------------------------');
        lines.push(`${c.company || 'Marbee Technologies'}`);
        lines.push(`${c.address || ''}`);
        lines.push(`Unsubscribe: ${c.unsubscribe_url || 'https://marbee.io/unsubscribe'}`);
        break;
    }
  }

  return lines.join('\n');
}
