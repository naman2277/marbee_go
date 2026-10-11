import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import { SOCIAL_PLATFORMS, type SocialPost } from '@/lib/social-providers';

type Props = {
  posts: SocialPost[];
  onSelectPost: (post: SocialPost) => void;
  onNewPostDate: (date: Date) => void;
};

export function SocialCalendarView({ posts, onSelectPost, onNewPostDate }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 for Sunday
  const daysInMonth = lastDayOfMonth.getDate();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const monthName = currentDate.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  // Map posts by date string "YYYY-MM-DD"
  const postsByDate: Record<string, SocialPost[]> = {};
  for (const p of posts) {
    const dStr = p.scheduledAt || p.publishedAt || p.createdAt;
    if (dStr) {
      const d = new Date(dStr);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!postsByDate[key]) postsByDate[key] = [];
      postsByDate[key].push(p);
    }
  }

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyPrefix = Array.from({ length: startingDayOfWeek }, (_, i) => i);

  return (
    <Card className="overflow-hidden border-slate-200 bg-white">
      {/* Calendar Header */}
      <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:px-6">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold text-slate-900">{monthName}</h3>
          <Button variant="secondary" size="sm" onClick={goToToday}>
            Today
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={prevMonth}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 py-2.5">
        <span>Sun</span>
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100 text-xs">
        {/* Leading empty cells */}
        {emptyPrefix.map((_, i) => (
          <div key={`empty-${i}`} className="min-h-28 bg-slate-50/50 p-2" />
        ))}

        {/* Days of current month */}
        {daysArray.map((day) => {
          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayPosts = postsByDate[dateKey] ?? [];
          const isToday = dateKey === todayKey;

          return (
            <div
              key={day}
              className={`min-h-28 p-2 flex flex-col justify-between group transition hover:bg-slate-50/80 ${
                isToday ? 'bg-brand-50/20' : 'bg-white'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday
                        ? 'bg-brand-600 text-white shadow-xs'
                        : 'text-slate-700'
                    }`}
                  >
                    {day}
                  </span>
                  <button
                    type="button"
                    onClick={() => onNewPostDate(new Date(year, month, day, 10, 0))}
                    className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition"
                    title={`Schedule post for ${monthName} ${day}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Day posts list */}
                <div className="space-y-1">
                  {dayPosts.slice(0, 3).map((p) => {
                    const firstPlat = SOCIAL_PLATFORMS.find((x) => x.id === p.platforms[0]);
                    const isPub = p.status === 'published';

                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectPost(p)}
                        className="w-full text-left rounded-md border border-slate-200 bg-white p-1 shadow-2xs hover:border-brand-400 hover:shadow-xs transition block truncate"
                      >
                        <div className="flex items-center gap-1">
                          <span
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: firstPlat?.color ?? '#4f46e5' }}
                          />
                          <span className="font-medium text-[10px] text-slate-800 truncate">
                            {p.content}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {dayPosts.length > 3 && (
                    <span className="text-[10px] font-semibold text-slate-400 pl-1 block">
                      +{dayPosts.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
