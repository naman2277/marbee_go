# Advanced SaaS Marketing Template Library

This package contains 50 production-style starter templates:

- 10 responsive HTML Email designs
- 10 SMS templates with governance metadata
- 10 WhatsApp templates with categories, variables and CTA buttons
- 10 Web Push templates with actions, icons and personalization
- 10 RCS rich-card templates with media, CTA and SMS fallback

## Design direction
The email templates use a modern SaaS design system:
- responsive layout
- branded header
- hierarchy / eyebrow / hero
- cards and KPI blocks
- CTA hierarchy
- mobile adaptation
- preference / unsubscribe footer
- personalization variables

## Important
The channel JSON files are provider-neutral structures. Before production use, map them to:
- WhatsApp Business provider approval / template rules
- RCS carrier / provider payload requirements
- Web Push service-worker implementation
- SMS sender / encoding / regional compliance
- Email ESP and rendering constraints

All dynamic values use `{{variable_name}}`.
