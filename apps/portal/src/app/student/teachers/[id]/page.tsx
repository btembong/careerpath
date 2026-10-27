'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { notify } from '@/lib/notify';
import { Topbar } from '@/components/layout/Topbar';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { VideoEmbed } from '@/components/ui/VideoEmbed';
import api from '@/lib/api';

interface TeacherProfile {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  videoIntroUrl?: string;
  badge?: 'top_rated' | 'rising_star' | 'new' | null;
  bio?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  country?: { name: string; code: string };
  yearsExperience?: number;
  qualification?: string;
  subjectAreas: string[];
  teachingModality?: string;
  avgRating?: number;
  reviewCount: number;
  cohortCount: number;
  courseCount: number;
  courses: Array<{
    id: string;
    title: string;
    description?: string;
    imageUrl?: string;
    wpCourseUrl?: string;
    programme?: { name: string };
    subject?: { name: string };
  }>;
  reviews: Array<{
    id: string;
    rating: number;
    comment?: string;
    createdAt: string;
    student: { name: string; avatarUrl?: string };
  }>;
  availableSlots: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    durationMins: number;
  }>;
}

const BADGE_LABELS: Record<string, string> = { top_rated: 'Top Rated', rising_star: 'Rising Star', new: 'New' };
const BADGE_COLORS: Record<string, string> = {
  top_rated: 'bg-amber-100 text-amber-700',
  rising_star: 'bg-azure/10 text-azure',
  new: 'bg-green-100 text-green-700',
};

