'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Cookies from 'js-cookie';
import { io, Socket } from 'socket.io-client';
import { clsx } from 'clsx';
import type { DailyCall } from '@daily-co/daily-js';
import { SOCKET_ORIGIN } from '@/lib/images';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

export interface CallView {
  id: string; threadId: string; kind: 'ONE' | 'GROUP'; status: 'RINGING' | 'ACTIVE' | 'ENDED' | 'MISSED' | 'DECLINED';
  startedAt: string; answeredAt: string | null; endedAt: string | null;
  startedBy: { id: string; name: string; avatarUrl: string | null };
  title: string; avatarUrl: string | null; subtitle: string;
  participants: { id: string; name: string; avatarUrl: string | null; role: string; inCall: boolean; declined: boolean }[];
  isHost: boolean; memberCount: number;
}
type Phase = 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'live';

/** Start, join or answer a call from anywhere in the portal (the chat's phone button, a Join button) */
export const calls = {
  start: (threadId: string) => window.dispatchEvent(new CustomEvent('cpa-call', { detail: { action: 'start', threadId } })),
  join: (callId: string) => window.dispatchEvent(new CustomEvent('cpa-call', { detail: { action: 'join', callId } })),
};

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const clock = (secs: number) => { const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60; return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`; };
const QUICK_DECLINE = ['Can’t talk now, I’ll call you back', 'In class, I’ll message you', 'Call me later?'];

/** A soft ring made in the browser (no sound file): two short tones, then a pause */
function useRing(on: boolean, outgoing: boolean) {
  useEffect(() => {
    if (!on) return;
    let ctx: AudioContext | null = null;
    try { ctx = new AudioContext(); } catch { return; }
    const beep = () => {
      if (!ctx) return;
      [0, 0.45].forEach(at => {
        const o = ctx!.createOscillator(), g = ctx!.createGain();
        o.frequency.value = outgoing ? 425 : 660; o.connect(g); g.connect(ctx!.destination);
        const t = ctx!.currentTime + at;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(outgoing ? 0.05 : 0.12, t + 0.03); g.gain.linearRampToValueAtTime(0, t + 0.35);
        o.start(t); o.stop(t + 0.4);
      });
    };
    beep();
    const iv = setInterval(beep, 2400);
    return () => { clearInterval(iv); ctx?.close().catch(() => {}); };
  }, [on, outgoing]);
}

function Face({ name, url, size, speaking, dim }: { name: string; url: string | null; size: number; speaking?: boolean; dim?: boolean }) {
  return (
    <span className={clsx('relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#1A2B5C] font-extrabold text-[#9CB7FF] transition-shadow', speaking && 'shadow-[0_0_0_4px_#5BD39A]', dim && 'opacity-70')} style={{ width: size, height: size, fontSize: size * 0.32 }}>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

const I = {
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  hang: 'M3 15c5-5 13-5 18 0l-2.5 2.5-3-1.5v-3a12 12 0 0 0-7 0v3l-3 1.5z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  micOff: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18',
  hand: 'M7 11V5a2 2 0 0 1 4 0v5M11 10V4a2 2 0 0 1 4 0v6M15 10V6a2 2 0 0 1 4 0v8a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3l-2-4a2 2 0 0 1 3-2l2 2',
  muteAll: 'M3 3l18 18M9 9v3a3 3 0 0 0 5 2M15 9V6a3 3 0 0 0-6 0M19 11a7 7 0 0 1-1.2 4M12 18v3',
  min: 'M6 15l6-6 6 6',
};
function RoundButton({ label, icon, onClick, tone = 'plain', on, size = 60 }: { label: string; icon: string; onClick: () => void; tone?: 'plain' | 'red' | 'green' | 'light'; on?: boolean; size?: number }) {
  return (
    <span className="flex flex-col items-center gap-2">
      <button type="button" onClick={onClick} aria-label={label} aria-pressed={on}
        className={clsx('grid place-items-center rounded-full transition-colors', tone === 'red' ? 'bg-[#D9443A] text-white' : tone === 'green' ? 'bg-[#1F9D63] text-white' : on ? 'bg-[#EAF0FF] text-[#0B1530]' : 'bg-[#1A2B5C] text-[#EAF0FF] hover:bg-[#22356B]')}
        style={{ width: size, height: size }}>
        <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={icon} /></svg>
      </button>
      <span className="text-[12.5px] text-[#BBC6E4]">{label}</span>
    </span>
  );
}

/**
 * Voice calls everywhere in the portal: rings when someone calls (with sound), shows the call while it's on,
 * and shrinks to a bar so people can keep using the portal. Audio runs on Daily; on a computer without a Daily
 * key the API hands out stand-in rooms and this shows the screens without audio.
 */
export default function CallLayer() {
  const [call, setCall] = useState<CallView | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [small, setSmall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [hand, setHand] = useState(false);
  const [hands, setHands] = useState<Record<string, boolean>>({});
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [remoteMuted, setRemoteMuted] = useState<Record<string, boolean>>({});
  const [audio, setAudio] = useState<Record<string, MediaStreamTrack>>({});
  const [now, setNow] = useState(Date.now());
  const [declining, setDeclining] = useState(false);
  const [groupStarted, setGroupStarted] = useState<CallView | null>(null);
  const daily = useRef<DailyCall | null>(null);
  const sessionToUser = useRef<Record<string, string>>({});
  const callRef = useRef<CallView | null>(null); callRef.current = call;
  const phaseRef = useRef<Phase>('idle'); phaseRef.current = phase;

  useRing(phase === 'incoming' || phase === 'outgoing', phase === 'outgoing');
  useEffect(() => { if (phase !== 'live') return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [phase]);

  const leaveDaily = useCallback(async () => {
    const d = daily.current; daily.current = null;
    if (d) { try { await d.leave(); } catch { /* already gone */ } try { await d.destroy(); } catch { /* already gone */ } }
    setAudio({}); setSpeaking(null); setRemoteMuted({}); setHands({}); sessionToUser.current = {};
  }, []);

  const reset = useCallback(() => { clearCallNotices(); leaveDaily(); setCall(null); setPhase('idle'); setSmall(false); setMuted(false); setHand(false); setDeclining(false); }, [leaveDaily]);

  /** Into the room: Daily in real life, nothing to connect on a stand-in */
  const connect = useCallback(async (info: { call: CallView; roomUrl: string; token: string; fake?: boolean }) => {
    setCall(info.call);
    if (info.fake) { setPhase(info.call.status === 'RINGING' ? 'outgoing' : 'live'); return; }
    setPhase(info.call.status === 'RINGING' ? 'outgoing' : 'connecting');
    try {
      const Daily = (await import('@daily-co/daily-js')).default;
      const d = Daily.createCallObject({ audioSource: true, videoSource: false, subscribeToTracksAutomatically: true });
      daily.current = d;
      const sync = () => {
        const ps = d.participants();
        const tracks: Record<string, MediaStreamTrack> = {}; const mutedNow: Record<string, boolean> = {};
        Object.values(ps).forEach(p => {
          if (p.user_id) sessionToUser.current[p.session_id] = p.user_id;
          if (p.local) return;
          const t = p.tracks?.audio;
          if (t?.persistentTrack && t.state === 'playable') tracks[p.session_id] = t.persistentTrack;
          mutedNow[p.user_id] = t?.state !== 'playable';
        });
        setAudio(tracks); setRemoteMuted(mutedNow);
      };
      d.on('participant-joined', sync).on('participant-updated', sync).on('track-started', sync).on('track-stopped', sync);
      // The other person arriving in the room means they answered, even if the "answered" message never reached us
      d.on('participant-joined', () => { if (phaseRef.current === 'outgoing') setPhase('live'); });
      // One-to-one: when the other person drops off (closed the tab, lost signal), the call is over
      d.on('participant-left', () => { sync(); if (callRef.current?.kind === 'ONE') { api.post(`/calls/${callRef.current.id}/leave`).catch(() => {}); notify.info('Call ended'); reset(); } });
      d.on('active-speaker-change', e => setSpeaking(sessionToUser.current[e?.activeSpeaker?.peerId ?? ''] ?? null));
      d.on('app-message', e => { const m = e?.data; if (m?.type === 'hand') setHands(h => ({ ...h, [m.userId]: !!m.raised })); });
      d.on('participant-updated', e => { if (e?.participant.local) setMuted(!e.participant.tracks?.audio || e.participant.tracks.audio.state === 'off'); });
      await d.join({ url: info.roomUrl, token: info.token, startVideoOff: true });
      sync();
      if (phaseRef.current === 'connecting') setPhase('live');
    } catch (e: any) {
      notify.error(/permission|NotAllowed/i.test(String(e?.message ?? e)) ? 'Allow the microphone to talk: tap the lock next to the web address.' : 'Could not connect the call');
    }
  }, []);

  const start = useCallback(async (threadId: string) => {
    if (callRef.current) { setSmall(false); return; }
    try { await connect((await api.post('/calls', { threadId })).data); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not start the call'); }
  }, [connect]);
  const join = useCallback(async (callId: string) => {
    if (callRef.current?.id === callId) { setSmall(false); return; }
    if (callRef.current) { notify.info('Hang up your current call first'); return; }
    setGroupStarted(null);
    try { await connect((await api.post(`/calls/${callId}/join`)).data); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not join the call'); }
  }, [connect]);
  async function answer() {
    if (!call) return;
    clearCallNotices();
    try { await connect((await api.post(`/calls/${call.id}/accept`)).data); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'The call has ended'); reset(); }
  }
  async function decline(message?: string) {
    if (!call) return;
    api.post(`/calls/${call.id}/decline`, { message }).catch(() => {});
    reset();
  }
  async function hangUp(forAll = false) {
    if (!call) return;
    api.post(`/calls/${call.id}/${forAll ? 'end' : 'leave'}`).catch(() => {});
    reset();
  }
  function toggleMute() {
    const next = !muted; setMuted(next);
    daily.current?.setLocalAudio(!next);
  }
  function toggleHand() {
    const next = !hand; setHand(next);
    const me = call?.participants.find(p => p.id === myId.current)?.id ?? myId.current;
    daily.current?.sendAppMessage({ type: 'hand', userId: me, raised: next }, '*');
  }
  function muteEveryone() {
    daily.current?.updateParticipants({ '*': { setAudio: false } });
    notify.success('Everyone else is muted');
  }

  // While calling, check the call itself every few seconds too: one missed live message must not leave the
  // caller on "Calling…" when the other person has answered, declined or the call has ended
  useEffect(() => {
    if (phase !== 'outgoing' || !call) return;
    const id = call.id;
    const t = setInterval(() => {
      api.get<CallView>(`/calls/${id}`).then(r => {
        const c = r.data;
        if (callRef.current?.id !== id || phaseRef.current !== 'outgoing') return;
        if (c.status === 'ACTIVE') { setCall(c); setPhase('live'); }
        else if (c.status !== 'RINGING') {
          notify.info(c.status === 'DECLINED' ? `${c.title} declined` : c.status === 'MISSED' ? 'No answer' : 'Call ended');
          reset();
        }
      }).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [phase, call?.id, reset]); // eslint-disable-line react-hooks/exhaustive-deps

  // Who I am, to tell my tile apart
  const myId = useRef<string>('');
  useEffect(() => { try { const t = Cookies.get('cpa_token'); if (t) myId.current = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch { /* no token */ } }, []);

  // Live: someone calls, answers, joins, leaves or hangs up
  useEffect(() => {
    const token = Cookies.get('cpa_token');
    if (!token) return;
    const socket: Socket = io(`${SOCKET_ORIGIN}/messages`, { path: '/socket.io', transports: ['websocket'], auth: { token }, reconnection: true });
    socket.on('call:incoming', ({ call: c }: { call: CallView }) => {
      if (c.kind === 'GROUP') { if (!callRef.current) setGroupStarted(c); return; }
      if (callRef.current) { api.post(`/calls/${c.id}/decline`, {}).catch(() => {}); return; } // already on a call: busy
      setCall(c); setPhase('incoming'); setSmall(false);
    });
    socket.on('call:update', ({ call: c }: { call: CallView }) => {
      if (c.kind === 'GROUP' && c.status !== 'ACTIVE') setGroupStarted(g => (g?.id === c.id ? null : g));
      const mine = callRef.current;
      if (!mine || mine.id !== c.id) return;
      if (c.status === 'ACTIVE') { setCall(c); if (phaseRef.current === 'outgoing') setPhase(daily.current ? 'live' : 'live'); return; }
      // Ended, missed or declined
      const why = c.status === 'DECLINED' ? `${c.title} declined` : c.status === 'MISSED' ? (c.startedBy.id === myId.current ? 'No answer' : `Missed call from ${c.startedBy.name}`) : 'Call ended';
      notify.info(why);
      reset();
    });
    // The portal is open now: ringing notifications on this device are handled on the page
    clearCallNotices();
    // A call ringing (or in progress) when the portal opened
    api.get('/calls/current').then(r => {
      const c = r.data.call as CallView | null;
      if (!c || callRef.current) return;
      if (r.data.ringing) { setCall(c); setPhase('incoming'); }
      else if (r.data.inCall) join(c.id).catch(() => {});
    }).catch(() => {});
    const onAsk = (e: Event) => { const d = (e as CustomEvent).detail; if (d.action === 'start') start(d.threadId); if (d.action === 'join') join(d.callId); };
    window.addEventListener('cpa-call', onAsk);
    return () => { socket.disconnect(); window.removeEventListener('cpa-call', onAsk); };
  }, [start, join, reset]);

  useEffect(() => () => { leaveDaily(); }, [leaveDaily]);

  const elapsed = call?.answeredAt ? Math.max(0, Math.floor((now - +new Date(call.answeredAt)) / 1000)) : 0;
  const players = Object.entries(audio).map(([sid, track]) => <AudioOut key={sid} track={track} />);

  // A group call started in one of my groups: a banner to join
  const banner = groupStarted && phase === 'idle' && (
    <div role="status" className="fixed left-1/2 top-3 z-[60] flex w-[min(92vw,460px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-[#BFE6D1] bg-white px-4 py-3 shadow-xl">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#E5F5EC] text-[#1F7A50]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d={I.phone} /></svg></span>
      <span className="min-w-0 flex-1 text-[13.5px] text-[#3A4A70]"><strong className="block truncate text-[#072061]">{groupStarted.title}</strong>{groupStarted.startedBy.name} started a group call</span>
      <button onClick={() => join(groupStarted.id)} className="h-9 shrink-0 rounded-md bg-[#1F9D63] px-3.5 text-[13px] font-bold text-white">Join</button>
      <button onClick={() => setGroupStarted(null)} aria-label="Dismiss" className="shrink-0 px-1 text-[18px] text-[#7C89A8]">×</button>
    </div>
  );

  if (!call) return <>{banner}</>;

  // Shrunk to a bar while the person uses the portal
  if (small && phase !== 'incoming') return (
    <>
      {players}
      <div role="status" className="fixed left-1/2 top-2 z-[60] flex w-[min(94vw,520px)] -translate-x-1/2 items-center gap-3 rounded-full bg-[#1F9D63] px-4 py-2 text-white shadow-xl">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-white" aria-hidden />
        <button onClick={() => setSmall(false)} className="min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold">{phase === 'outgoing' ? 'Calling' : 'On a call with'} {call.title} · {phase === 'live' ? clock(elapsed) : '…'} · tap to return</button>
        <button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} className="grid h-8 w-8 place-items-center rounded-full bg-white/20"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d={muted ? I.micOff : I.mic} /></svg></button>
        <button onClick={() => hangUp()} aria-label="Hang up" className="grid h-8 w-8 place-items-center rounded-full bg-[#D9443A]"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d={I.hang} /></svg></button>
      </div>
    </>
  );

  const inCall = call.participants.filter(p => p.inCall);
  return (
    <div role="dialog" aria-modal="true" aria-label={phase === 'incoming' ? `Incoming call from ${call.title}` : `Call with ${call.title}`}
      className="fixed inset-0 z-[70] flex flex-col bg-[#0B1530] text-[#EAF0FF]">
      {players}
      {phase !== 'incoming' && (
        <div className="flex items-center justify-between px-5 pt-[max(16px,env(safe-area-inset-top))]">
          <button onClick={() => setSmall(true)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-[#BBC6E4] hover:bg-white/10" aria-label="Shrink the call and keep using the portal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="rotate-180"><path d={I.min} /></svg>Keep browsing
          </button>
          {call.kind === 'GROUP' && <span className="rounded-full bg-[#1A2B5C] px-3 py-1 text-[12.5px] font-bold text-[#9CB7FF]">{inCall.length} of {call.memberCount} here</span>}
        </div>
      )}

      {call.kind === 'ONE' || phase === 'incoming' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-[#8C99BC]">{phase === 'incoming' ? (call.kind === 'GROUP' ? 'Group voice call' : 'Incoming voice call') : phase === 'outgoing' ? 'Calling…' : phase === 'connecting' ? 'Connecting…' : 'Voice call'}</span>
          <span className={clsx('rounded-full', phase === 'incoming' && 'animate-pulse')}><Face name={call.title} url={call.avatarUrl} size={120} speaking={phase === 'live' && !!speaking && speaking !== myId.current} /></span>
          <strong className="text-[28px] leading-tight">{call.title}</strong>
          <span className="text-[14px] text-[#BBC6E4]">{phase === 'live' ? clock(elapsed) : call.subtitle}</span>
          {phase === 'live' && call.kind === 'ONE' && remoteMuted[call.participants.find(p => p.id !== myId.current)?.id ?? ''] && <span className="rounded-full bg-[#1A2B5C] px-3 py-1 text-[12.5px] text-[#BBC6E4]">{call.title.split(' ')[0]} is muted</span>}

          {phase === 'incoming' ? (
            declining ? (
              <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
                {QUICK_DECLINE.map(m => <button key={m} onClick={() => decline(m)} className="h-11 rounded-full border border-[#22305A] text-[14px] text-[#EAF0FF] hover:bg-white/5">{m}</button>)}
                <button onClick={() => setDeclining(false)} className="h-10 text-[13px] text-[#8C99BC]">Back</button>
              </div>
            ) : <>
              <div className="mt-8 flex gap-14">
                <RoundButton label="Decline" icon={I.hang} tone="red" onClick={() => decline()} size={68} />
                <RoundButton label="Answer" icon={I.phone} tone="green" onClick={answer} size={68} />
              </div>
              <button onClick={() => setDeclining(true)} className="mt-4 h-9 rounded-full border border-[#22305A] px-4 text-[13px] text-[#BBC6E4] hover:bg-white/5">Decline with a message</button>
            </>
          ) : (
            <div className="mt-10 flex gap-6">
              <RoundButton label={muted ? 'Unmute' : 'Mute'} icon={muted ? I.micOff : I.mic} on={muted} onClick={toggleMute} />
              <RoundButton label={phase === 'outgoing' ? 'Cancel' : 'End'} icon={I.hang} tone="red" onClick={() => hangUp()} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 pt-4 lg:px-10">
          <div className="flex flex-col gap-0.5"><strong className="text-[19px]">{call.title}</strong><span className="text-[13px] text-[#8C99BC]">Group voice call · started by {call.startedBy.name} · {clock(elapsed)}</span></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {inCall.map(p => {
              const me = p.id === myId.current;
              const isMuted = me ? muted : remoteMuted[p.id] ?? false;
              return (
                <div key={p.id} className="flex flex-col items-center gap-2 rounded-xl border border-[#22305A] bg-[#101C3D] px-2 py-4">
                  <Face name={p.name} url={p.avatarUrl} size={64} speaking={speaking === p.id && !isMuted} dim={isMuted} />
                  <strong className="max-w-full truncate text-[13.5px]">{me ? 'You' : p.name}</strong>
                  <span className={clsx('rounded-full px-2 py-0.5 text-[11.5px] font-bold', hands[p.id] || (me && hand) ? 'bg-[#3A2D12] text-[#F3C26B]' : speaking === p.id && !isMuted ? 'bg-[#12352A] text-[#5BD39A]' : 'text-[#8C99BC]')}>
                    {hands[p.id] || (me && hand) ? 'Hand raised' : speaking === p.id && !isMuted ? 'Speaking' : isMuted ? 'Muted' : p.id === call.startedBy.id ? 'Host' : ' '}
                  </span>
                </div>
              );
            })}
          </div>
          {call.isHost && Object.entries(hands).filter(([, up]) => up).map(([uid]) => {
            const who = call.participants.find(p => p.id === uid);
            return who && <div key={uid} className="flex items-center gap-3 rounded-lg border border-[#22305A] bg-[#101C3D] px-4 py-3 text-[13.5px] text-[#BBC6E4]"><span className="flex-1"><strong className="text-[#EAF0FF]">{who.name}</strong> raised their hand</span><button onClick={() => setHands(h => ({ ...h, [uid]: false }))} className="h-8 rounded-md bg-[#7097FF] px-3 text-[13px] font-bold text-[#0B1530]">Let them speak</button></div>;
          })}
          <div className="mt-auto flex flex-wrap justify-center gap-5 pt-4">
            <RoundButton label={muted ? 'Unmute' : 'Mute'} icon={muted ? I.micOff : I.mic} on={muted} onClick={toggleMute} size={56} />
            {!call.isHost && <RoundButton label={hand ? 'Lower hand' : 'Raise hand'} icon={I.hand} on={hand} onClick={toggleHand} size={56} />}
            {call.isHost && <RoundButton label="Mute everyone" icon={I.muteAll} onClick={muteEveryone} size={56} />}
            <RoundButton label="Leave" icon={I.hang} tone="red" onClick={() => hangUp()} size={56} />
            {call.isHost && <RoundButton label="End for all" icon={I.hang} tone="red" onClick={() => hangUp(true)} size={56} />}
          </div>
        </div>
      )}
    </div>
  );
}

/** Closes this device's call notifications (the page shows the call itself) */
function clearCallNotices() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistration().then(reg => reg?.getNotifications()).then(list => list?.filter(n => n.tag?.startsWith('call-')).forEach(n => n.close())).catch(() => {});
}

/** Plays one person's voice */
function AudioOut({ track }: { track: MediaStreamTrack }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (ref.current) { ref.current.srcObject = new MediaStream([track]); ref.current.play().catch(() => {}); } }, [track]);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}
