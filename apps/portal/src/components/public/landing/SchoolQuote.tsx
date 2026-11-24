'use client';
import { useState } from 'react';

/** "Request a partnership" on /schools: emailed to our partnerships team, who reply to the school directly */
export function SchoolQuote() {
  const [f, setF] = useState({ organisation: '', name: '', email: '', phone: '', students: '', exam: '', message: '', website: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setState('sending');
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/catalogue/school-enquiry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(r.status === 429 ? 'Too many tries: wait a minute and send again.' : Array.isArray(j.message) ? j.message[0] : j.message ?? 'Could not send. Write to partners@careerpathafrica.com instead.');
      }
      setState('sent');
    } catch (err) { setError((err as Error).message); setState('idle'); }
  }
  const input = 'h-11 w-full rounded-[7px] border border-[#D5DDEC] bg-[#FFFFFF] px-3 text-[15px] text-navy outline-none placeholder:text-[#9AA6C2] focus:border-[#3F6FE8]';

  if (state === 'sent') return (
    <div className="flex flex-col gap-2 rounded-xl bg-[#FFFFFF] p-6 text-navy">
      <b className="text-[20px]">Thank you, we’ve got it.</b>
      <p className="text-[15px] leading-relaxed text-[#3A4A6B]">Our team will reply to <b className="text-navy">{f.email}</b> within a working day with a suggested package and a price per seat.</p>
    </div>
  );
  return (
    <form onSubmit={send} className="flex flex-col gap-2.5 rounded-xl bg-[#FFFFFF] p-5 text-navy sm:p-6">
      <b className="text-[19px]">Request a partnership</b>
      <input aria-label="School or organisation" required value={f.organisation} onChange={set('organisation')} placeholder="School or organisation" className={input} />
      <div className="grid gap-2.5 sm:grid-cols-2">
        <input aria-label="Your name" value={f.name} onChange={set('name')} placeholder="Your name" className={input} />
        <input aria-label="Phone (optional)" value={f.phone} onChange={set('phone')} placeholder="Phone (optional)" className={input} inputMode="tel" />
      </div>
      <input aria-label="Your email" required type="email" value={f.email} onChange={set('email')} placeholder="Your email" className={input} />
      <div className="grid gap-2.5 sm:grid-cols-[140px_minmax(0,1fr)]">
        <input aria-label="How many students" required value={f.students} onChange={set('students')} placeholder="Students" inputMode="numeric" className={input} />
        <input aria-label="Which exam" value={f.exam} onChange={set('exam')} placeholder="Which exam? e.g. GCE A-Level" className={input} />
      </div>
      <textarea aria-label="Anything else (optional)" value={f.message} onChange={set('message')} rows={3} maxLength={1500} placeholder="Anything else (optional)" className="w-full resize-none rounded-[7px] border border-[#D5DDEC] px-3 py-2.5 text-[15px] text-navy outline-none placeholder:text-[#9AA6C2] focus:border-[#3F6FE8]" />
      {/* Left empty by people; bots fill it */}
      <input aria-hidden tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} name="website" className="hidden" />
      {error && <p role="alert" className="text-[13.5px] font-semibold text-[#B42318]">{error}</p>}
      <button type="submit" disabled={state === 'sending'} className="mt-1 inline-flex h-12 items-center justify-center rounded-[7px] bg-[#2F57C9] text-[15.5px] font-extrabold text-[#FFFFFF] hover:bg-[#2548AE] disabled:opacity-60">{state === 'sending' ? 'Sending…' : 'Send'}</button>
      <p className="text-[12.5px] text-[#637090]">We reply within a working day. Or write to partners@careerpathafrica.com.</p>
    </form>
  );
}
