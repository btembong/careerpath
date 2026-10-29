'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import { WhiteboardPanel } from '@/components/live/WhiteboardPanel';
import { useAuth } from '@/hooks/useAuth';
import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';
import api from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ClassInfo {
  id: string; title: string; description: string | null; scheduledAt: string; durationMins: number;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'; recordingUrl: string | null;
  cohort: { id: string; name: string; students: number }; teacher: string; inClass: number;
}

const time = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function StudentLiveClassPage() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const joinedRef = useRef(false);

  const [info, setInfo] = useState<ClassInfo | null>(null);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [canDraw, setCanDraw] = useState(false);
  const [wbBanner, setWbBanner] = useState(false);
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [leaving, setLeaving] = useState(false);
  const [mobileWbOpen, setMobileWbOpen] = useState(false);

  // Class details; while waiting for the teacher, check again every 15 seconds
  useEffect(() => {
    let stop = false;
    async function check() {
      try {
        const r = await api.get<ClassInfo>(`/live/classes/${classId}/info`);
        if (stop) return;
        setInfo(r.data);
        if (r.data.status === 'ACTIVE' && !roomUrl) {
          const t = await api.post<{ token: string; roomUrl: string }>('/live/rooms/token', { liveClassId: classId });
          if (!stop) setRoomUrl(`${t.data.roomUrl}?t=${t.data.token}`);
        }
      } catch (err: any) {
        if (!stop) setError(err?.response?.data?.message ?? 'You can’t join this class. Check that you’re in its cohort and your package is active.');
      }
    }
    check();
    const iv = setInterval(() => { if (!roomUrl) check(); }, 15_000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { stop = true; clearInterval(iv); clearInterval(clock); };
  }, [classId, roomUrl]);

  const leaveClass = useCallback(async () => {
    setLeaving(true);
    if (joinedRef.current) {
      await api.patch(`/live/classes/${classId}/leave`).catch(() => {});
      joinedRef.current = false;
    }
    router.push('/student/live');
  }, [classId, router]);

  // Whiteboard socket
  useEffect(() => {
    const token = Cookies.get('cpa_token');
    if (!token || !user || !roomUrl) return;
    const socket = io(`${API_URL}/whiteboard`, { path: '/socket.io', transports: ['websocket'], auth: { token }, reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 2000 });
    socketRef.current = socket;
    socket.on('connect', () => { setSocketStatus('connected'); socket.emit('whiteboard:join', { classId }); });
    socket.on('disconnect', () => setSocketStatus('disconnected'));
    socket.on('reconnect', () => setSocketStatus('connected'));
    socket.on('whiteboard:toggle', (data: { open: boolean }) => {
      setWhiteboardOpen(data.open);
      if (data.open) { setWbBanner(true); setTimeout(() => setWbBanner(false), 4000); }
    });
    socket.on('whiteboard:permission', (data: { studentId: string; canDraw: boolean }) => { if (data.studentId === user.id) setCanDraw(data.canDraw); });
    socket.on('whiteboard:state', (data: { open: boolean; canDraw: boolean }) => { setWhiteboardOpen(data.open); setCanDraw(data.canDraw); });
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [classId, user, roomUrl]);

  // Attendance from the video room's messages
  useEffect(() => {
    const screenSharers = new Set<string>();
    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.action === 'joined-meeting' && !joinedRef.current) {
        joinedRef.current = true;
        api.post(`/live/classes/${classId}/attend`).catch(() => {});
      }
      if ((e.data.action === 'left-meeting' || e.data.action === 'meeting-error') && joinedRef.current) {
        joinedRef.current = false;
        api.patch(`/live/classes/${classId}/leave`).catch(() => {});
      }
      if (e.data.action === 'participant-updated') {
        const p = e.data.participant;
        if (!p?.session_id) return;
        const was = screenSharers.has(p.session_id), is = !!p.screen;
        if (is && !was) { screenSharers.add(p.session_id); setWhiteboardOpen(true); setWbBanner(true); setTimeout(() => setWbBanner(false), 4000); }
        else if (!is && was) { screenSharers.delete(p.session_id); if (!screenSharers.size) setWhiteboardOpen(false); }
      }
    }
    function handleUnload() { if (joinedRef.current) api.patch(`/live/classes/${classId}/leave`).catch(() => {}); }
    window.addEventListener('message', handleMessage);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('beforeunload', handleUnload);
      if (joinedRef.current) { api.patch(`/live/classes/${classId}/leave`).catch(() => {}); joinedRef.current = false; }
    };
  }, [classId]);

  if (error) return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6">
      <div className="w-full max-w-sm rounded-lg border border-line bg-white p-8 text-center">
        <p className="text-lg font-bold text-navy">You can’t join this class</p>
        <p className="mt-2 text-[13.5px] text-ink2">{error}</p>
        <Link href="/student/live" className="mt-5 inline-flex h-9 items-center rounded-md border border-line px-4 text-[13.5px] font-semibold text-navy hover:bg-subtle">Back to live classes</Link>
      </div>
    </div>
  );

  const start = info ? new Date(info.scheduledAt).getTime() : 0;
  const mins = Math.ceil((start - now) / 60_000);
  const live = !!roomUrl;
  const elapsed = live && info ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
  const ended = info?.status === 'COMPLETED' || info?.status === 'CANCELLED';
  const lobbyTitle = !info ? 'Getting the class ready…'
    : info.status === 'CANCELLED' ? 'This class was cancelled'
    : info.status === 'COMPLETED' ? 'This class has ended'
    : mins > 60 ? `Class starts at ${time(info.scheduledAt)}`
    : mins > 0 ? `Class starts in ${mins} minute${mins === 1 ? '' : 's'}`
    : 'Waiting for the teacher to start';

  const video = (cls: string) => (
    <iframe src={roomUrl!} allow="camera; microphone; fullscreen; speaker; display-capture" className={clsx('h-full w-full border-0', cls)} title="Live class" />
  );

  return (
    <div className="flex h-screen w-full min-w-0 flex-col overflow-hidden bg-surface">
      <header className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-2.5 sm:px-6">
        <Link href="/student/live" aria-label="Back to live classes" className="flex h-[38px] w-[38px] items-center justify-center rounded-md border border-line text-ink2 hover:bg-subtle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-navy">{info?.title ?? 'Live class'}</p>
          {info && <p className="truncate text-[12.5px] text-muted">{info.cohort.name} · {info.teacher}</p>}
        </div>
        {socketStatus === 'disconnected' && live && <span className="text-xs font-semibold text-muted">Reconnecting the whiteboard…</span>}
        {whiteboardOpen && live && (
          <button type="button" onClick={() => setMobileWbOpen(v => !v)} className="h-8 rounded-md border border-line px-2.5 text-xs font-semibold text-navy sm:hidden">
            {mobileWbOpen ? 'Hide board' : 'Show board'}
          </button>
        )}
        {info && (
          <span className={clsx('inline-flex h-[26px] items-center gap-1.5 rounded px-2.5 text-xs font-bold', live ? 'bg-azure-strong text-on-accent' : 'bg-accent-soft text-navy')}>
            {live && <span className="h-[7px] w-[7px] rounded-full bg-white" />}
            {live ? `Live · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : ended ? (info.status === 'CANCELLED' ? 'Cancelled' : 'Ended') : `Starts ${time(info.scheduledAt)}`}
          </span>
        )}
        {live && (
          <button type="button" onClick={leaveClass} disabled={leaving} className="h-9 rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50">
            {leaving ? 'Leaving…' : 'Leave class'}
          </button>
        )}
      </header>

      {wbBanner && live && (
        <p className="flex-shrink-0 border-b border-line bg-accent-soft px-4 py-2 text-center text-xs font-semibold text-navy">
          The whiteboard is open{canDraw ? ' — you can draw on it' : ''}
        </p>
      )}

      <div className="flex min-h-0 flex-1 gap-5 p-3 sm:p-5">
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-white">
          {live ? <>
            <div className="hidden min-h-0 flex-1 sm:flex">
              <div className="min-w-0 flex-1">{video('')}</div>
              {whiteboardOpen && user && (
                <div className="min-w-[280px] max-w-[520px] basis-[40%] border-l border-line"><WhiteboardPanel classId={classId} isTeacher={false} userId={user.id} /></div>
              )}
            </div>
            <div className="flex min-h-0 flex-1 flex-col sm:hidden">
              <div className={clsx(mobileWbOpen && whiteboardOpen ? 'h-1/2 flex-shrink-0' : 'flex-1')}>{video('')}</div>
              {whiteboardOpen && mobileWbOpen && user && <div className="flex-1 border-t border-line"><WhiteboardPanel classId={classId} isTeacher={false} userId={user.id} /></div>}
            </div>
          </> : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3.5 p-8 text-center">
              <span className="flex h-[60px] w-[60px] items-center justify-center rounded-[10px] bg-accent-soft text-azure-strong">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 10l5-3v10l-5-3M3 6h12v12H3z" /></svg>
              </span>
              <p className="text-[22px] font-extrabold text-navy">{lobbyTitle}</p>
              {info && !ended && (
                <>
                  <p className="max-w-[440px] text-sm text-ink2">The room opens when {info.teacher} starts the class. Stay on this page — it opens by itself.</p>
                  <p className="mt-1 flex items-center gap-2 text-[13px] text-muted" aria-live="polite">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-azure-strong" /> Checking every few seconds
                  </p>
                </>
              )}
              {info?.status === 'COMPLETED' && (info.recordingUrl
                ? <a href={info.recordingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-md bg-azure-strong px-4 text-[13.5px] font-semibold text-on-accent">Watch the recording</a>
                : <p className="text-sm text-ink2">The recording will appear on your live classes page once the teacher adds it.</p>)}
            </div>
          )}
        </section>

        {(!live || !whiteboardOpen) && info && (
          <aside className="hidden w-[300px] flex-shrink-0 flex-col gap-4 overflow-y-auto lg:flex">
            <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-white p-[18px]">
              <h3 className="text-[15px] font-semibold text-navy">This class</h3>
              <dl className="grid grid-cols-2 overflow-hidden rounded-md border border-line">
                {[['Starts', time(info.scheduledAt)], ['Length', `${info.durationMins} min`], ['In class', live || info.inClass ? `${info.inClass} of ${info.cohort.students}` : `${info.cohort.students} in cohort`], ['Recording', info.recordingUrl ? 'Available' : 'Added later']].map(([l, v]) => (
                  <div key={l} className="-mb-px -mr-px border-b border-r border-line px-3 py-2">
                    <dt className="text-[11.5px] text-muted">{l}</dt>
                    <dd className="mt-0.5 text-[13.5px] font-semibold text-navy">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {info.description && (
              <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-[18px]">
                <h3 className="text-[15px] font-semibold text-navy">What we’ll cover</h3>
                <p className="text-[13.5px] leading-relaxed text-ink2">{info.description}</p>
              </section>
            )}
            <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-[18px]">
              <h3 className="text-[15px] font-semibold text-navy">If the video struggles</h3>
              <ul className="list-disc space-y-1.5 pl-[18px] text-[13px] text-ink2">
                <li>Turn your camera off first; audio uses far less data.</li>
                <li>Close other apps that use data.</li>
                <li>Still stuck? Leave and join again — your attendance is kept.</li>
              </ul>
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}
