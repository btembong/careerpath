'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';

interface Entry { rank: number; id: string; name: string; avatarUrl?: string; xpTotal: number; streak: number }

export default function LeaderboardPage() {
  const params = useSearchParams();
  const cohortId = params.get('cohortId') ?? '';
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cohortId) { setLoading(false); return; }
    api.get(`/gamification/leaderboard/${cohortId}`).then(r => setEntries(r.data)).finally(() => setLoading(false));
  }, [cohortId]);

  return (
    <div className="flex flex-col min-h-full bg-surface">
      <Topbar title="Cohort Leaderboard" backHref="/student/dashboard" />
      <div className="flex-1 p-4 max-w-xl mx-auto w-full">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="flex items-center gap-4 bg-white rounded-xl border border-cloud p-4">
                <div className="w-8 h-8 rounded-full bg-cloud animate-pulse flex-shrink-0" />
                <div className="w-10 h-10 rounded-full bg-cloud animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 bg-cloud rounded animate-pulse" />
                  <div className="h-2.5 w-20 bg-cloud/60 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : !cohortId ? (
          <p className="text-center text-royal/40 text-sm py-20">No cohort selected.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {entries.map(e => (
              <div key={e.id} className={`flex items-center gap-4 bg-white rounded-xl border p-4 ${e.rank <= 3 ? 'border-azure/30' : 'border-cloud'}`}>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${e.rank === 1 ? 'bg-yellow-400 text-white' : e.rank === 2 ? 'bg-gray-300 text-white' : e.rank === 3 ? 'bg-amber-600 text-white' : 'bg-cloud text-royal/40'}`}>
                  {e.rank}
                </span>
                <Avatar name={e.name} src={e.avatarUrl} size="sm" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-navy">{e.name}</p>
                  <div className="flex items-center gap-2 text-xs text-royal/40">
                    <span>{e.xpTotal} XP</span>
                    {e.streak > 0 && (
                      <span className="flex items-center gap-1">
                        · <Icon name="live" size={11} className="text-azure" /> {e.streak}d streak
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!entries.length && <p className="text-center text-royal/40 py-10">No students yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
