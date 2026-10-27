'use client';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Category = 'account' | 'billing' | 'courses' | 'technical' | 'other';

const CATEGORIES: { value: Category; label: string; icon: 'user' | 'wallet' | 'courses' | 'settings' | 'hash' }[] = [
  { value: 'account',   label: 'Account',   icon: 'user'     },
  { value: 'billing',   label: 'Billing',   icon: 'wallet'   },
  { value: 'courses',   label: 'Courses',   icon: 'courses'  },
  { value: 'technical', label: 'Technical', icon: 'settings' },
  { value: 'other',     label: 'Other',     icon: 'hash'     },
];

const FAQS = [
  {
    q: 'How do I access my purchased courses?',
    a: 'Go to My Courses in the navigation. All courses linked to your active packages and individual purchases appear there.',
  },
  {
    q: 'My payment went through but I can\'t see my package.',
    a: 'It can take up to 5 minutes for a payment to be verified. Try refreshing the page. If the issue persists after 10 minutes, raise a support ticket.',
  },
  {
    q: 'How do I download my certificate?',
    a: 'Go to Certificates in the navigation. Each earned certificate has a Download PDF button. Certificates are issued automatically once a course is marked complete.',
  },
  {
    q: 'Can I change my email address?',
    a: 'Email addresses cannot be changed self-service. Contact support and our team will assist you after verifying your identity.',
  },
  {
    q: 'How do I join a live class?',
    a: 'Go to Live Classes and click Join on any active or upcoming session. You will be taken directly into the virtual classroom.',
  },
  {
    q: 'What is the referral programme?',
    a: 'You earn wallet credits for every friend who signs up and purchases a package using your referral link. Visit the Refer & Earn page for details.',
  },
];

const CONTACT = [
  { icon: 'mail'      as const, label: 'Email support', value: 'support@careerpathafrica.com', href: 'mailto:support@careerpathafrica.com' },
  { icon: 'community' as const, label: 'WhatsApp',       value: 'Chat with us',                 href: 'https://wa.me/237600000000'          },
];

export default function StudentSupportPage() {
  const [open, setOpen] = useState<number | null>(null);
  const [category, setCategory] = useState<Category>('account');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) { notify.error('Please fill in all fields.'); return; }
    setSending(true);
    try {
      await api.post('/support/tickets', { category, subject: subject.trim(), message: message.trim() });
      setSent(true);
      notify.success('Ticket submitted! We\'ll respond within 24 hours.');
    } catch {
      // Fallback: open mailto
      window.location.href = `mailto:support@careerpathafrica.com?subject=${encodeURIComponent(`[${category.toUpperCase()}] ${subject}`)}&body=${encodeURIComponent(message)}`;
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Help & Support" subtitle="We're here to help" backHref="/student/dashboard" backLabel="Dashboard" />

      <div className="flex-1 p-4 md:p-6 space-y-6 max-w-2xl w-full mx-auto">

        {/* ── Contact quick-links ────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          {CONTACT.map(c => (
            <a key={c.label} href={c.href} target="_blank" rel="noreferrer"
              className="flex flex-col items-center gap-2 rounded-2xl border border-cloud bg-white p-4
                         text-center hover:shadow-sm hover:border-azure/30 active:scale-[0.97] transition-all">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cloud">
                <Icon name={c.icon} size={20} className="text-azure" />
              </div>
              <p className="text-xs font-bold text-navy">{c.label}</p>
              <p className="text-[10px] text-royal/50">{c.value}</p>
            </a>
          ))}
        </div>

        {/* ── FAQ accordion ─────────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40 mb-3">Frequently asked questions</p>
          <Card padding="none" className="divide-y divide-cloud overflow-hidden">
            {FAQS.map((faq, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-surface transition">
                  <p className="text-sm font-semibold text-navy flex-1 leading-snug">{faq.q}</p>
                  <Icon
                    name="chevronDown"
                    size={16}
                    className={`text-royal/40 flex-shrink-0 transition-transform duration-200 ${open === i ? 'rotate-180' : ''}`}
                  />
                </button>
                {open === i && (
                  <div className="px-5 pb-4 -mt-1">
                    <p className="text-sm text-royal/60 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </Card>
        </div>

        {/* ── Submit ticket ──────────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40 mb-3">Submit a ticket</p>

          {sent ? (
            <Card className="flex flex-col items-center py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-azure/10 mb-3">
                <Icon name="check" size={24} className="text-azure" />
              </div>
              <p className="text-sm font-bold text-navy">Ticket submitted!</p>
              <p className="text-xs text-royal/50 mt-1">We'll get back to you within 24 hours.</p>
              <button onClick={() => { setSent(false); setSubject(''); setMessage(''); }}
                className="mt-4 text-xs font-semibold text-azure hover:text-royal transition">
                Submit another ticket
              </button>
            </Card>
          ) : (
            <Card padding="md">
              <form onSubmit={submit} className="space-y-4">
                {/* Category */}
                <div>
                  <label className="text-xs font-semibold text-navy mb-2 block">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(cat => (
                      <button key={cat.value} type="button"
                        onClick={() => setCategory(cat.value)}
                        className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all
                          ${category === cat.value
                            ? 'bg-azure text-white'
                            : 'border border-cloud bg-white text-navy hover:border-azure/30'}`}>
                        <Icon name={cat.icon} size={13} />
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subject */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-navy">Subject</label>
                  <input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Brief description of your issue"
                    required
                    className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy
                               outline-none focus:border-azure placeholder:text-royal/30"
                  />
                </div>

                {/* Message */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-navy">Message</label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Describe the issue in detail — include any error messages or steps to reproduce."
                    required
                    rows={5}
                    className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy
                               outline-none focus:border-azure placeholder:text-royal/30 resize-none"
                  />
                  <p className="text-[10px] text-royal/40">{message.length}/500 characters</p>
                </div>

                <Button type="submit" loading={sending} fullWidth>
                  <Icon name="mail" size={14} /> Send ticket
                </Button>
              </form>
            </Card>
          )}
        </div>

        {/* ── Response time note ─────────────────────────────────────── */}
        <Card className="flex items-center gap-3 p-4 border-azure/20 bg-azure/5">
          <Icon name="clock" size={18} className="text-azure flex-shrink-0" />
          <p className="text-xs text-royal/70 leading-relaxed">
            <strong className="text-navy">Typical response time: 24 hours.</strong>{' '}
            For urgent issues, use WhatsApp for faster support.
          </p>
        </Card>

      </div>
    </div>
  );
}
