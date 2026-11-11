'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Icon } from '@/components/ui/Icon';
import { BoardViewer } from '@/components/live/BoardViewer';
import { useAuth } from '@/hooks/useAuth';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Other { id: string; title: string; scheduledAt: string; durationMins: number; ready: boolean }
interface Page {
  id: string; title: string; scheduledAt: string; durationMins: number; status: string;
  cohort: { id: string; name: string }; teacher: string;
  viewer: { name: string; email: string };
  canDownload: boolean; external: string | null; ready: boolean;
  board: unknown[]; others: Other[];
}

const ROLE_BASE: Record<string, string> = { STUDENT: '/student', TEACHER: '/teacher', ADMIN: '/admin' };
const SPEEDS = [1, 1.25, 1.5, 2];
const clock = (s: number) => {
  if (!Number.isFinite(s)) return '0:00';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
const shortDay = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const posKey = (id: string) => `cpa:rec-pos:${id}`;

/**
 * Class recordings play here, inside the portal: our own controls with no Download, the link fetched only when
 * play is pressed (and short-lived), and the viewer's name drifting faintly over the picture.
 */
export function RecordingView() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const base = ROLE_BASE[user?.role ?? ''] ?? '/student';
  const [page, setPage] = useState<Page | null>(null);
  const [failed, setFailed] = useState('');

  useEffect(() => {
    setPage(null); setFailed('');
    api.get<Page>(`/live/classes/${classId}/recording-page`).then(r => setPage(r.data))
      .catch(e => setFailed(e?.response?.data?.message ?? 'Could not open this recording.'));
  }, [classId]);

  const back = page
    ? (base === '/student' ? `/student/cohorts?id=${page.cohort.id}` : base === '/teacher' ? `/teacher/cohorts/${page.cohort.id}` : '/admin/live')
    : `${base}/dashboard`;
  const backLabel = base === '/student' ? 'My cohorts' : base === '/teacher' ? 'Cohort' : 'Live classes';

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref={back} backLabel={`Back to ${backLabel}`} title="Class recording" />
      {failed ? (
        <div className="m-4 rounded-lg border border-line bg-white p-8 text-center lg:m-7">
          <p className="text-[15px] font-semibold text-navy">{failed}</p>
          <Link href={back} className="mt-4 inline-flex h-10 items-center rounded-md bg-[#3F6FE8] px-4 text-sm font-bold text-[#FFFFFF]">Back</Link>
        </div>
      ) : !page ? (
        <div className="grid gap-4 p-3.5 lg:grid-cols-[minmax(0,1fr)_280px] lg:p-6">
          <div className="aspect-video animate-pulse rounded-lg bg-subtle" /><div className="h-64 animate-pulse rounded-lg bg-subtle" />
        </div>
      ) : (
        <div className="grid items-start gap-4 p-3.5 lg:grid-cols-[minmax(0,1fr)_280px] lg:px-7 lg:py-6">
          <div className="flex min-w-0 flex-col gap-3">
            <div>
              <p className="text-[11.5px] font-extrabold uppercase tracking-[0.05em] text-azure-strong">Class recording</p>
              <h1 className="mt-0.5 text-[19px] font-extrabold text-navy lg:text-[22px]">{page.title}</h1>
              <p className="text-[12.5px] text-muted">{page.cohort.name} · {page.teacher} · {new Date(page.scheduledAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {page.durationMins} min</p>
            </div>
            {page.external ? (
              <div className="rounded-lg border border-line bg-white p-5">
                <p className="text-[14px] font-semibold text-navy">Your teacher shared this recording from another site.</p>
                <a href={page.external} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-10 items-center rounded-md bg-[#3F6FE8] px-4 text-sm font-bold text-[#FFFFFF]">Open the recording</a>
              </div>
            ) : <Player page={page} />}
            {!page.external && (
              <p className="flex items-center gap-2 text-[12px] text-muted">
                <Icon name="lock" size={14} line />{page.canDownload ? 'Students watch this here in the portal; they can’t download it.' : 'For students in this cohort, to watch here in the portal. Downloading and sharing aren’t allowed.'}
              </p>
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-3">
            {page.others.length > 0 && (
              <section className="overflow-hidden rounded-lg border border-line bg-white">
                <p className="border-b border-line px-3 py-[11px] text-[13px] font-extrabold text-navy"><span className="lg:hidden">More recordings</span><span className="hidden lg:inline">Recordings from this cohort</span></p>
                {page.others.map(o => {
                  const on = o.id === page.id;
                  const row = (
                    <>
                      <span className={clsx('grid h-[34px] w-[34px] shrink-0 place-items-center rounded-md', on ? 'bg-[#3F6FE8] text-[#FFFFFF]' : 'bg-subtle', !on && (o.ready ? 'text-azure-strong' : 'text-muted'))}>
                        <Icon name={o.ready || on ? 'play' : 'clockLine'} size={16} line />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className={clsx('block truncate text-[12.5px]', o.ready || on ? 'text-navy' : 'text-muted')}>{o.title}</strong>
                        <span className="text-[11px] text-muted">{shortDay(o.scheduledAt)} · {o.ready || on ? `${o.durationMins} min` : 'recording coming'}</span>
                      </span>
                      {on && <span className="text-[10.5px] font-extrabold text-azure-strong">Playing</span>}
                    </>
                  );
                  const cls = clsx('flex items-center gap-2.5 border-b border-line px-3 py-2.5 last:border-b-0', on && 'bg-accent-soft');
                  return o.ready && !on
                    ? <Link key={o.id} href={`${base}/recordings/${o.id}`} className={clsx(cls, 'hover:bg-subtle')}>{row}</Link>
                    : <div key={o.id} className={cls}>{row}</div>;
                })}
              </section>
            )}
            {page.board.length > 0 && (
              <section className="rounded-lg border border-line bg-white p-3">
                <p className="mb-2 text-[13px] font-extrabold text-navy">The whiteboard from this class</p>
                <BoardViewer elements={page.board} height={200} />
                <p className="mt-1.5 text-[11px] text-muted">As your teacher left it</p>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function Player({ page }: { page: Page }) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(page.durationMins * 60);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mark, setMark] = useState({ x: 12, y: 30 });
  const retried = useRef(false);

  // The watch link is asked for only now, and lasts about as long as the class
  const fetchLink = useCallback(async () => {
    const r = await api.get<{ url: string }>(`/live/classes/${page.id}/recording`);
    return r.data.url;
  }, [page.id]);

  async function start() {
    if (src) { video.current?.play(); return; }
    setLoading(true); setError('');
    try { setSrc(await fetchLink()); }
    catch (e: any) { setError(e?.response?.data?.message ?? 'Could not open the recording. Try again in a minute.'); }
    finally { setLoading(false); }
  }

  // Once the source is set, start playing from where this viewer stopped last time
  useEffect(() => {
    const v = video.current;
    if (!v || !src) return;
    const onMeta = () => {
      setLength(v.duration);
      let at = 0;
      try { at = Number(localStorage.getItem(posKey(page.id)) ?? 0); } catch { /* storage blocked */ }
      if (at > 3 && at < v.duration - 3) v.currentTime = at; // not if they'd reached the very end
      v.play().catch(() => {});
    };
    v.addEventListener('loadedmetadata', onMeta, { once: true });
    return () => v.removeEventListener('loadedmetadata', onMeta);
  }, [src, page.id]);

  // The name over the picture moves every few seconds, so it can't simply be cropped out
  useEffect(() => {
    const t = setInterval(() => setMark({ x: 5 + Math.random() * 45, y: 10 + Math.random() * 65 }), 7000);
    return () => clearInterval(t);
  }, []);

  // Remember where this viewer is
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => { try { localStorage.setItem(posKey(page.id), String(video.current?.currentTime ?? 0)); } catch { /* storage blocked */ } }, 5000);
    return () => clearInterval(t);
  }, [playing, page.id]);

  // A link that ran out mid-way (a long pause): get a fresh one and carry on from the same moment
  async function onError() {
    // Never started at all, even with a fresh link: the file itself is missing or blocked
    if (retried.current && (video.current?.currentTime ?? 0) === 0) {
      setSrc(null); setPlaying(false); retried.current = false;
      setError(page.canDownload ? 'This recording can’t be played: its link no longer works. Add the recording again from the class.' : 'This recording can’t be played right now. Let your teacher know so they can add it again.');
      return;
    }
    if (retried.current || !src) { setError('The recording stopped. Press play to try again.'); setPlaying(false); return; }
    retried.current = true;
    const at = video.current?.currentTime ?? 0;
    try { localStorage.setItem(posKey(page.id), String(at)); } catch { /* storage blocked */ }
    let fresh: string;
    try { fresh = await fetchLink(); } catch { setError('Could not reopen the recording.'); return; }
    // The same address again (a link pasted by the teacher, not a fresh Daily one): it's simply broken
    if (fresh === src) { await onError(); return; }
    setSrc(fresh);
  }

  const v = () => video.current;
  const toggle = () => { const x = v(); if (!x || !src) { start(); return; } if (x.paused) x.play(); else x.pause(); };
  const jump = (s: number) => { const x = v(); if (x) x.currentTime = Math.max(0, Math.min(x.duration || 0, x.currentTime + s)); };
  const nextSpeed = () => { const i = (SPEEDS.indexOf(speed) + 1) % SPEEDS.length; setSpeed(SPEEDS[i]); if (v()) v()!.playbackRate = SPEEDS[i]; };
  const full = () => { if (document.fullscreenElement) document.exitFullscreen(); else wrap.current?.requestFullscreen?.().catch(() => {}); };
  async function download() {
    try { window.open(await fetchLink(), '_blank', 'noopener'); } catch { notify.error('Could not get the recording'); }
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={wrap} onContextMenu={e => e.preventDefault()} tabIndex={0}
        onKeyDown={e => { if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); } else if (e.key === 'ArrowLeft') jump(-10); else if (e.key === 'ArrowRight') jump(10); }}
        className="keep-light group relative aspect-video w-full select-none overflow-hidden rounded-lg bg-[#0B1530] outline-none">
        {src && (
          <video ref={video} src={src} playsInline preload="metadata" disablePictureInPicture disableRemotePlayback
            controlsList="nodownload noremoteplayback noplaybackrate"
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
            onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onError={onError} onClick={toggle}
            className="h-full w-full bg-[#000000]" />
        )}
        {/* The viewer's name, faint, drifting across the picture */}
        {src && (
          <span aria-hidden className="pointer-events-none absolute whitespace-nowrap text-[12px] font-bold text-[#FFFFFF]/35 transition-all duration-[6000ms] ease-linear [text-shadow:0_0_2px_rgba(0,0,0,0.6)] lg:text-[14px]"
            style={{ left: `${mark.x}%`, top: `${mark.y}%`, transform: 'rotate(-12deg)' }}>
            {page.viewer.name}{page.viewer.email && page.viewer.email !== page.viewer.name ? ` · ${page.viewer.email}` : ''}
          </span>
        )}
        {!src && (
          <button type="button" onClick={start} disabled={loading} aria-label="Play the recording" className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,#16224A,#0B1530)]">
            <span className="flex flex-col items-center gap-3 px-6 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-[#3F6FE8] text-[#FFFFFF] shadow-lg">{loading ? <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Icon name="play" size={28} />}</span>
              <span className="text-[13px] text-[#B7C3E6]">{error || (page.ready ? 'Press play to watch' : 'The recording appears here a few minutes after class. Press play to check.')}</span>
            </span>
          </button>
        )}
        {src && (
          <div className={clsx('absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2.5 pt-8 text-[#FFFFFF] transition-opacity lg:px-4', playing ? 'opacity-0 group-hover:opacity-100 focus-within:opacity-100' : 'opacity-100')}>
            <input type="range" aria-label="Position" min={0} max={length || 0} step={1} value={Math.min(time, length || 0)}
              onChange={e => { const x = v(); if (x) x.currentTime = Number(e.target.value); }}
              className="h-1 w-full cursor-pointer accent-[#3F6FE8]" />
            <div className="mt-2 flex items-center gap-3 text-[12px] lg:gap-4">
              <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}><Icon name={playing ? 'pause' : 'play'} size={20} /></button>
              <button type="button" onClick={() => jump(-10)} aria-label="Back 10 seconds" className="text-[11px] font-bold">−10s</button>
              <button type="button" onClick={() => jump(10)} aria-label="Forward 10 seconds" className="hidden text-[11px] font-bold sm:block">+10s</button>
              <button type="button" onClick={() => { const x = v(); if (x) { x.muted = !x.muted; setMuted(x.muted); } }} aria-label={muted ? 'Unmute' : 'Mute'}><Icon name={muted ? 'volumeOff' : 'volume'} size={20} /></button>
              <span className="tabular-nums">{clock(time)} / {clock(length)}</span>
              <span className="flex-1" />
              <button type="button" onClick={nextSpeed} aria-label="Speed" className="rounded border border-white/50 px-1.5 py-0.5 font-bold">{speed}×</button>
              <button type="button" onClick={full} aria-label="Full screen"><Icon name="fullscreen" size={20} /></button>
            </div>
          </div>
        )}
      </div>
      {page.canDownload && (
        <div className="flex justify-end">
          <button type="button" onClick={download} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle">
            <Icon name="install" size={15} line />Download
          </button>
        </div>
      )}
    </div>
  );
}
