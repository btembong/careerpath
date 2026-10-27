'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/components/ui/Icon';
import { WhiteboardPanel } from '@/components/live/WhiteboardPanel';
import { useAuth } from '@/hooks/useAuth';
import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';
import api from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ClassInfo {
  id: string;
  title: string;
  scheduledAt: string;
  durationMins?: number;
  cohort?: { id: string; name: string };
}

export default function StudentLiveClassPage() {
  const { classId } = useParams<{ classId: string }>();
  const { user }    = useAuth();
  const router      = useRouter();
  const iframeRef   = useRef<HTMLIFrameElement>(null);
  const socketRef   = useRef<Socket | null>(null);
  const joinedRef   = useRef(false);

  const [roomUrl,        setRoomUrl]        = useState<string | null>(null);
  const [classInfo,      setClassInfo]      = useState<ClassInfo | null>(null);
  const [error,          setError]          = useState<string | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [canDraw,        setCanDraw]        = useState(false);
  const [wbBanner,       setWbBanner]       = useState(false);   // brief "Whiteboard opened" banner
  const [socketStatus,   setSocketStatus]   = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [leaving,        setLeaving]        = useState(false);
  // Mobile: whiteboard shown as overlay/panel below video
  const [mobileWbOpen,   setMobileWbOpen]   = useState(false);

  // ── Fetch token + class info ───────────────────────────
  useEffect(() => {
    Promise.all([
      api.post<{ token: string; roomUrl: string }>('/live/rooms/token', { liveClassId: classId }),
      api.get<ClassInfo>(`/live/classes/${classId}`).catch(() => ({ data: null })),
    ])
      .then(([tokenRes, infoRes]) => {
        setRoomUrl(`${tokenRes.data.roomUrl}?t=${tokenRes.data.token}`);
        if (infoRes.data) setClassInfo(infoRes.data);
      })
      .catch(err => setError(err.response?.data?.message ?? 'Unable to join class. Check your enrollment.'))
      .finally(() => setLoading(false));
  }, [classId]);

  // ── Leave handler ──────────────────────────────────────
  const leaveClass = useCallback(async () => {
    setLeaving(true);
    if (joinedRef.current) {
      await api.patch(`/live/classes/${classId}/leave`).catch(() => {});
      joinedRef.current = false;
    }
    router.push('/student/live');
  }, [classId, router]);

  // ── Whiteboard socket ──────────────────────────────────
  useEffect(() => {
    const token = Cookies.get('cpa_token');
    if (!token || !user) return;

    const socket = io(`${API_URL}/whiteboard`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on('connect',    () => { setSocketStatus('connected'); socket.emit('whiteboard:join', { classId }); });
    socket.on('disconnect', () => setSocketStatus('disconnected'));
    socket.on('reconnect',  () => setSocketStatus('connected'));

    socket.on('whiteboard:toggle', (data: { open: boolean }) => {
      setWhiteboardOpen(data.open);
      if (data.open) { setWbBanner(true); setTimeout(() => setWbBanner(false), 4000); }
    });

    socket.on('whiteboard:permission', (data: { studentId: string; canDraw: boolean }) => {
      if (data.studentId === user.id) setCanDraw(data.canDraw);
    });

    socket.on('whiteboard:state', (data: { open: boolean; canDraw: boolean }) => {
      setWhiteboardOpen(data.open);
      setCanDraw(data.canDraw);
    });

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [classId, user]);

  // ── Daily.co postMessage ───────────────────────────────
  useEffect(() => {
    const screenSharers = new Set<string>();

    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== 'object') return;

      if (e.data.action === 'joined-meeting' && !joinedRef.current) {
        joinedRef.current = true;
        api.post(`/live/classes/${classId}/attend`).catch(() => {});
      }
      if (e.data.action === 'left-meeting' || e.data.action === 'meeting-error') {
        if (joinedRef.current) {
          joinedRef.current = false;
          api.patch(`/live/classes/${classId}/leave`).catch(() => {});
        }
      }

      if (e.data.action === 'participant-updated') {
        const p = e.data.participant;
        if (!p?.session_id) return;
        const wasSharing = screenSharers.has(p.session_id);
        const isSharing  = !!p.screen;
        if (isSharing && !wasSharing) {
          screenSharers.add(p.session_id);
          setWhiteboardOpen(true);
          setWbBanner(true); setTimeout(() => setWbBanner(false), 4000);
        } else if (!isSharing && wasSharing) {
          screenSharers.delete(p.session_id);
          if (screenSharers.size === 0) setWhiteboardOpen(false);
        }
      }
    }

    function handleUnload() {
      if (joinedRef.current) api.patch(`/live/classes/${classId}/leave`).catch(() => {});
    }

    window.addEventListener('message', handleMessage);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('beforeunload', handleUnload);
      if (joinedRef.current) {
        api.patch(`/live/classes/${classId}/leave`).catch(() => {});
        joinedRef.current = false;
      }
    };
  }, [classId]);

  // ── Loading ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-navy gap-4">
        <Spinner size="lg" className="text-azure" />
        <p className="text-sm text-white/50">Connecting to class room…</p>
        {classInfo && (
          <p className="text-xs text-white/30">{classInfo.title}</p>
        )}
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6">
        <div className="w-full max-w-sm text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cloud mx-auto mb-4">
            <Icon name="live" size={28} className="text-azure" />
          </div>
          <h2 className="text-lg font-bold text-navy">Cannot join class</h2>
          <p className="mt-2 text-sm text-royal/60">{error}</p>
          <Link href="/student/live"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-cloud bg-white px-5 py-3 text-sm font-semibold text-navy hover:bg-cloud transition">
            <Icon name="arrowLeft" size={14} /> Back to live classes
          </Link>
        </div>
      </div>
    );
  }

  // ── Room ───────────────────────────────────────────────
  return (
    <div className="h-screen w-screen flex flex-col bg-navy overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 flex-shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-azure">
            <span className="text-xs font-black text-white">C</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">
              {classInfo?.title ?? 'Live Class'}
            </p>
            {classInfo?.cohort && (
              <p className="text-[10px] text-white/40 truncate leading-tight">{classInfo.cohort.name}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Socket status — only show when degraded */}
          {socketStatus === 'disconnected' && (
            <span className="flex items-center gap-1 rounded-lg bg-red-500/20 border border-red-500/30 px-2 py-1 text-[10px] font-semibold text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Reconnecting…
            </span>
          )}

          {/* Whiteboard status pill (desktop) */}
          {whiteboardOpen && (
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-azure font-semibold">
              <Icon name="file" size={12} />
              Whiteboard
              {canDraw && <span className="text-white/40">· You can draw</span>}
            </span>
          )}

          {/* Mobile whiteboard toggle */}
          {whiteboardOpen && (
            <button
              onClick={() => setMobileWbOpen(v => !v)}
              className={`sm:hidden flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold border transition ${
                mobileWbOpen
                  ? 'bg-azure/20 border-azure/40 text-azure'
                  : 'border-white/10 text-white/50 hover:text-white/80'
              }`}>
              <Icon name="file" size={12} />
              {mobileWbOpen ? 'Hide board' : 'Show board'}
            </button>
          )}

          {/* Leave button */}
          <button
            onClick={leaveClass}
            disabled={leaving}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/20 border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/30 transition disabled:opacity-50">
            <Icon name="close" size={12} />
            {leaving ? 'Leaving…' : 'Leave'}
          </button>
        </div>
      </div>

      {/* Whiteboard-opened banner */}
      {wbBanner && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 bg-azure/10 border-b border-azure/20 px-4 py-2">
          <Icon name="file" size={13} className="text-azure" />
          <p className="text-xs font-semibold text-azure">
            Whiteboard {canDraw ? '— you can draw on it' : 'opened by teacher'}
          </p>
        </div>
      )}

      {/* Desktop layout: side-by-side */}
      <div className="hidden sm:flex flex-1 overflow-hidden">
        <div className={`flex-1 min-w-0 transition-all duration-300 ${whiteboardOpen ? 'basis-[60%]' : 'w-full'}`}>
          <iframe
            ref={iframeRef}
            src={roomUrl!}
            allow="camera; microphone; fullscreen; speaker; display-capture"
            className="h-full w-full border-0"
            title="Live class"
          />
        </div>
        {whiteboardOpen && user && (
          <div className="basis-[40%] min-w-[280px] max-w-[520px] flex-shrink-0 border-l border-white/10">
            <WhiteboardPanel classId={classId} isTeacher={false} userId={user.id} />
          </div>
        )}
      </div>

      {/* Mobile layout: stacked */}
      <div className="sm:hidden flex flex-col flex-1 overflow-hidden">
        <div className={`flex-shrink-0 transition-all duration-300 ${mobileWbOpen && whiteboardOpen ? 'h-[50%]' : 'flex-1'}`}>
          <iframe
            ref={iframeRef}
            src={roomUrl!}
            allow="camera; microphone; fullscreen; speaker; display-capture"
            className="h-full w-full border-0"
            title="Live class"
          />
        </div>
        {whiteboardOpen && mobileWbOpen && user && (
          <div className="flex-1 border-t border-white/10 overflow-hidden">
            <WhiteboardPanel classId={classId} isTeacher={false} userId={user.id} />
          </div>
        )}
      </div>

    </div>
  );
}
