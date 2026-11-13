'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { EditClassDialog, EditableClass } from '@/components/live/EditClassDialog';
import { TeacherRecordingsHero, RecordingsWork, RecRow } from '@/components/hero/TeacherWorkHeroes';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

const date = (d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const btn = (primary: boolean) => primary
  ? 'inline-flex h-8 items-center rounded-md border border-azure-strong bg-azure-strong px-3 text-[13px] font-semibold text-on-accent'
  : 'inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle';

/** Every recorded class with how often it's watched, and the held classes that still need one */
export default function TeacherRecordingsPage() {
  const [d, setD] = useState<RecordingsWork | null>(null);
  const [edit, setEdit] = useState<EditableClass | null>(null);

  async function load() { const r = await api.get('/portals/teacher/work/recordings'); setD(r.data); }
  useEffect(() => { load().catch(() => notify.error('Could not load recordings')); }, []);
  const add = (c: RecRow) => setEdit({ id: c.id, title: c.title, scheduledAt: c.scheduledAt, durationMins: c.durationMins, status: c.status, recordingUrl: c.recordingUrl });

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Recordings" subtitle="Your classes, ready to watch again, and who has watched" />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        {d ? <TeacherRecordingsHero d={d} onAdd={add} /> : <div className="h-64 animate-pulse rounded-[14px] bg-[#3F6FE8]/30" />}

        {d && d.missing.length > 0 && (
          <section className="rounded-lg border border-line bg-white">
            <h2 className="border-b border-line px-[18px] py-3.5 text-base font-bold text-navy">No recording yet <span className="font-medium text-muted">{d.missing.length}</span></h2>
            {d.missing.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-3.5 first-of-type:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy">{c.title}</p>
                  <p className="mt-0.5 truncate text-[12.5px] text-muted">{date(c.scheduledAt)} · {c.cohort.name} · {c.durationMins} min</p>
                </div>
                <button type="button" onClick={() => add(c)} className={btn(true)}>Add recording</button>
              </div>
            ))}
          </section>
        )}

        <section className="rounded-lg border border-line bg-white">
          <h2 className="border-b border-line px-[18px] py-3.5 text-base font-bold text-navy">Recorded classes {d && <span className="font-medium text-muted">{d.recorded.length}</span>}</h2>
          {!d ? <div className="m-4 h-32 animate-pulse rounded-md bg-subtle" />
            : !d.recorded.length ? <p className="px-4 py-10 text-center text-[13px] text-ink2">No recordings yet. Classes taught in the portal are recorded on their own and show up here.</p>
            : d.recorded.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-3.5 first-of-type:border-t-0">
                <div className="min-w-0 flex-[999_1_240px]">
                  <p className="truncate text-sm font-semibold text-navy">{c.title}</p>
                  <p className="mt-0.5 truncate text-[12.5px] text-muted">{date(c.scheduledAt)} · {c.cohort.name} · {c.durationMins} min</p>
                </div>
                <div className="w-[180px]">
                  <p className="mb-1 text-[12.5px] text-ink2">{c.viewers} of {c.rosterSize} watched{c.views > c.viewers ? ` · ${c.views} views` : ''}</p>
                  <span className="block h-1.5 overflow-hidden rounded-[3px] bg-subtle"><span className="block h-1.5 bg-azure" style={{ width: `${c.viewersPct ?? 0}%` }} /></span>
                </div>
                <Link href={`/teacher/recordings/${c.id}`} className={btn(false)}>Watch</Link>
                <button type="button" onClick={() => add(c)} className={btn(false)}>Edit link</button>
              </div>
            ))}
        </section>
      </div>
      <EditClassDialog cls={edit} onClose={() => setEdit(null)} onDone={load} />
    </div>
  );
}
