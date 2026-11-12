'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { VideoEmbed } from '@/components/ui/VideoEmbed';
import { uploadVideo } from '@/lib/uploadVideo';
import api, { setAuthToken } from '@/lib/api';
import { notify } from '@/lib/notify';
import { parseVideoUrl } from '@cpa/shared';

type Step = 1 | 2 | 3 | 4 | 5;
interface Country { id: string; name: string; }
interface Subject { id: string; name: string; }
interface Programme { id: string; name: string; shortName: string | null; subjects?: Subject[]; }

const QUALIFICATIONS = [
  { value: 'HIGH_SCHOOL',  label: 'High school' },
  { value: 'BACHELOR',     label: "Bachelor's" },
  { value: 'MASTER',       label: "Master's" },
  { value: 'PHD',          label: 'PhD' },
  { value: 'PROFESSIONAL', label: 'Professional' },
];
const MODALITIES = [
  { value: 'ONLINE',    label: 'Online' },
  { value: 'IN_PERSON', label: 'In-person' },
  { value: 'HYBRID',    label: 'Hybrid' },
];
const STEP_COPY: Record<Step, { title: string; sub: string }> = {
  1: { title: 'Welcome to the teacher portal', sub: 'Your CareerPath Africa account is connected. Let’s finish your teacher profile.' },
  2: { title: 'What do you teach?',           sub: 'Students find teachers by programme and subject.' },
  3: { title: 'Tell students about you',       sub: 'Your bio appears on your teacher profile and mentor listing.' },
  4: { title: 'Add an intro video',            sub: 'Optional for now. Students can only book you for mentorship once you have one.' },
  5: { title: 'One last thing',                sub: 'Review and accept the tutor agreement to start teaching.' },
};

