'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { WhiteboardPanel } from '@/components/live/WhiteboardPanel';
import { useAuth } from '@/hooks/useAuth';
import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';
import api from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Live class room — teacher (host) view.
 * Owner token: can mute/remove participants, cloud-record, use whiteboard.
 */
export default function TeacherLiveClassPage() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await api.patch(`/live/classes/${classId}/start`).catch(() => {});
        const res = await api.post<{ token: string; roomUrl: string }>(
          '/live/rooms/token',
          { liveClassId: classId },
        );
        setRoomUrl(`${res.data.roomUrl}?t=${res.data.token}`);
      } catch (err: any) {
        setError(err.response?.data?.message ?? 'Could not start class');
      } finally {
        setLoading(false);
      }
    })();
  }, [classId]);

  // Auto-open whiteboard when anyone starts screensharing; close when all stop
  useEffect(() => {
    const screenSharers = new Set<string>();

    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== 'object') return;

      if (e.data.action === 'participant-updated') {
        const p = e.data.participant;
        if (!p?.session_id) return;

        const wasSharing = screenSharers.has(p.session_id);
        const isSharing  = !!p.screen;

        if (isSharing && !wasSharing) {
          screenSharers.add(p.session_id);
          // Open whiteboard when screenshare starts
          setWhiteboardOpen(true);
          socketRef.current?.emit('whiteboard:toggle', { classId, open: true });
        } else if (!isSharing && wasSharing) {
          screenSharers.delete(p.session_id);
          // Close whiteboard only when no one is sharing anymore
          if (screenSharers.size === 0) {
            setWhiteboardOpen(false);
            socketRef.current?.emit('whiteboard:toggle', { classId, open: false });
          }
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [classId]);

  // Connect to whiteboard socket and broadcast toggle to students
  useEffect(() => {
    const token = Cookies.get('cpa_token');
    if (!token || !user) return;
    const socket = io(`${API_URL}/whiteboard`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
    });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('whiteboard:join', { classId }));
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [classId, user]);

  function toggleWhiteboard() {
    const next = !whiteboardOpen;
    setWhiteboardOpen(next);
    socketRef.current?.emit('whiteboard:toggle', { classId, open: next });
  }

  async function handleEndClass() {
    setConfirmEnd(true);
  }

  async function executeEndClass() {
    setConfirmEnd(false);
    setEnding(true);
    try {
      await api.patch(`/live/classes/${classId}/end`);
      window.location.href = '/teacher/live';
    } catch {
      setEnding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-navy gap-4">
        <Spinner size="lg" className="text-azure" />
        <p className="text-sm text-white/50">Starting class room…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6">
        <div className="w-full max-w-sm text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cloud mx-auto mb-4">
            <Icon name="live" size={28} className="text-azure" />
          </div>
          <h2 className="text-lg font-bold text-navy">Cannot start class</h2>
          <p className="mt-2 text-sm text-royal/60">{error}</p>
          <Link href="/teacher/live"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-cloud bg-white px-5 py-3 text-sm font-semibold text-navy hover:bg-cloud transition">
            <Icon name="arrowLeft" size={14} /> Back to Live Classes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-navy overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-azure flex-shrink-0">
            <span className="text-xs font-black text-white">C</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Live Class</span>
            <span className="flex items-center gap-1 rounded-full bg-azure/20 px-2 py-0.5 text-[10px] font-bold text-azure">
              <span className="h-1.5 w-1.5 rounded-full bg-azure animate-pulse" />
              HOST
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Audio-only toggle */}
          <button
            onClick={() => setAudioOnly(v => !v)}
            title="Audio-only mode saves data on slow connections"
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              audioOnly
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'border border-white/20 text-white/60 hover:text-white hover:border-white/40'
            }`}>
            <Icon name="wifi" size={13} />
            {audioOnly ? 'Audio only' : 'HD video'}
          </button>
          {/* Whiteboard toggle */}
          <button
            onClick={toggleWhiteboard}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              whiteboardOpen
                ? 'bg-azure text-white'
                : 'border border-white/20 text-white/60 hover:text-white hover:border-white/40'
            }`}
          >
            <Icon name="file" size={13} />
            {whiteboardOpen ? 'Close board' : 'Whiteboard'}
          </button>
          {/* End class */}
          <button
            onClick={handleEndClass}
            disabled={ending}
            className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-600 transition disabled:opacity-50">
            {ending
              ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <Icon name="close" size={12} />
            }
            End class
          </button>
        </div>
      </div>

      {/* Main content — video + optional whiteboard side panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Daily.co video (shrinks when whiteboard opens) */}
        <div className={`flex-1 min-w-0 transition-all duration-300 ${whiteboardOpen ? 'w-[60%]' : 'w-full'}`}>
          <iframe
            src={audioOnly ? `${roomUrl}&startVideoOff=true` : roomUrl!}
            allow="camera; microphone; fullscreen; speaker; display-capture"
            className="h-full w-full border-0"
            title="Live class (host)"
          />
        </div>

        {/* Whiteboard panel (slides in from right) */}
        {whiteboardOpen && user && (
          <div className="w-[40%] min-w-[320px] flex-shrink-0 border-l border-white/10">
            <WhiteboardPanel
              classId={classId}
              isTeacher={true}
              userId={user.id}
            />
          </div>
        )}
      </div>

      {/* Confirm end class */}
      {confirmEnd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-sm font-bold text-navy mb-1">End class?</p>
            <p className="text-xs text-royal/60 mb-5">All participants will be disconnected immediately.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={executeEndClass} loading={ending}>End class</Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirmEnd(false)}>Stay in class</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
