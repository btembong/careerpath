'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { notify } from '@/lib/notify';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

interface Post {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; firstName: string | null; lastName: string | null; email: string };
  replies?: Post[];
}

function PostCard({ post, courseId, onReply }: { post: Post; courseId: string; onReply: () => void }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [posting, setPosting] = useState(false);

  const authorName = post.author.firstName || post.author.lastName
    ? `${post.author.firstName ?? ''} ${post.author.lastName ?? ''}`.trim()
    : post.author.email;

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim()) return;
    setPosting(true);
    try {
      await api.post(`/community/courses/${courseId}/discussion`, {
        body: replyText.trim(),
        parentId: post.id,
      });
      setReplyText('');
      setReplyOpen(false);
      onReply();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to post reply');
    } finally { setPosting(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-azure text-xs font-bold text-white">
          {(post.author.firstName ?? post.author.email ?? 'S')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="text-xs font-semibold text-navy">{authorName}</p>
            <p className="text-[10px] text-royal/40">
              {new Date(post.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              {' '}
              {new Date(post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <p className="text-sm text-navy/80 mt-1 leading-relaxed whitespace-pre-wrap">{post.body}</p>
          <button onClick={() => setReplyOpen(v => !v)}
            className="mt-1.5 text-[10px] font-semibold text-azure hover:underline">
            Reply
          </button>

          {replyOpen && (
            <form onSubmit={submitReply} className="mt-2 flex gap-2">
              <input value={replyText} onChange={e => setReplyText(e.target.value)} required
                placeholder="Write a reply…"
                className="flex-1 rounded-xl border border-cloud px-3 py-2 text-xs text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/15 placeholder:text-royal/30" />
              <Button type="submit" size="sm" loading={posting}>Post</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setReplyOpen(false)}>Cancel</Button>
            </form>
          )}

          {/* Replies */}
          {post.replies && post.replies.length > 0 && (
            <div className="mt-3 pl-4 border-l-2 border-cloud space-y-3">
              {post.replies.map(reply => (
                <PostCard key={reply.id} post={reply} courseId={courseId} onReply={onReply} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CourseDiscussionPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    const r = await api.get(`/community/courses/${courseId}/discussion`);
    setPosts(r.data ?? []);
  }

  useEffect(() => {
    load().catch(() => notify.error('Failed to load discussion')).finally(() => setLoading(false));
  }, [courseId]);

  async function postMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    try {
      await api.post(`/community/courses/${courseId}/discussion`, { body: body.trim() });
      setBody('');
      await load();
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to post');
    } finally { setPosting(false); }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full bg-surface">
      <SkeletonTopbar />
      <div className="flex-1 p-4 md:p-6 max-w-3xl mx-auto w-full space-y-3">
        {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-cloud animate-pulse" />)}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full bg-surface">
      <Topbar
        title="Course Discussion"
        subtitle={`${posts.length} post${posts.length !== 1 ? 's' : ''}`}
        backHref={`/teacher/courses/${courseId}/builder`}
        backLabel="Builder"
      />

      <div className="flex-1 p-6 max-w-2xl w-full mx-auto space-y-4">

        {posts.length === 0 ? (
          <Card padding="lg">
            <div className="flex flex-col items-center py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-azure/10 mb-3">
                <Icon name="community" size={20} className="text-azure" />
              </div>
              <p className="text-sm font-semibold text-navy">No discussion yet</p>
              <p className="text-xs text-royal/50 mt-1">Be the first to post — your students will see this.</p>
            </div>
          </Card>
        ) : (
          <Card padding="md">
            <div className="space-y-5 divide-y divide-cloud">
              {posts.map((post, i) => (
                <div key={post.id} className={i > 0 ? 'pt-5' : ''}>
                  <PostCard post={post} courseId={courseId} onReply={load} />
                </div>
              ))}
            </div>
          </Card>
        )}

        <div ref={bottomRef} />

        {/* Compose */}
        <Card padding="md" className="sticky bottom-6">
          <form onSubmit={postMessage} className="flex gap-3">
            <textarea value={body} onChange={e => setBody(e.target.value)} required rows={2}
              placeholder="Post an announcement or answer a student question…"
              className="flex-1 rounded-xl border border-cloud px-3 py-2.5 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/15 resize-none placeholder:text-royal/30" />
            <Button type="submit" loading={posting} className="self-end">
              <Icon name="arrowRight" size={14} /> Post
            </Button>
          </form>
        </Card>

      </div>
    </div>
  );
}
