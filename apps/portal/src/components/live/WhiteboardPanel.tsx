'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';

// Excalidraw has no SSR support — must be dynamically imported
const Excalidraw = dynamic(
  () => import('@excalidraw/excalidraw').then(m => m.Excalidraw),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center bg-[#121212] text-white/30 text-sm">Loading whiteboard…</div> },
);

interface Props {
  classId: string;
  isTeacher: boolean;
  userId: string;
}

interface WhiteboardState {
  elements: any[];
  appState: Record<string, any>;
  open: boolean;
  canDraw: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const WS_PATH = '/whiteboard';

export function WhiteboardPanel({ classId, isTeacher, userId }: Props) {
  const socketRef = useRef<Socket | null>(null);
  const excalidrawRef = useRef<any>(null);
  const isBroadcasting = useRef(false); // prevent echo loop
  const [connected, setConnected] = useState(false);
  const [canDraw, setCanDraw] = useState(isTeacher);
  const [elements, setElements] = useState<any[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string; canDraw: boolean }[]>([]);

  // ── Socket connection ──────────────────────────────────
  useEffect(() => {
    const token = Cookies.get('cpa_token');
    if (!token) return;

    const socket = io(`${API_URL}${WS_PATH}`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('whiteboard:join', { classId });
    });

    socket.on('disconnect', () => setConnected(false));

    // Receive current full state on join
    socket.on('whiteboard:state', (data: WhiteboardState) => {
      setElements(data.elements ?? []);
      setCanDraw(data.canDraw);
      // Push to Excalidraw if it's already mounted
      if (excalidrawRef.current && data.elements.length > 0) {
        excalidrawRef.current.updateScene({ elements: data.elements });
      }
    });

    // Receive incremental update from teacher / permitted student
    socket.on('whiteboard:update', (data: { elements: any[]; appState: any; senderId: string }) => {
      if (data.senderId === userId) return; // ignore our own echo
      setElements(data.elements ?? []);
      if (excalidrawRef.current) {
        isBroadcasting.current = true;
        excalidrawRef.current.updateScene({ elements: data.elements });
        isBroadcasting.current = false;
      }
    });

    // Teacher grants/revokes draw permission
    socket.on('whiteboard:permission', (data: { studentId: string; canDraw: boolean }) => {
      if (data.studentId === userId) {
        setCanDraw(data.canDraw);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [classId, userId]);

  // ── Excalidraw onChange → broadcast to room ────────────
  const handleChange = useCallback(
    (els: readonly any[]) => {
      if (!canDraw) return;
      if (isBroadcasting.current) return;
      const socket = socketRef.current;
      if (!socket || !socket.connected) return;
      socket.emit('whiteboard:update', { classId, elements: els });
    },
    [canDraw, classId],
  );

  // ── Teacher controls ───────────────────────────────────
  function clearBoard() {
    socketRef.current?.emit('whiteboard:clear', { classId });
    if (excalidrawRef.current) {
      excalidrawRef.current.updateScene({ elements: [] });
    }
  }

  function toggleStudentDraw(studentId: string, currentlyCanDraw: boolean) {
    socketRef.current?.emit('whiteboard:permission', {
      classId,
      studentId,
      canDraw: !currentlyCanDraw,
    });
    setStudents(s => s.map(st => st.id === studentId ? { ...st, canDraw: !currentlyCanDraw } : st));
  }

  return (
    <div className="flex flex-col h-full bg-[#121212]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white">Whiteboard</span>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-azure' : 'bg-royal/40'}`} />
          {!canDraw && !isTeacher && (
            <span className="text-[10px] text-white/30">View only</span>
          )}
        </div>
        {isTeacher && (
          <button
            onClick={clearBoard}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/50 hover:text-white hover:border-white/30 transition"
          >
            Clear
          </button>
        )}
      </div>

      {/* Excalidraw canvas */}
      <div className="flex-1 overflow-hidden">
        <Excalidraw
          excalidrawAPI={(api: any) => { excalidrawRef.current = api; }}
          initialData={{ elements, appState: { viewBackgroundColor: '#121212' } }}
          onChange={handleChange}
          viewModeEnabled={!canDraw}
          UIOptions={{
            canvasActions: {
              export: false,
              loadScene: false,
              saveToActiveFile: false,
              saveAsImage: isTeacher,
            },
          }}
          theme="dark"
        />
      </div>
    </div>
  );
}
