export type EmailBlockType =
  | 'title'
  | 'paragraph'
  | 'text'
  | 'list'
  | 'button'
  | 'image'
  | 'table'
  | 'divider'
  | 'spacer'
  | 'social'
  | 'html'
  | 'video'
  | 'icons'
  | 'columns'
  | 'header'
  | 'hero'
  | 'fashion_hero'
  | 'columns_2'
  | 'columns_3'
  | 'columns_4'
  | 'columns_2_1'
  | 'columns_1_2'
  | 'columns_3_1'
  | 'columns_1_3'
  | 'columns_2_1_1'
  | 'grid_2x2'
  | 'product_card'
  | 'recommendation_grid'
  | 'coupon'
  | 'countdown'
  | 'testimonial'
  | 'footer';

export type EmailBlockStyle = {
  bg_color?: string;
  gradient_bg?: string;
  text_color?: string;
  font_family?: string;
  padding_top?: number;
  padding_bottom?: number;
  padding_left?: number;
  padding_right?: number;
  margin_top?: number;
  margin_bottom?: number;
  margin_left?: number;
  margin_right?: number;
  border_radius?: number;
  border_color?: string;
  border_width?: number;
  border_style?: 'solid' | 'dashed' | 'dotted' | 'none';
  alignment?: 'left' | 'center' | 'right' | 'justify';
  font_size?: number;
  line_height?: number;
  font_weight?: string;
  box_shadow?: string;
};

export type EmailBlock = {
  id: string;
  type: EmailBlockType;
  content: Record<string, any>;
  styles?: EmailBlockStyle;
};

export type EmailGlobalTheme = {
  canvas_bg: string;
  card_bg: string;
  text_color: string;
  heading_color: string;
  primary_color: string;
  font_family: string;
  max_width: number;
  border_radius: number;
};

export const DEFAULT_EMAIL_THEME: EmailGlobalTheme = {
  canvas_bg: '#f3f4f6',
  card_bg: '#ffffff',
  text_color: '#1e293b',
  heading_color: '#0f172a',
  primary_color: '#7c3aed',
  font_family: "'Playfair Display', 'Georgia', serif",
  max_width: 680,
  border_radius: 20,
};
