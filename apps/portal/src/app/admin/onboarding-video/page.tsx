'use client';
import { useEffect, useRef, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { notify } from '@/lib/notify';
import { uploadVideo } from '@/lib/uploadVideo';
import api from '@/lib/api';

interface AdminVideo {
  video: {
    title: string; videoUrl: string; previewUrl: string; captionsUrl: string | null;
    durationSec: number | null; version: number; isActive: boolean; updatedAt: string;
  } | null;
  stats: { teachers: number; completed: number };
}

/** Read a local video file's duration so the server knows the true length. */
function readDuration(file: File): Promise<number | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(v.duration) ? Math.round(v.duration) : null); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    v.src = url;
  });
}

function fmtDuration(s: number | null) {
  if (!s) return '—';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function AdminOnboardingVideoPage() {
  const videoInput = useRef<HTMLInputElement>(null);
  const captionsInput = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<AdminVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('Welcome to CareerPath Africa');
  const [videoUrl, setVideoUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [captionsUrl, setCaptionsUrl] = useState('');
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [requireRewatch, setRequireRewatch] = useState(false);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [captionsUploading, setCaptionsUploading] = useState(false);

  function load() {
    return api.get('/onboarding-video/admin').then(r => {
      const d: AdminVideo = r.data;
      setData(d);
      if (d.video) {
        setTitle(d.video.title);
        setVideoUrl(d.video.videoUrl);
        setPreviewUrl(d.video.previewUrl);
        setCaptionsUrl(d.video.captionsUrl ?? '');
        setDurationSec(d.video.durationSec);
        setIsActive(d.video.isActive);
      }
    });
  }

  useEffect(() => {
    load().catch(() => notify.error('Could not load the welcome video settings')).finally(() => setLoading(false));
  }, []);

  async function onVideoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 500 * 1024 * 1024) { notify.error('Video must be 500 MB or smaller'); return; }
    setVideoProgress(0);
    try {
      const [url, duration] = await Promise.all([uploadVideo(file, setVideoProgress), readDuration(file)]);
      setVideoUrl(url);
      setPreviewUrl(URL.createObjectURL(file));
      setDurationSec(duration);
      if (data?.video) setRequireRewatch(true); // new file → usually everyone should see it
      notify.success('Video uploaded — save to publish it');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? err?.message ?? 'Upload failed');
    } finally {
      setVideoProgress(null);
      if (videoInput.current) videoInput.current.value = '';
    }
  }

  async function onCaptionsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setCaptionsUploading(true);
    try {
      setCaptionsUrl(await uploadVideo(file));
      notify.success('Captions uploaded — save to publish them');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? err?.message ?? 'Captions upload failed');
    } finally {
      setCaptionsUploading(false);
      if (captionsInput.current) captionsInput.current.value = '';
    }
  }

  async function save() {
    if (!videoUrl) { notify.error('Upload a video first'); return; }
    setSaving(true);
    try {
      await api.put('/onboarding-video/admin', {
        title: title.trim(),
        videoUrl,
        captionsUrl: captionsUrl || null,
        durationSec: durationSec ?? undefined,
        isActive,
        requireRewatch,
      });
      setRequireRewatch(false);
      await load();
      notify.success(isActive ? 'Welcome video published' : 'Saved — the video is switched off');
    } catch (err: any) {
      const m = err?.response?.data?.message;
      notify.error(Array.isArray(m) ? m.join(' · ') : m ?? 'Failed to save');
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="p-6 space-y-4"><SkeletonCard lines={3} /><SkeletonCard lines={8} /></div>
    </div>
  );

  const v = data?.video;
  const pct = data && data.stats.teachers ? Math.round((data.stats.completed / data.stats.teachers) * 100) : 0;

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Teacher Welcome Video" subtitle="Required orientation every teacher watches before using the portal" />

      <div className="flex-1 p-4 sm:p-6 space-y-5 max-w-4xl w-full">
        {/* Status */}
        <Card padding="md">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40">Status</p>
              <p className={`text-sm font-bold mt-0.5 ${v?.isActive ? 'text-emerald-600' : 'text-royal/50'}`}>
                {!v ? 'Not set up' : v.isActive ? `Active · version ${v.version}` : 'Switched off'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40">Length</p>
              <p className="text-sm font-bold text-navy mt-0.5">{fmtDuration(v?.durationSec ?? null)}</p>
            </div>
            {v && (
              <div className="flex-1 min-w-[200px]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40">Watched this version</p>
                <p className="text-sm font-bold text-navy mt-0.5">{data!.stats.completed} of {data!.stats.teachers} approved teachers</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-cloud overflow-hidden">
                  <div className="h-full bg-azure" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Editor */}
        <Card padding="md" className="space-y-5">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-navy">Title shown to teachers</span>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input-base" maxLength={120} />
          </label>

          <div className="space-y-2">
            <span className="text-xs font-semibold text-navy">Video</span>
            {previewUrl && (
              <video src={previewUrl} controls preload="metadata" className="w-full aspect-video rounded-xl bg-black object-contain" />
            )}
            <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" onChange={onVideoFile} />
            <button type="button" onClick={() => videoInput.current?.click()} disabled={videoProgress !== null}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-cloud p-4 text-left text-sm text-royal/60 hover:border-azure/40 transition disabled:opacity-60">
              <Icon name="upload" size={18} className="text-azure" />
              <span className="flex-1">
                {videoProgress !== null ? `Uploading… ${videoProgress}%` : previewUrl ? 'Replace video' : 'Upload video'}
                <span className="block text-[11px] text-royal/40">MP4, MOV or WebM · up to 500 MB · 3–5 minutes recommended</span>
              </span>
            </button>
            {videoProgress !== null && (
              <div className="h-1.5 rounded-full bg-cloud overflow-hidden">
                <div className="h-full bg-azure transition-all" style={{ width: `${videoProgress}%` }} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold text-navy">Captions <span className="font-normal text-royal/40">(optional, .vtt)</span></span>
            <input ref={captionsInput} type="file" accept=".vtt,text/vtt" className="sr-only" onChange={onCaptionsFile} />
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" loading={captionsUploading} onClick={() => captionsInput.current?.click()}>
                <Icon name="upload" size={13} /> {captionsUrl ? 'Replace captions' : 'Upload captions'}
              </Button>
              {captionsUrl && (
                <>
                  <span className="text-xs text-emerald-600 flex items-center gap-1"><Icon name="check" size={12} /> Captions attached</span>
                  <Button variant="ghost" size="sm" onClick={() => setCaptionsUrl('')}>Remove</Button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-xl bg-surface border border-cloud p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-azure" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
              <span className="text-xs text-navy/80 leading-relaxed">
                <strong className="text-navy">Show this video to teachers.</strong> Teachers who haven’t watched it are sent to it before
                they can use the portal. Switch off to pause the requirement.
              </span>
            </label>
            {v && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-azure" checked={requireRewatch} onChange={e => setRequireRewatch(e.target.checked)} />
                <span className="text-xs text-navy/80 leading-relaxed">
                  <strong className="text-navy">Make every teacher watch again</strong> (publishes version {v.version + 1}).
                  Use this when the content has changed; leave it off for small fixes like a typo in the title.
                </span>
              </label>
            )}
          </div>

          <div className="flex justify-end">
            <Button loading={saving} disabled={videoProgress !== null || captionsUploading || !videoUrl || title.trim().length < 3} onClick={save}>
              Save
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
