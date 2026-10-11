import type { FormField, FormSchemaMapping, FormSettings } from './forms';

export type FormBuildMode = 'template' | 'builder' | 'html';

export type FormTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  fields: FormField[];
  settings: Partial<FormSettings>;
  schema_mapping?: FormSchemaMapping;
};

const tid = (n: number) => `tpl-${n}`;

function field(
  id: string,
  label: string,
  field_type: FormField['field_type'],
  sort_order: number,
  extra?: Partial<FormField>,
): FormField {
  const name = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return { id, name, label, field_type, sort_order, ...extra };
}

export const FORM_TEMPLATE_CATEGORIES = [
  'All',
  'Lead generation',
  'Support',
  'E-commerce',
  'Events',
  'HR & hiring',
  'Feedback',
  'Subscriptions',
] as const;

export const FORM_TEMPLATES: FormTemplate[] = [
  {
    id: tid(1),
    name: 'Contact Us',
    category: 'Lead generation',
    description: 'General inquiry with name, email, and message.',
    icon: '✉️',
    fields: [
      field('f1', 'Full name', 'text', 0, { required: true }),
      field('f2', 'Email', 'email', 1, { required: true }),
      field('f3', 'Phone', 'phone', 2),
      field('f4', 'Message', 'textarea', 3, { required: true }),
    ],
    settings: { submit_label: 'Send message', description: 'We typically respond within 24 hours.' },
    schema_mapping: { upsert_customer: true },
  },
  {
    id: tid(2),
    name: 'Newsletter Signup',
    category: 'Subscriptions',
    description: 'Capture email subscribers with consent.',
    icon: '📬',
    fields: [
      field('f1', 'Email', 'email', 0, { required: true, placeholder: 'you@company.com' }),
      field('f2', 'First name', 'text', 1),
      field('f3', 'I agree to receive marketing emails', 'checkbox', 2, { required: true }),
    ],
    settings: { submit_label: 'Subscribe' },
    schema_mapping: { upsert_customer: true },
  },
  {
    id: tid(3),
    name: 'Demo Request',
    category: 'Lead generation',
    description: 'B2B demo booking with company details.',
    icon: '🎯',
    fields: [
      field('f1', 'Work email', 'email', 0, { required: true }),
      field('f2', 'Company', 'text', 1, { required: true }),
      field('f3', 'Team size', 'select', 2, { options: ['1-10', '11-50', '51-200', '200+'] }),
      field('f4', 'Use case', 'textarea', 3),
    ],
    settings: { submit_label: 'Book a demo' },
    schema_mapping: { upsert_customer: true },
  },
  {
    id: tid(4),
    name: 'Support Ticket',
    category: 'Support',
    description: 'Customer support intake form.',
    icon: '🎫',
    fields: [
      field('f1', 'Email', 'email', 0, { required: true }),
      field('f2', 'Subject', 'text', 1, { required: true }),
      field('f3', 'Priority', 'select', 2, { options: ['Low', 'Medium', 'High', 'Urgent'] }),
      field('f4', 'Description', 'textarea', 3, { required: true }),
    ],
    settings: { submit_label: 'Submit ticket' },
  },
  {
    id: tid(5),
    name: 'Product Feedback',
    category: 'Feedback',
    description: 'NPS-style product feedback survey.',
    icon: '⭐',
    fields: [
      field('f1', 'Email', 'email', 0),
      field('f2', 'Rating', 'select', 1, { required: true, options: ['1', '2', '3', '4', '5'] }),
      field('f3', 'What did you like?', 'textarea', 2),
      field('f4', 'What can we improve?', 'textarea', 3),
    ],
    settings: { submit_label: 'Send feedback' },
  },
  {
    id: tid(6),
    name: 'Event Registration',
    category: 'Events',
    description: 'Register attendees for webinars or events.',
    icon: '📅',
    fields: [
      field('f1', 'Full name', 'text', 0, { required: true }),
      field('f2', 'Email', 'email', 1, { required: true }),
      field('f3', 'Company', 'text', 2),
      field('f4', 'Job title', 'text', 3),
      field('f5', 'Dietary requirements', 'text', 4),
    ],
    settings: { submit_label: 'Register' },
    schema_mapping: { upsert_customer: true },
  },
  {
    id: tid(7),
    name: 'Job Application',
    category: 'HR & hiring',
    description: 'Basic job application intake.',
    icon: '💼',
    fields: [
      field('f1', 'Full name', 'text', 0, { required: true }),
      field('f2', 'Email', 'email', 1, { required: true }),
      field('f3', 'Phone', 'phone', 2, { required: true }),
      field('f4', 'Role applying for', 'text', 3, { required: true }),
      field('f5', 'LinkedIn URL', 'text', 4),
      field('f6', 'Cover note', 'textarea', 5),
    ],
    settings: { submit_label: 'Apply now' },
  },
  {
    id: tid(8),
    name: 'Quote Request',
    category: 'E-commerce',
    description: 'Request a quote for products or services.',
    icon: '💰',
    fields: [
      field('f1', 'Name', 'text', 0, { required: true }),
      field('f2', 'Email', 'email', 1, { required: true }),
      field('f3', 'Product', 'text', 2, { required: true }),
      field('f4', 'Quantity', 'number', 3),
      field('f5', 'Notes', 'textarea', 4),
    ],
    settings: { submit_label: 'Get quote' },
    schema_mapping: { upsert_customer: true },
  },
  {
    id: tid(9),
    name: 'Abandoned Cart Recovery',
    category: 'E-commerce',
    description: 'Re-engage shoppers who left items behind.',
    icon: '🛒',
    fields: [
      field('f1', 'Email', 'email', 0, { required: true }),
      field('f2', 'Send me a reminder', 'checkbox', 1, { required: true }),
      field('f3', 'Discount code preference', 'select', 2, { options: ['10% off', 'Free shipping', 'No discount'] }),
    ],
    settings: { submit_label: 'Complete my order' },
    schema_mapping: { upsert_customer: true },
  },
  {
    id: tid(10),
    name: 'Webinar RSVP',
    category: 'Events',
    description: 'Simple RSVP for online sessions.',
    icon: '🎥',
    fields: [
      field('f1', 'Name', 'text', 0, { required: true }),
      field('f2', 'Email', 'email', 1, { required: true }),
      field('f3', 'Timezone', 'select', 2, { options: ['IST', 'GMT', 'EST', 'PST'] }),
    ],
    settings: { submit_label: 'RSVP' },
  },
  {
    id: tid(11),
    name: 'Customer Satisfaction (CSAT)',
    category: 'Feedback',
    description: 'Post-interaction satisfaction survey.',
    icon: '😊',
    fields: [
      field('f1', 'How satisfied are you?', 'select', 0, {
        required: true,
        options: ['Very satisfied', 'Satisfied', 'Neutral', 'Dissatisfied', 'Very dissatisfied'],
      }),
      field('f2', 'Comments', 'textarea', 1),
    ],
    settings: { submit_label: 'Submit survey' },
  },
  {
    id: tid(12),
    name: 'Partner Inquiry',
    category: 'Lead generation',
    description: 'Partnership and affiliate interest.',
    icon: '🤝',
    fields: [
      field('f1', 'Company name', 'text', 0, { required: true }),
      field('f2', 'Contact email', 'email', 1, { required: true }),
      field('f3', 'Partnership type', 'select', 2, { options: ['Reseller', 'Integration', 'Affiliate', 'Other'] }),
      field('f4', 'Tell us more', 'textarea', 3),
    ],
    settings: { submit_label: 'Submit inquiry' },
  },
  {
    id: tid(13),
    name: 'Refund Request',
    category: 'Support',
    description: 'Process refund and return requests.',
    icon: '↩️',
    fields: [
      field('f1', 'Order ID', 'text', 0, { required: true }),
      field('f2', 'Email', 'email', 1, { required: true }),
      field('f3', 'Reason', 'select', 2, { required: true, options: ['Damaged', 'Wrong item', 'Not as described', 'Other'] }),
      field('f4', 'Details', 'textarea', 3, { required: true }),
    ],
    settings: { submit_label: 'Request refund' },
  },
  {
    id: tid(14),
    name: 'Waitlist Signup',
    category: 'Subscriptions',
    description: 'Join a product or feature waitlist.',
    icon: '⏳',
    fields: [
      field('f1', 'Email', 'email', 0, { required: true }),
      field('f2', 'Feature interest', 'select', 1, { options: ['Mobile app', 'API access', 'Enterprise plan', 'Other'] }),
    ],
    settings: { submit_label: 'Join waitlist' },
    schema_mapping: { upsert_customer: true },
  },
  {
    id: tid(15),
    name: 'Employee Referral',
    category: 'HR & hiring',
    description: 'Refer a candidate for open roles.',
    icon: '👥',
    fields: [
      field('f1', 'Your name', 'text', 0, { required: true }),
      field('f2', 'Candidate name', 'text', 1, { required: true }),
      field('f3', 'Candidate email', 'email', 2, { required: true }),
      field('f4', 'Role', 'text', 3, { required: true }),
      field('f5', 'Why are they a fit?', 'textarea', 4),
    ],
    settings: { submit_label: 'Submit referral' },
  },
  {
    id: tid(16),
    name: 'Beta Program Application',
    category: 'Lead generation',
    description: 'Apply for early access to new features.',
    icon: '🚀',
    fields: [
      field('f1', 'Name', 'text', 0, { required: true }),
      field('f2', 'Email', 'email', 1, { required: true }),
      field('f3', 'Company', 'text', 2),
      field('f4', 'How will you use this?', 'textarea', 3, { required: true }),
    ],
    settings: { submit_label: 'Apply for beta' },
  },
  {
    id: tid(17),
    name: 'Appointment Booking',
    category: 'Support',
    description: 'Schedule a call or appointment.',
    icon: '📞',
    fields: [
      field('f1', 'Name', 'text', 0, { required: true }),
      field('f2', 'Email', 'email', 1, { required: true }),
      field('f3', 'Preferred date', 'date', 2, { required: true }),
      field('f4', 'Topic', 'select', 3, { options: ['Sales', 'Support', 'Onboarding', 'Other'] }),
    ],
    settings: { submit_label: 'Book appointment' },
    schema_mapping: { upsert_customer: true },
  },
  {
    id: tid(18),
    name: 'Content Download Gate',
    category: 'Lead generation',
    description: 'Gate whitepapers and ebooks behind a form.',
    icon: '📄',
    fields: [
      field('f1', 'Work email', 'email', 0, { required: true }),
      field('f2', 'Job title', 'text', 1),
      field('f3', 'Company size', 'select', 2, { options: ['1-10', '11-50', '51-200', '200+'] }),
    ],
    settings: { submit_label: 'Download now' },
    schema_mapping: { upsert_customer: true },
  },
  {
    id: tid(19),
    name: 'Post-Purchase Survey',
    category: 'Feedback',
    description: 'Collect feedback after a purchase.',
    icon: '📦',
    fields: [
      field('f1', 'Order ID', 'text', 0),
      field('f2', 'Delivery experience', 'select', 1, { required: true, options: ['Excellent', 'Good', 'Fair', 'Poor'] }),
      field('f3', 'Product quality', 'select', 2, { required: true, options: ['Excellent', 'Good', 'Fair', 'Poor'] }),
      field('f4', 'Additional comments', 'textarea', 3),
    ],
    settings: { submit_label: 'Submit review' },
  },
  {
    id: tid(20),
    name: 'Volunteer Signup',
    category: 'Events',
    description: 'Community and volunteer registration.',
    icon: '🙋',
    fields: [
      field('f1', 'Full name', 'text', 0, { required: true }),
      field('f2', 'Email', 'email', 1, { required: true }),
      field('f3', 'Phone', 'phone', 2),
      field('f4', 'Availability', 'select', 3, { options: ['Weekdays', 'Weekends', 'Flexible'] }),
      field('f5', 'Skills', 'textarea', 4),
    ],
    settings: { submit_label: 'Sign up to volunteer' },
  },
];

export function getFormTemplate(id: string): FormTemplate | undefined {
  return FORM_TEMPLATES.find((t) => t.id === id);
}

export const DEFAULT_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 24px auto; padding: 16px; }
    label { display: block; margin-bottom: 12px; font-size: 14px; font-weight: 500; }
    input, textarea { width: 100%; box-sizing: border-box; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; margin-top: 4px; }
    button { width: 100%; margin-top: 8px; padding: 10px; background: #4f46e5; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <h2>{{form_title}}</h2>
  <p>{{form_description}}</p>
  <form>
    <label>Email <input type="email" name="email" required placeholder="you@company.com" /></label>
    <label>Message <textarea name="message" rows="4" placeholder="Your message…"></textarea></label>
    <button type="submit">Submit</button>
  </form>
</body>
</html>`;