const inputCls = 'w-full rounded-lg border border-cloud bg-white px-3.5 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40';
const choiceCls = (on: boolean) => `rounded-lg border px-3 py-2.5 text-center text-[13px] font-semibold transition ${
  on ? 'border-azure bg-azure/[0.07] text-navy' : 'border-cloud text-royal/70 hover:border-azure/40'
}`;

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
        selected ? 'border-azure bg-azure text-white' : 'border-cloud bg-white text-navy hover:border-azure/40'
      }`}>
      {children}
    </button>
  );
}

export default function TeacherOnboardingPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const [countries, setCountries] = useState<Country[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);

  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', countryId: '',
    teachingProgrammeIds: [] as string[], teachingSubjectIds: [] as string[],
    teachingModality: '', yearsExperience: '', qualification: '',
    bio: '', documentUrl: '', documentName: '', linkedinUrl: '', websiteUrl: '',
  });
  const [agreementAccepted, setAgreementAccepted] = useState(false);

  // Step 4 — optional intro video (saved immediately via the teacher profile endpoint)
  const videoFileRef = useRef<HTMLInputElement>(null);
  const [introVideo, setIntroVideo] = useState('');
  const [videoLink, setVideoLink] = useState('');
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [savingLink, setSavingLink] = useState(false);

  async function saveIntroVideo(url: string) {
    const { data } = await api.patch('/teachers/me/profile', { videoIntroUrl: url });
    setIntroVideo(data?.videoIntroUrl ?? url);
  }

  async function handleVideoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 100 * 1024 * 1024) { setError('Video must be 100 MB or smaller.'); return; }
    setError(''); setVideoProgress(0);
    try {
      await saveIntroVideo(await uploadVideo(file, setVideoProgress));
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Upload failed. You can paste a YouTube link or skip for now.');
    } finally {
      setVideoProgress(null);
      if (videoFileRef.current) videoFileRef.current.value = '';
    }
  }

  async function handleVideoLink() {
    if (!parseVideoUrl(videoLink)) { setError('Paste a YouTube or Vimeo link.'); return; }
    setError(''); setSavingLink(true);
    try {
      await saveIntroVideo(videoLink.trim());
      setVideoLink('');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not save that link.');
    } finally { setSavingLink(false); }
  }
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }));
  const toggle = (k: 'teachingProgrammeIds' | 'teachingSubjectIds', id: string) =>
    setForm(f => ({ ...f, [k]: f[k].includes(id) ? f[k].filter(x => x !== id) : [...f[k], id] }));

  useEffect(() => {
    Promise.all([api.get('/auth/me'), api.get('/countries'), api.get('/catalogue/programmes')])
      .then(([me, c, p]) => {
        if (me.data.role !== 'TEACHER' || me.data.teacherProfileComplete !== false) {
          router.replace('/teacher/dashboard');
          return;
        }
        setForm(f => ({
          ...f,
          firstName: me.data.firstName ?? '', lastName: me.data.lastName ?? '',
          phone: me.data.phone ?? '', countryId: me.data.countryId ?? '',
        }));
        api.get('/teachers/me/profile').then(tp => setIntroVideo(tp.data?.videoIntroUrl ?? '')).catch(() => {});
        setCountries(c.data ?? []);
        setProgrammes(p.data ?? []);
        setLoading(false);
      })
      .catch(() => { setError('Could not load your profile. Please refresh the page.'); setLoading(false); });
  }, [router]);

  // Subjects offered by the selected programmes (all subjects if none selected yet)
  const subjectPool = (form.teachingProgrammeIds.length
    ? programmes.filter(p => form.teachingProgrammeIds.includes(p.id))
    : programmes
  ).flatMap(p => p.subjects ?? [])
   .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i)
   .sort((a, b) => a.name.localeCompare(b.name));

  function validate(s: Step): string {
    if (s === 1) {
      if (!form.firstName.trim() || !form.lastName.trim()) return 'Enter your first and last name.';
      if (!form.countryId) return 'Select the country you teach from.';
    }
    if (s === 2) {
      if (!form.teachingProgrammeIds.length) return 'Select at least one programme you teach.';
      if (!form.teachingSubjectIds.length) return 'Select at least one subject you teach.';
      if (!form.qualification) return 'Select your highest qualification.';
    }
    if (s === 3 && form.bio.trim().length < 100) return 'Your bio must be at least 100 characters.';
    return '';
  }

  function next() {
    const msg = validate(step);
    if (msg) { setError(msg); return; }
    setError('');
    setStep(s => (s + 1) as Step);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setError('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await api.post('/files/upload?folder=teacher-docs', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm(f => ({ ...f, documentUrl: r.data.url, documentName: file.name }));
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Upload failed. You can skip this and add your CV later.');
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function submit() {
    if (!agreementAccepted) { setError('Please accept the tutor agreement.'); return; }
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/auth/teacher-onboarding', {
        firstName: form.firstName.trim(), lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
        countryId: form.countryId,
        teachingProgrammeIds: form.teachingProgrammeIds,
        teachingSubjectIds: form.teachingSubjectIds,
        subjectAreas: form.teachingSubjectIds.map(id => subjectPool.find(s => s.id === id)?.name ?? id),
        teachingModality: form.teachingModality || undefined,
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : undefined,
        qualification: form.qualification || undefined,
        bio: form.bio.trim(),
        documentUrl: form.documentUrl || undefined,
        linkedinUrl: form.linkedinUrl.trim() || undefined,
        websiteUrl: form.websiteUrl.trim() || undefined,
        agreementAccepted: true,
        agreementVersion: 'v1.0',
      });
      if (data?.accessToken) await setAuthToken(data.accessToken, true);
      // Their courses from careerpathafrica.com were linked to them: show them where they are
      const linked = Number(data?.linkedCourses ?? 0);
      if (linked > 0) {
        notify.success(linked === 1 ? 'Your course from careerpathafrica.com is now in My courses' : `Your ${linked} courses from careerpathafrica.com are now in My courses`);
        router.replace('/teacher/courses');
        return;
      }
      router.replace('/teacher/dashboard');
    } catch (err: any) {
      const m = err.response?.data?.message;
      setError(Array.isArray(m) ? m.join(' · ') : m ?? 'Could not save your profile. Please try again.');
      setSaving(false);
    }
  }

  // Set like the sign-in pages' blue panel and student onboarding: navy headline with its last word in white, no icon above
  const title = step === 1 && form.firstName ? `Welcome, ${form.firstName}` : STEP_COPY[step].title;
  const words = title.split(' ');
  const lastWord = words.pop() ?? '';

  return (
    <div className="keep-light flex min-h-screen flex-col items-center bg-[#3F6FE8] px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-7 text-center">
          <h1 className="mx-auto max-w-[760px] text-[clamp(30px,4.2vw,48px)] font-extrabold leading-[1.05] tracking-[-0.035em] text-navy [text-wrap:balance]">
            {words.join(' ')} <span className="text-[#FFFFFF]">{lastWord}</span>
          </h1>
          <p className="mx-auto mt-3 max-w-[520px] text-[17px] leading-relaxed text-navy/80">{STEP_COPY[step].sub}</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            {([1, 2, 3, 4, 5] as const).map(n => (
              <span key={n} className={`h-2 rounded-full transition-all duration-300 ${
                step === n ? 'w-8 bg-[#FFFFFF]' : step > n ? 'w-2 bg-navy' : 'w-2 bg-[#FFFFFF]/40'
              }`} />
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-[10px] bg-white shadow-2xl">
          {loading ? (
            <div className="py-16 text-center text-sm text-royal/40">Loading your profile…</div>
          ) : (
            <div className="p-6 space-y-5">

              {step === 1 && (
                <>
                  <p className="rounded-lg bg-azure/[0.07] px-3.5 py-2.5 text-[12.5px] text-royal">Courses you wrote on careerpathafrica.com are added to your portal when you finish.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-navy">First name</span>
                      <input className={inputCls} value={form.firstName} onChange={e => set('firstName', e.target.value)} />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-navy">Last name</span>
                      <input className={inputCls} value={form.lastName} onChange={e => set('lastName', e.target.value)} />
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-navy">Country you teach from</span>
                    <Select value={form.countryId} onValueChange={v => set('countryId', v)} placeholder="Select your country"
                      options={countries.map(c => ({ value: c.id, label: c.name }))} />
                  </div>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-navy">Phone <span className="font-normal text-royal/40">(optional)</span></span>
                    <input className={inputCls} type="tel" placeholder="+237 6XX XXX XXX" value={form.phone} onChange={e => set('phone', e.target.value)} />
                  </label>
                </>
              )}

              {step === 2 && (
                <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-navy">Programmes</p>
                    <div className="flex flex-wrap gap-2">
                      {programmes.map(p => (
                        <Chip key={p.id} selected={form.teachingProgrammeIds.includes(p.id)} onClick={() => toggle('teachingProgrammeIds', p.id)}>
                          {p.shortName ?? p.name}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-navy">Subjects</p>
                    {subjectPool.length === 0 ? (
                      <p className="text-xs text-royal/40">No subjects found for the selected programmes.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {subjectPool.map(s => (
                          <Chip key={s.id} selected={form.teachingSubjectIds.includes(s.id)} onClick={() => toggle('teachingSubjectIds', s.id)}>
                            {s.name}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-navy">Teaching style</p>
                    <div className="grid grid-cols-3 gap-2">
                      {MODALITIES.map(m => (
                        <button key={m.value} type="button" onClick={() => set('teachingModality', m.value)} className={choiceCls(form.teachingModality === m.value)}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-navy">Highest qualification</p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {QUALIFICATIONS.map(q => (
                        <button key={q.value} type="button" onClick={() => set('qualification', q.value)} className={choiceCls(form.qualification === q.value)}>
                          {q.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="block space-y-1.5 max-w-[200px]">
                    <span className="text-xs font-semibold text-navy">Years of teaching experience</span>
                    <input className={inputCls} type="number" min={0} max={60} value={form.yearsExperience}
                      onChange={e => set('yearsExperience', e.target.value)} />
                  </label>
                </div>
              )}

              {step === 3 && (
                <>
                  <label className="block space-y-1.5">
                    <span className="flex justify-between text-xs font-semibold text-navy">
                      Bio
                      <span className={form.bio.trim().length >= 100 ? 'text-emerald-600' : 'text-royal/40'}>
                        {form.bio.trim().length}/100 min
                      </span>
                    </span>
                    <textarea className={`${inputCls} min-h-[140px] resize-y`} value={form.bio} onChange={e => set('bio', e.target.value)}
                      placeholder="Your teaching experience, the exams you prepare students for, and your approach." />
                  </label>
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-navy">CV <span className="font-normal text-royal/40">(optional · PDF or Word, max 10MB)</span></span>
                    <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="sr-only" onChange={handleFile} />
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                      className="flex w-full items-center gap-3 rounded-lg border-2 border-dashed border-cloud p-3 text-left text-sm text-royal/60 hover:border-azure/40 transition disabled:opacity-50">
                      <Icon name={form.documentUrl ? 'check' : 'upload'} size={16} className={form.documentUrl ? 'text-emerald-600' : 'text-azure'} />
                      {uploading ? 'Uploading…' : form.documentName || 'Upload your CV'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-navy">LinkedIn <span className="font-normal text-royal/40">(optional)</span></span>
                      <input className={inputCls} type="url" placeholder="https://linkedin.com/in/…" value={form.linkedinUrl} onChange={e => set('linkedinUrl', e.target.value)} />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-navy">Website <span className="font-normal text-royal/40">(optional)</span></span>
                      <input className={inputCls} type="url" placeholder="https://…" value={form.websiteUrl} onChange={e => set('websiteUrl', e.target.value)} />
                    </label>
                  </div>
                </>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  {introVideo ? (
                    <VideoEmbed url={introVideo} />
                  ) : (
                    <div className="rounded-lg bg-surface border border-cloud p-4 text-xs text-royal/60 leading-relaxed">
                      A 60–90 second video introducing yourself, what you teach, and how you help students prepare.
                      Teachers with a video are shown to students on the Mentorship page.
                    </div>
                  )}
                  <input ref={videoFileRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" onChange={handleVideoFile} />
                  <button type="button" onClick={() => videoFileRef.current?.click()} disabled={videoProgress !== null}
                    className="flex w-full items-center gap-3 rounded-lg border-2 border-dashed border-cloud p-3 text-left text-sm text-royal/60 hover:border-azure/40 transition disabled:opacity-60">
                    <Icon name="upload" size={16} className="text-azure" />
                    {videoProgress !== null
                      ? `Uploading… ${videoProgress}%`
                      : introVideo ? 'Replace with a video file (MP4, MOV, WebM · max 100 MB)' : 'Upload a video file (MP4, MOV, WebM · max 100 MB)'}
                  </button>
                  <div className="flex gap-2">
                    <input className={inputCls} type="url" placeholder="Or paste a YouTube / Vimeo link"
                      value={videoLink} onChange={e => setVideoLink(e.target.value)} />
                    <Button variant="secondary" loading={savingLink} disabled={!videoLink.trim()} onClick={handleVideoLink}>Save</Button>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="rounded-lg border border-azure/30 bg-azure/5 overflow-hidden">
                  <div className="px-4 py-3 border-b border-azure/20 flex items-center gap-2">
                    <p className="text-xs font-bold text-navy">Tutor Offer Letter &amp; Content Ownership Agreement</p>
                    <span className="ml-auto text-[10px] font-semibold text-azure bg-azure/10 px-2 py-0.5 rounded-md">Required</span>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    <p className="text-xs text-royal/70 leading-relaxed">
                      All course materials, lessons, recordings, quizzes, and related content you create for CareerPath Africa
                      become the property of CareerPath Africa. You also agree to the compensation, confidentiality, conduct,
                      and termination terms set out in the agreement.
                    </p>
                    <a href="/legal/tutor-agreement" target="_blank" rel="noreferrer" className="inline-block text-xs font-semibold text-azure hover:underline">
                      Read the full agreement ↗
                    </a>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-azure" checked={agreementAccepted}
                        onChange={e => setAgreementAccepted(e.target.checked)} />
                      <span className="text-xs text-navy/70 leading-relaxed">
                        I have read and agree to the <strong className="text-navy">Tutor Offer Letter &amp; Content Ownership Agreement</strong>,
                        including the intellectual-property assignment, compensation terms, and confidentiality obligations.
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {error && (
                <p role="alert" className="rounded-lg bg-red-50 border border-red-100 px-3.5 py-2.5 text-xs text-red-600">{error}</p>
              )}

              <div className="flex gap-2 pt-2 border-t border-cloud">
                {step > 1 && (
                  <Button variant="secondary" onClick={() => { setError(''); setStep(s => (s - 1) as Step); }}>
                    <Icon name="arrowLeft" size={13} /> Back
                  </Button>
                )}
                {step < 5 ? (
                  <Button className="flex-1" onClick={next} disabled={videoProgress !== null}>
                    {step === 4 && !introVideo ? 'I’ll add it later' : 'Continue'} <Icon name="arrowRight" size={13} />
                  </Button>
                ) : (
                  <Button className="flex-1" loading={saving} disabled={!agreementAccepted} onClick={submit}>
                    Finish &amp; go to dashboard <Icon name="check" size={13} />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-navy/70">You can update these details later from your profile</p>
      </div>
    </div>
  );
}
