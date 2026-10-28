'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { NoSkipVideoPlayer } from '@/components/onboarding/NoSkipVideoPlayer';
import api from '@/lib/api';

interface OnboardingVideo {
  required: boolean;
  video: { id: string; title: string; videoUrl: string; captionsUrl: string | null } | null;
  progress: { maxWatchedSec: number; completed: boolean } | null;
}

export default function TeacherWelcomePage() {
  const router = useRouter();
  const [data, setData] = useState<OnboardingVideo | null>(null);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/onboarding-video/me')
      .then(r => {
        if (!r.data?.required) { router.replace('/teacher/dashboard'); return; }
        setData(r.data);
      })
      .catch(() => setError('Could not load the welcome video. Please refresh the page.'));
  }, [router]);

  const onReport = useCallback(async (positionSec: number, durationSec: number) => {
    const { data: r } = await api.post('/onboarding-video/progress', { videoId: data!.video!.id, positionSec, durationSec });
    return r as { maxWatchedSec: number; completed: boolean };
  }, [data]);

  const onCompleted = useCallback(() => setCompleted(true), []);

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur mb-4">
            <Icon name="play" size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-white mb-1">{data?.video?.title ?? 'Welcome to CareerPath Africa'}</h1>
          <p className="text-white/50 text-sm max-w-lg mx-auto">
            Watch this short orientation before you start teaching. You can pause or rewind, but not skip ahead.
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-5 sm:p-6 space-y-5">
          {error && <p role="alert" className="rounded-xl bg-red-50 border border-red-100 px-3.5 py-2.5 text-xs text-red-600">{error}</p>}

          {!data?.video ? (
            !error && <div className="aspect-video rounded-2xl bg-cloud animate-pulse" />
          ) : (
            <NoSkipVideoPlayer
              src={data.video.videoUrl}
              captionsUrl={data.video.captionsUrl}
              initialMaxSec={data.progress?.maxWatchedSec ?? 0}
              onReport={onReport}
              onCompleted={onCompleted}
            />
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-cloud">
            <p className="text-xs text-royal/50 flex items-center gap-1.5">
              <Icon name={completed ? 'check' : 'lock'} size={13} className={completed ? 'text-emerald-600' : 'text-royal/40'} />
              {completed ? 'All done — your teacher dashboard is unlocked.' : 'Continue unlocks when the video finishes.'}
            </p>
            <Button disabled={!completed} onClick={() => router.replace('/teacher/dashboard')}>
              Continue to dashboard <Icon name="arrowRight" size={13} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
