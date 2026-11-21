import { useState } from 'react';
import {
  Send,
  Trash2,
  Edit2,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Card, Badge, Button } from '@/components/ui';
import { SOCIAL_PLATFORMS, type SocialPost } from '@/lib/social-providers';
import { AnimatedSocialIcon } from './AnimatedSocialIcon';

type Props = {
  post: SocialPost;
  onPublishNow: (id: string) => void;
  onEdit: (post: SocialPost) => void;
  onDelete: (id: string) => void;
  isPublishing?: boolean;
};

export function SocialPostCard({ post, onPublishNow, onEdit, onDelete, isPublishing }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isScheduled = post.status === 'scheduled';
  const isPublished = post.status === 'published';
  const isFailed = post.status === 'failed';

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow border-slate-200 bg-white">
      <div className="p-5 flex flex-col justify-between h-full space-y-4">
        {/* Top Meta Bar */}
        <div className="flex items-start justify-between gap-3">
          {/* Platforms */}
          <div className="flex flex-wrap items-center gap-1.5">
            {post.platforms.map((plat) => {
              const platInfo = SOCIAL_PLATFORMS.find((p) => p.id === plat);
              return (
                <span
                  key={plat}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 pl-1 pr-2.5 py-0.5 text-xs font-bold text-slate-800"
                >
                  <AnimatedSocialIcon platform={plat} size="sm" animated={false} className="h-5 w-5 p-0.5 rounded-full" />
                  {platInfo?.label ?? plat}
                </span>
              );
            })}
          </div>

          {/* Status Badge */}
          <Badge
            variant={
              isPublished
                ? 'success'
                : isScheduled
                ? 'warning'
                : isFailed
                ? 'error'
                : 'default'
            }
          >
            {isPublished
              ? 'Published'
              : isScheduled
              ? 'Scheduled'
              : isFailed
              ? 'Failed'
              : 'Draft'}
          </Badge>
        </div>

        {/* Post Content */}
        <div>
          <p
            className={`text-sm text-slate-800 leading-relaxed whitespace-pre-line ${
              expanded ? '' : 'line-clamp-3'
            }`}
          >
            {post.content}
          </p>
          {post.content.length > 180 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1 text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>

        {/* Media / Link Preview if present */}
        {post.mediaUrls.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            {post.mediaUrls.map((url, i) => (
              <div key={i} className="h-16 w-16 shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                <img src={url} alt="Media" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
              </div>
            ))}
          </div>
        )}

        {post.linkUrl && (
          <a
            href={post.linkUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-brand-600 hover:underline truncate bg-brand-50/50 p-2 rounded-lg border border-brand-100"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-medium">{post.linkUrl}</span>
          </a>
        )}

        {/* Error Alert if failed */}
        {post.errorMessage && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{post.errorMessage}</span>
          </div>
        )}

        {/* Bottom Time & Actions Bar */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            {isPublished ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>
                  Published {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </>
            ) : isScheduled ? (
              <>
                <Clock className="h-3.5 w-3.5 text-amber-600" />
                <span>
                  Scheduled for {post.scheduledAt ? new Date(post.scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </>
            ) : (
              <span>Created {new Date(post.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {!isPublished && (
              <Button
                variant="secondary"
                size="sm"
                disabled={isPublishing}
                onClick={() => onPublishNow(post.id)}
                title="Publish now"
              >
                <Send className="h-3.5 w-3.5 mr-1" />
                Publish
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(post)}
              title="Edit post"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(post.id)}
              title="Delete post"
              className="text-slate-400 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
