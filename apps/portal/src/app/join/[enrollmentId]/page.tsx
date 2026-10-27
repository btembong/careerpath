'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import api, { setAuthToken } from '@/lib/api';

type Step = 'form' | 'otp' | 'done';

interface ClaimResult {
  message: string;
  packageName: string;
  expiresAt: string | null;
  accessToken?: string;
}

export default function JoinPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const router = useRouter();

  const [step, setStep]           = useState<Step>('form');
  const [form, setForm]           = useState({ inviteEmail: '', firstName: '', lastName: '', password: '' });
  const [otp, setOtp]             = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [error, setError]         = useState('');
  const [result, setResult]       = useState<ClaimResult | null>(null);
  const [cooldown, setCooldown]   = useState(0);
  const [shake, setShake]         = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);

  // Resend countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  function triggerError(msg: string) {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }

  function set(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  // Step 1: validate form then send OTP
  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) { triggerError('Password must be at least 8 characters.'); return; }
    setError('');
    setOtpSending(true);
    try {
      await api.post('/auth/otp/send', { email: form.inviteEmail });
      setStep('otp');
      setCooldown(60);
      setTimeout(() => otpRef.current?.focus(), 100);
    } catch (err: any) {
      triggerError(err.response?.data?.message ?? 'Could not send verification code. Please try again.');
    } finally {
      setOtpSending(false);
    }
  }

  // Resend OTP
  async function resendOtp() {
    if (cooldown > 0) return;
    setError('');
    try {
      await api.post('/auth/otp/send', { email: form.inviteEmail });
      setCooldown(60);
    } catch { /* silent */ }
  }

  // Step 2: verify OTP then claim seat
  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (otp.trim().length < 6) { triggerError('Enter all 6 digits.'); return; }
    setError('');
    setSubmitting(true);
    try {
      // Verify OTP first
      await api.post('/auth/otp/verify', { email: form.inviteEmail, code: otp.trim() });
      // Then claim the seat
      const r = await api.post(`/org/org-enrollments/${enrollmentId}/claim`, {
        inviteEmail: form.inviteEmail,
        firstName: form.firstName,
        lastName: form.lastName,
        password: form.password,
      });
      const data: ClaimResult = r.data;
      // If the API returns a token, set it
      if (data.accessToken) {
        await setAuthToken(data.accessToken, true);
      }
      setResult(data);
      setStep('done');
    } catch (err: any) {
      triggerError(err.response?.data?.message ?? 'Verification failed. Please try again.');
      setOtp('');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (step === 'done' && result) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <Card padding="lg" className="w-full max-w-md">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-azure flex-shrink-0">
              <Icon name="certificates" size={22} className="text-white" />
            </div>
            <div>
              <p className="text-base font-bold text-navy">You're in!</p>
              <p className="text-xs text-royal/50">Seat claimed successfully</p>
            </div>
          </div>

          <div className="rounded-xl bg-surface border border-cloud px-4 py-3 mb-5 space-y-1.5">
            <div className="flex items-center gap-2">
              <Icon name="courses" size={12} className="text-royal/40" />
              <p className="text-xs text-royal/50">Package</p>
              <p className="text-xs font-semibold text-navy ml-auto">{result.packageName}</p>
            </div>
            {result.expiresAt && (
              <div className="flex items-center gap-2">
                <Icon name="live" size={12} className="text-royal/40" />
                <p className="text-xs text-royal/50">Access until</p>
                <p className="text-xs font-semibold text-navy ml-auto">
                  {new Date(result.expiresAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>

          <p className="text-sm text-royal/60 mb-5">{result.message}</p>

          <Button onClick={() => router.push('/student/dashboard')} className="w-full">
            Go to dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5">

        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy">
              <span className="text-sm font-black text-white">C</span>
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-navy leading-tight">CareerPath</p>
              <p className="text-xs text-royal/60">Africa</p>
            </div>
          </div>
          <h1 className="text-xl font-black text-navy">You've been invited</h1>
          <p className="text-sm text-royal/50 mt-1">
            {step === 'form'
              ? 'Claim your seat to access your learning package'
              : `Enter the 6-digit code sent to ${form.inviteEmail}`}
          </p>
        </div>

        <Card padding="md">
          {/* Error banner */}
          {error && (
            <div className={`mb-4 flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 ${shake ? 'animate-[shake_0.5s_ease]' : ''}`}>
              <Icon name="close" size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* ── Step 1: Account details ───────────────────────────────── */}
          {step === 'form' && (
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Invite email</label>
                <input
                  type="email"
                  value={form.inviteEmail}
                  onChange={e => set('inviteEmail', e.target.value)}
                  required
                  placeholder="your.invite@email.com"
                  className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40"
                />
                <p className="text-[10px] text-royal/40">Must match the email your organisation registered</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">First name</label>
                  <input
                    value={form.firstName}
                    onChange={e => set('firstName', e.target.value)}
                    required
                    placeholder="Ada"
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Last name</label>
                  <input
                    value={form.lastName}
                    onChange={e => set('lastName', e.target.value)}
                    required
                    placeholder="Okafor"
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Create password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  required
                  placeholder="Min. 8 characters"
                  minLength={8}
                  className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40"
                />
              </div>

              <Button type="submit" loading={otpSending} className="w-full">
                {otpSending ? 'Sending code…' : 'Continue — verify email'}
              </Button>
            </form>
          )}

          {/* ── Step 2: OTP verification ──────────────────────────────── */}
          {step === 'otp' && (
            <form onSubmit={handleOtpSubmit} className="space-y-5">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-azure/10">
                  <Icon name="assignments" size={24} className="text-azure" />
                </div>
                <div>
                  <p className="text-sm font-bold text-navy">Check your email</p>
                  <p className="text-xs text-royal/50 mt-0.5">
                    We sent a 6-digit code to <strong className="text-navy">{form.inviteEmail}</strong>
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-navy/70">Verification code</label>
                <input
                  ref={otpRef}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  className="w-full rounded-xl border-2 border-cloud bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] font-bold text-navy outline-none focus:border-azure transition placeholder:tracking-normal placeholder:text-base placeholder:font-normal placeholder:text-royal/30"
                />
              </div>

              <Button
                type="submit"
                loading={submitting}
                disabled={otp.length < 6}
                className="w-full">
                {submitting ? 'Claiming seat…' : 'Verify & claim seat'}
              </Button>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => { setStep('form'); setOtp(''); setError(''); }}
                  className="text-royal/50 hover:text-navy transition">
                  ← Change email
                </button>
                <button
                  type="button"
                  onClick={resendOtp}
                  disabled={cooldown > 0}
                  className="font-semibold text-azure disabled:text-royal/40 disabled:cursor-not-allowed transition">
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}
        </Card>

        <p className="text-center text-xs text-royal/40">
          Already have an account?{' '}
          <button onClick={() => router.push('/login')} className="text-azure font-semibold hover:underline">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