export default function TeacherProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'about' | 'courses' | 'reviews'>('about');
  const [startingChat, setStartingChat] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    api.get(`/teachers/${id}`)
      .then(r => setTeacher(r.data))
      .catch(() => router.push('/student/teachers'))
      .finally(() => setLoading(false));
  }, [id, router]);

  const startChat = async () => {
    setStartingChat(true);
    try {
      const r = await api.post('/messages/threads', { recipientId: id });
      router.push(`/student/messages?thread=${r.data.threadId}`);
    } catch { notify.error('Could not open chat'); setStartingChat(false); }
  };

  const submitReview = async () => {
    if (reviewRating === 0) { notify.error('Please select a rating'); return; }
    setSubmittingReview(true);
    try {
      await api.post(`/teachers/${id}/reviews`, { rating: reviewRating, comment: reviewComment });
      notify.success('Review submitted!');
      setReviewRating(0);
      setReviewComment('');
      const r = await api.get(`/teachers/${id}`);
      setTeacher(r.data);
    } catch {
      notify.error('Could not submit review');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar back />
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 space-y-5">
        <SkeletonCard lines={4} />
        <div className="rounded-2xl border border-cloud bg-white h-10 animate-pulse" />
        <SkeletonCard lines={3} />
      </div>
    </div>
  );

  if (!teacher) return null;

  const initials = [teacher.firstName?.[0], teacher.lastName?.[0]].filter(Boolean).join('') ||
    teacher.name[0].toUpperCase();

  // Strip HTML tags from course description for safe text-only render
  function stripHtml(html: string) {
    return html.replace(/<[^>]*>/g, '');
  }

  return (
    <div className="flex flex-col min-h-full bg-surface">
      <Topbar title={teacher.name} backHref="/student/teachers" backLabel="Teachers" />

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">

        {/* Hero card */}
        <div className="bg-white rounded-2xl border border-cloud p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0 flex flex-col items-center gap-3">
              {teacher.avatarUrl ? (
                <Image
                  src={teacher.avatarUrl}
                  alt={teacher.name}
                  width={96}
                  height={96}
                  className="rounded-2xl object-cover w-24 h-24"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-cloud flex items-center justify-center text-azure font-bold text-3xl">
                  {initials}
                </div>
              )}
              {/* Links */}
              <div className="flex gap-2">
                {teacher.linkedinUrl && (
                  <a href={teacher.linkedinUrl} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg bg-cloud flex items-center justify-center text-royal hover:bg-azure hover:text-white transition-colors">
                    <Icon name="linkedin" size={15} />
                  </a>
                )}
                {teacher.websiteUrl && (
                  <a href={teacher.websiteUrl} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg bg-cloud flex items-center justify-center text-royal hover:bg-azure hover:text-white transition-colors">
                    <Icon name="globe" size={15} />
                  </a>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-navy">{teacher.name}</h1>
                {teacher.badge && (
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${BADGE_COLORS[teacher.badge]}`}>
                    {BADGE_LABELS[teacher.badge]}
                  </span>
                )}
              </div>

              {teacher.country && (
                <p className="text-sm text-royal/50 flex items-center gap-1.5 mb-3">
                  <Icon name="location" size={14} />
                  {teacher.country.name}
                </p>
              )}

              {/* Rating bar */}
              {teacher.avgRating ? (
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex">
                    {[1,2,3,4,5].map(s => (
                      <Icon key={s} name="star" size={16}
                        className={s <= Math.round(teacher.avgRating!) ? 'text-amber-400' : 'text-cloud'} />
                    ))}
                  </div>
                  <span className="font-bold text-navy text-sm">{teacher.avgRating}</span>
                  <span className="text-sm text-royal/50">({teacher.reviewCount} review{teacher.reviewCount !== 1 ? 's' : ''})</span>
                </div>
              ) : (
                <p className="text-sm text-royal/50 mb-3">No reviews yet</p>
              )}

              {/* Stats pills */}
              <div className="flex flex-wrap gap-2 mb-4">
                {teacher.yearsExperience && (
                  <span className="inline-flex items-center gap-1.5 bg-cloud text-navy text-xs font-semibold px-3 py-1.5 rounded-full">
                    <Icon name="badge" size={13} className="text-azure" />
                    {teacher.yearsExperience} years exp.
                  </span>
                )}
                {teacher.qualification && (
                  <span className="inline-flex items-center gap-1.5 bg-cloud text-navy text-xs font-semibold px-3 py-1.5 rounded-full">
                    <Icon name="graduate" size={13} className="text-azure" />
                    {teacher.qualification}
                  </span>
                )}
                {teacher.teachingModality && (
                  <span className="inline-flex items-center gap-1.5 bg-cloud text-navy text-xs font-semibold px-3 py-1.5 rounded-full">
                    <Icon name="mentorship" size={13} className="text-azure" />
                    {teacher.teachingModality}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 bg-cloud text-navy text-xs font-semibold px-3 py-1.5 rounded-full">
                  <Icon name="courses" size={13} className="text-azure" />
                  {teacher.courseCount} course{teacher.courseCount !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Subject tags */}
              {teacher.subjectAreas.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {teacher.subjectAreas.map(s => (
                    <span key={s} className="text-xs bg-azure/10 text-azure px-2.5 py-1 rounded-full font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* CTA buttons */}
            <div className="flex-shrink-0 flex flex-col gap-2">
              {teacher.availableSlots.length > 0 && (
                <Link href={`/student/mentorship?teacher=${teacher.id}`}
                  className="inline-flex items-center gap-2 bg-azure text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-royal transition-colors">
                  <Icon name="calendar" size={15} />
                  Book Session
                </Link>
              )}
              <button onClick={startChat} disabled={startingChat}
                className="inline-flex items-center gap-2 bg-cloud text-navy px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-azure hover:text-white transition-colors disabled:opacity-50">
                <Icon name="community" size={15} />
                {startingChat ? 'Opening…' : 'Message'}
              </button>
            </div>
          </div>
        </div>

        {/* Video intro */}
        {teacher.videoIntroUrl && (
          <div className="bg-white rounded-2xl border border-cloud p-4 mb-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-3">Intro video</p>
            <VideoEmbed url={teacher.videoIntroUrl} />

          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-cloud rounded-xl p-1 mb-6">
          {(['about', 'courses', 'reviews'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg capitalize transition-colors ${
                tab === t ? 'bg-azure text-white' : 'text-royal/50 hover:text-navy'
              }`}
            >
              {t === 'courses' ? `Courses (${teacher.courseCount})` :
               t === 'reviews' ? `Reviews (${teacher.reviewCount})` : 'About'}
            </button>
          ))}
        </div>

        {/* About tab */}
        {tab === 'about' && (
          <div className="space-y-6">
            {teacher.bio && (
              <div className="bg-white rounded-2xl border border-cloud p-6">
                <h2 className="font-bold text-navy mb-3 flex items-center gap-2">
                  <Icon name="user" size={18} className="text-azure" />
                  About {teacher.firstName || teacher.name}
                </h2>
                <p className="text-sm text-navy/70 leading-relaxed whitespace-pre-line">{teacher.bio}</p>
              </div>
            )}

            {/* Available slots */}
            {teacher.availableSlots.length > 0 && (
              <div className="bg-white rounded-2xl border border-cloud p-6">
                <h2 className="font-bold text-navy mb-4 flex items-center gap-2">
                  <Icon name="calendar" size={18} className="text-azure" />
                  Available Mentorship Slots
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {teacher.availableSlots.map(slot => (
                    <div key={slot.id} className="flex items-center justify-between bg-cloud rounded-xl px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-navy">
                          {new Date(slot.startsAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                        <p className="text-xs text-royal/50">
                          {new Date(slot.startsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          {' · '}{slot.durationMins} min
                        </p>
                      </div>
                      <Link href={`/student/mentorship?teacher=${teacher.id}&slot=${slot.id}`}
                        className="text-xs font-semibold text-azure hover:text-royal">
                        Book
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Courses tab */}
        {tab === 'courses' && (
          <div className="space-y-4">
            {teacher.courses.length === 0 ? (
              <div className="bg-white rounded-2xl border border-cloud p-12 text-center text-royal/50">
                No published courses yet.
              </div>
            ) : (
              teacher.courses.map(course => (
                <div key={course.id} className="bg-white rounded-2xl border border-cloud overflow-hidden flex">
                  {/* Course image */}
                  <div className="w-28 h-24 flex-shrink-0 bg-cloud relative">
                    {course.imageUrl ? (
                      <Image src={course.imageUrl} alt={course.title} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon name="courses" size={28} className="text-royal/30" />
                      </div>
                    )}
                  </div>
                  {/* Course info */}
                  <div className="p-4 flex-1 min-w-0">
                    <h3 className="font-semibold text-navy text-sm mb-1 line-clamp-1">{course.title}</h3>
                    {course.description && (
                      <p className="text-xs text-royal/50 line-clamp-2 mb-2">
                        {stripHtml(course.description)}
                      </p>
                    )}
                    <div className="flex items-center gap-3">
                      {course.programme && (
                        <span className="text-xs bg-cloud text-royal px-2 py-0.5 rounded-full font-medium">
                          {course.programme.name}
                        </span>
                      )}
                      {course.subject && (
                        <span className="text-xs bg-cloud text-royal px-2 py-0.5 rounded-full font-medium">
                          {course.subject.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Reviews tab */}
        {tab === 'reviews' && (
          <div className="space-y-6">
            {/* Write review */}
            <div className="bg-white rounded-2xl border border-cloud p-6">
              <h2 className="font-bold text-navy mb-4 flex items-center gap-2">
                <Icon name="star" size={18} className="text-azure" />
                Leave a Review
              </h2>
              <div className="flex gap-1 mb-4">
                {[1,2,3,4,5].map(s => (
                  <button key={s} onClick={() => setReviewRating(s)} className="p-0.5">
                    <Icon name="star" size={28}
                      className={s <= reviewRating ? 'text-amber-400' : 'text-cloud hover:text-amber-200'} />
                  </button>
                ))}
              </div>
              <textarea
                value={reviewComment}
                onChange={e => setReviewComment(e.target.value)}
                placeholder="Share your experience with this teacher (optional)..."
                rows={3}
                className="w-full border border-cloud rounded-xl p-3 text-sm text-navy resize-none focus:outline-none focus:border-azure mb-4"
              />
              <button
                onClick={submitReview}
                disabled={submittingReview || reviewRating === 0}
                className="bg-azure text-white px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-royal transition-colors"
              >
                {submittingReview ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>

            {/* Existing reviews */}
            {teacher.reviews.length === 0 ? (
              <div className="bg-white rounded-2xl border border-cloud p-12 text-center text-royal/50">
                No reviews yet. Be the first!
              </div>
            ) : (
              teacher.reviews.map(review => (
                <div key={review.id} className="bg-white rounded-2xl border border-cloud p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {review.student.avatarUrl ? (
                        <Image src={review.student.avatarUrl} alt={review.student.name}
                          width={36} height={36} className="rounded-full w-9 h-9 object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-cloud flex items-center justify-center text-azure font-bold text-sm">
                          {review.student.name[0]}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-navy text-sm">{review.student.name}</p>
                        <p className="text-xs text-royal/50">
                          {new Date(review.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex">
                      {[1,2,3,4,5].map(s => (
                        <Icon key={s} name="star" size={14}
                          className={s <= review.rating ? 'text-amber-400' : 'text-cloud'} />
                      ))}
                    </div>
                  </div>
                  {review.comment && (
                    <p className="text-sm text-navy/70 leading-relaxed">{review.comment}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
}
