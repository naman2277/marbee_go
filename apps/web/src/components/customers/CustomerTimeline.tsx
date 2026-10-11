import {
  Activity,
  Bell,
  FileInput,
  GitBranch,
  Mail,
  MousePointerClick,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';
import type { TimelineItem } from '@/lib/customers';

export function TimelineIcon({ item }: { item: TimelineItem }) {
  const className = 'h-4 w-4';

  switch (item.kind) {
    case 'event':
      if (item.title.toLowerCase().includes('purchase') || item.title.toLowerCase().includes('cart')) {
        return <ShoppingCart className={`${className} text-emerald-600`} />;
      }
      return <Activity className={`${className} text-blue-600`} />;
    case 'engagement':
      if (item.title.includes('clicked') || item.title.includes('opened')) {
        return <MousePointerClick className={`${className} text-violet-600`} />;
      }
      if (item.title.includes('converted')) {
        return <Sparkles className={`${className} text-amber-600`} />;
      }
      return <Bell className={`${className} text-orange-500`} />;
    case 'form':
      return <FileInput className={`${className} text-pink-600`} />;
    case 'journey':
      return <GitBranch className={`${className} text-brand-600`} />;
    default:
      return <Mail className={className} />;
  }
}

export function timelineAccent(item: TimelineItem): string {
  switch (item.kind) {
    case 'event':
      return 'border-blue-200 bg-blue-50';
    case 'engagement':
      return 'border-orange-200 bg-orange-50';
    case 'form':
      return 'border-pink-200 bg-pink-50';
    case 'journey':
      return 'border-brand-200 bg-brand-50';
    default:
      return 'border-slate-200 bg-slate-50';
  }
}

export function timelineKindLabel(item: TimelineItem): string {
  switch (item.kind) {
    case 'event':
      return 'Behavior';
    case 'engagement':
      return 'Message';
    case 'form':
      return 'Form';
    case 'journey':
      return 'Journey';
  }
}
