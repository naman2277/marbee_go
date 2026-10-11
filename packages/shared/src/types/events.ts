export type MarbeeEvent = {
  event_id?: string;
  event_type: string;
  timestamp?: string;
  tenant_id?: string;
  environment?: string;
  identity: {
    customer_id?: string;
    anonymous_id?: string;
    ecid?: string;
  };
  source?: string;
  properties?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export type EngagementEventType =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'failed'
  | 'unsubscribed'
  | 'converted';

export type EngagementLog = {
  id: string;
  tenant_id: string;
  environment: string;
  customer_id: string | null;
  channel: string;
  message_id: string;
  event: EngagementEventType;
  timestamp: string;
  metadata: Record<string, unknown>;
};

export const OOTB_EVENT_TYPES = [
  'cart_added',
  'cart_abandoned',
  'product_viewed',
  'booking_completed',
  'payment_completed',
  'form_submitted',
  'purchase_completed',
  'page_viewed',
] as const;
