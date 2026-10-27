'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';

type Tab = 'stories' | 'discussions' | 'share';

interface DiscussionPost {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; firstName: string | null; lastName: string | null; email: string };
  replies: DiscussionPost[];
}

interface CourseOption {
  id: string;
  title: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Story {
  id: string; story?: string; body?: string;
  publishedAt?: string; createdAt: string;
  student?: { firstName?: string | null; lastName?: string | null; email?: string };
}

export default function CommunityPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('stories');

  // Stories state
  const [stories, setStories] = useState<Story[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [form, setForm] = useState({ story: '', consentToPublish: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Discussions state
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [posts, setPosts] = useState<DiscussionPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postBody, setPostBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    api.get('/community/success-stories/published')
      .then(r => setStories(r.data))
      .catch(() => {})
      .finally(() => setStoriesLoading(false));
  }, []);

  // Load enrolled courses for discussions (packages + individual purchases)
  useEffect(() => {
    api.get('/portals/student/courses').then(r => {
      const seen = new Set<string>();
      const list: CourseOption[] = [];
      for (const pkg of r.data?.packages ?? []) {
        for (const c of pkg.courses ?? []) {
          if (!seen.has(c.id)) { seen.add(c.id); list.push({ id: c.id, title: c.title }); }
        }
      }
      for (const c of r.data?.individualCourses ?? []) {
        if (!seen.has(c.id)) { seen.add(c.id); list.push({ id: c.id, title: c.title }); }
      }
      setCourses(list);
      if (list.length > 0) setSelectedCourse(list[0].id);
    }).catch(() => {});
  }, []);

  async function loadPosts(courseId: string) {
    if (!courseId) return;
    setPostsLoading(true);
    try {
      const r = await api.get(`/community/courses/${courseId}/discussion`);
      setPosts(r.data ?? []);
    } catch {
      setPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'discussions' && selectedCourse) loadPosts(selectedCourse);
  }, [tab, selectedCourse]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!postBody.trim() || !selectedCourse) return;
    setPosting(true);
    try {
      await api.post(`/community/courses/${selectedCourse}/discussion`, { body: postBody.trim() });
      setPostBody('');
      await loadPosts(selectedCourse);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Could not post');
    } finally {
      setPosting(false);
    }
  }

  async function handleReply(postId: string) {
    if (!replyBody.trim() || !selectedCourse) return;
    setReplyingId(postId);
    try {
      await api.post(`/community/courses/${selectedCourse}/discussion`, { body: replyBody.trim(), parentId: postId });
      setReplyTo(null);
      setReplyBody('');
      await loadPosts(selectedCourse);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Could not reply');
    } finally {
      setReplyingId(null);
    }
  }

  async function handleDelete(postId: string) {
    if (!selectedCourse) return;
    setDeleteConfirm(null);
    try {
      await api.delete(`/community/courses/${selectedCourse}/discussion/${postId}`);
      await loadPosts(selectedCourse);
    } catch {}
  }

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/community/success-stories', form);
      setSubmitted(true);
      setForm({ story: '', consentToPublish: false });
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  function authorName(a: DiscussionPost['author']) {
    return [a.firstName, a.lastName].filter(Boolean).join(' ') || 'Student';
  }

  function initials(a: DiscussionPost['author']) {
    return [a.firstName?.[0], a.lastName?.[0]].filter(Boolean).join('').toUpperCase() || 'S';
  }

  if (storiesLoading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-5">
        <div className="flex gap-1 rounded-xl border border-cloud bg-surface p-1 w-fit">
          {[1,2,3].map(i => <div key={i} className="rounded-lg px-10 py-2 bg-cloud animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[1,2,3,4].map(i => <SkeletonCard key={i} lines={3} />)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Community" subtitle="Stories, discussions and peer support" />
      <div className="flex-1 p-6 space-y-5">

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-cloud bg-surface p-1 w-fit flex-wrap">
          {([
            ['stories', 'Success Stories'],
            ['discussions', 'Discussions'],
            ['share', 'Share Your Story'],
          ] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${tab === t ? 'bg-white text-navy shadow-sm border border-cloud' : 'text-royal/50 hover:text-navy'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Success Stories */}
        {tab === 'stories' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-navy">{stories.length} published stor{stories.length !== 1 ? 'ies' : 'y'}</h2>
            </div>
            {stories.length === 0 ? (
              <Card padding="lg">
                <EmptyState
                  icon="star"
                  title="No stories yet"
                  description="Be the first to share your success story with the community"
                  action={{ label: "Share yours", onClick: () => setTab('share') }}
                />
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {stories.map(s => (
                  <Card key={s.id} padding="none" className="overflow-hidden">
                    <div className="bg-navy p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-azure text-sm font-bold text-white flex-shrink-0">
                          {(s.student?.firstName ?? s.student?.email ?? 'S')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white">
                            {s.student?.firstName || s.student?.lastName
                              ? `${s.student.firstName ?? ''} ${s.student.lastName ?? ''}`.trim()
                              : (s.student?.email ?? 'Anonymous')}
                          </p>
                          <p className="text-[10px] text-white/40">
                            {new Date(s.publishedAt ?? s.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="p-5">
                      <p className="text-sm text-royal/70 leading-relaxed line-clamp-4">{s.story ?? s.body}</p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Course Discussions */}
        {tab === 'discussions' && (
          <div className="space-y-4 max-w-2xl">
            {courses.length === 0 ? (
              <Card padding="lg">
                <EmptyState
                  icon="courses"
                  title="No enrolled courses"
                  description="Enrol in a course to access course discussions"
                />
              </Card>
            ) : (
              <>
                {/* Course selector */}
                <div>
                  <label className="block text-xs font-semibold text-navy mb-1.5">Select course</label>
                  <select
                    value={selectedCourse}
                    onChange={e => setSelectedCourse(e.target.value)}
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure">
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>

                {/* New post */}
                <form onSubmit={handlePost} className="flex gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-azure/20 text-xs font-bold text-azure">
                    Me
                  </div>
                  <div className="flex-1 space-y-2">
                    <textarea
                      value={postBody}
                      onChange={e => setPostBody(e.target.value)}
                      placeholder="Ask a question or start a discussion…"
                      rows={3}
                      className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy placeholder:text-royal/30 focus:outline-none focus:border-azure resize-none"
                    />
                    {postBody.trim() && (
                      <Button type="submit" size="sm" loading={posting}>Post</Button>
                    )}
                  </div>
                </form>

                {/* Posts list */}
                {postsLoading ? (
                  <p className="text-sm text-royal/40">Loading…</p>
                ) : posts.length === 0 ? (
                  <Card padding="md">
                    <p className="text-sm text-royal/40 text-center py-4">No posts yet. Start the conversation!</p>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {posts.map(post => (
                      <Card key={post.id} padding="md">
                        <div className="flex gap-3">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-azure/10 text-xs font-bold text-azure">
                            {initials(post.author)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-navy">{authorName(post.author)}</span>
                              <span className="text-[10px] text-royal/40">{timeAgo(post.createdAt)}</span>
                            </div>
                            <p className="text-sm text-royal/70 leading-relaxed whitespace-pre-wrap">{post.body}</p>
                            <div className="flex items-center gap-3 mt-2">
                              <button onClick={() => { setReplyTo(replyTo === post.id ? null : post.id); setReplyBody(''); }}
                                className="text-[11px] text-royal/40 hover:text-azure transition">
                                {replyTo === post.id ? 'Cancel' : 'Reply'}
                              </button>
                              {user?.id === post.author.id && (
                                deleteConfirm === post.id ? (
                                  <span className="flex items-center gap-1.5">
                                    <button onClick={() => handleDelete(post.id)}
                                      className="text-[11px] text-red-500 font-semibold hover:text-red-400 transition">Confirm delete</button>
                                    <button onClick={() => setDeleteConfirm(null)}
                                      className="text-[11px] text-royal/40 hover:text-navy transition">Cancel</button>
                                  </span>
                                ) : (
                                  <button onClick={() => setDeleteConfirm(post.id)}
                                    className="text-[11px] text-royal/30 hover:text-red-400 transition">Delete</button>
                                )
                              )}
                            </div>

                            {replyTo === post.id && (
                              <div className="mt-3 flex gap-2">
                                <textarea
                                  value={replyBody}
                                  onChange={e => setReplyBody(e.target.value)}
                                  placeholder="Write a reply…"
                                  rows={2}
                                  autoFocus
                                  className="flex-1 rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy placeholder:text-royal/30 focus:outline-none focus:border-azure resize-none"
                                />
                                <button onClick={() => handleReply(post.id)}
                                  disabled={!replyBody.trim() || replyingId === post.id}
                                  className="self-end rounded-xl bg-azure px-3 py-2 text-xs font-bold text-white hover:bg-royal transition disabled:opacity-40">
                                  {replyingId === post.id ? '…' : 'Reply'}
                                </button>
                              </div>
                            )}

                            {post.replies.length > 0 && (
                              <div className="mt-3 space-y-3 pl-4 border-l-2 border-cloud">
                                {post.replies.map(reply => (
                                  <div key={reply.id} className="flex gap-2">
                                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-cloud text-[9px] font-bold text-royal">
                                      {initials(reply.author)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-[11px] font-semibold text-navy">{authorName(reply.author)}</span>
                                        <span className="text-[10px] text-royal/30">{timeAgo(reply.createdAt)}</span>
                                      </div>
                                      <p className="text-xs text-royal/60 leading-relaxed whitespace-pre-wrap">{reply.body}</p>
                                      {user?.id === reply.author.id && (
                                        deleteConfirm === reply.id ? (
                                          <span className="flex items-center gap-1.5 mt-1">
                                            <button onClick={() => handleDelete(reply.id)}
                                              className="text-[10px] text-red-500 font-semibold hover:text-red-400 transition">Confirm delete</button>
                                            <button onClick={() => setDeleteConfirm(null)}
                                              className="text-[10px] text-royal/40 hover:text-navy transition">Cancel</button>
                                          </span>
                                        ) : (
                                          <button onClick={() => setDeleteConfirm(reply.id)}
                                            className="text-[10px] text-royal/30 hover:text-red-400 transition mt-1">Delete</button>
                                        )
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Share Story */}
        {tab === 'share' && (
          <div className="max-w-lg">
            {submitted ? (
              <Card padding="lg">
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cloud mb-3">
                    <Icon name="check" size={24} className="text-azure" />
                  </div>
                  <p className="text-base font-bold text-navy">Story submitted!</p>
                  <p className="text-sm text-royal/60 mt-2 max-w-sm">Your story is under review. It will be published once approved by the team.</p>
                  <button onClick={() => { setSubmitted(false); setTab('stories'); }}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-azure px-4 py-2.5 text-sm font-semibold text-white hover:bg-royal transition">
                    Back to stories <Icon name="arrowRight" size={14} />
                  </button>
                </div>
              </Card>
            ) : (
              <Card padding="md">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-4">SHARE YOUR STORY</p>
                <form onSubmit={handleShare} className="space-y-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-navy">Your story</label>
                    <textarea value={form.story} onChange={e => setForm(f => ({ ...f, story: e.target.value }))} required rows={7}
                      placeholder="Share your journey, what you learned, and how CareerPath Africa helped you…"
                      className="w-full rounded-xl border border-cloud bg-white px-4 py-3 text-sm text-navy outline-none transition resize-none focus:border-azure focus:ring-2 focus:ring-azure/15 placeholder:text-royal/40" />
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.consentToPublish}
                      onChange={e => setForm(f => ({ ...f, consentToPublish: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-cloud accent-azure" />
                    <span className="text-xs text-royal/70 leading-relaxed">
                      I consent to my story being published on the CareerPath Africa community page
                    </span>
                  </label>
                  <Button type="submit" fullWidth loading={submitting} size="lg" disabled={!form.consentToPublish}>Submit story</Button>
                </form>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
