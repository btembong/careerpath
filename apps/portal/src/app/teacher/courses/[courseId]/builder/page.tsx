'use client';
import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { useDropzone } from 'react-dropzone';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { notify } from '@/lib/notify';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import api from '@/lib/api';

interface Attachment { id: string; name: string; url: string; fileType: string | null; }
interface Lesson {
  id: string; title: string; type: string; videoUrl: string | null;
  content: string | null; sortOrder: number; isFree: boolean; durationSecs: number | null;
  passMark: number | null; timeLimitSecs: number | null; maxAttempts: number;
  attachments: Attachment[];
  chapters?: { startSec: number; title: string }[] | null;
  transcript?: string | null;
  /** Editor-only: the chapters textarea while editing */
  chaptersText?: string;
}
interface Module { id: string; title: string; sortOrder: number; lessons: Lesson[]; }

function fmtTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
const chaptersToText = (c?: Lesson['chapters']) => (c ?? []).map(x => `${fmtTime(x.startSec)} ${x.title}`).join('\n');

/** "2:15 Factorising" per line (YouTube-style). Returns the chapters, or the first line it couldn't read. */
function parseChapters(text: string): { chapters: { startSec: number; title: string }[] } | { error: string } {
  const chapters: { startSec: number; title: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–:]?\s*(.+)$/);
    if (!m) return { error: line };
    chapters.push({ startSec: (+(m[1] ?? 0)) * 3600 + +m[2] * 60 + +m[3], title: m[4].trim() });
  }
  return { chapters };
}
interface Course {
  id: string; title: string; description: string | null;
  shortDescription: string | null; coverUrl: string | null; status: string;
  programme: { name: string; shortName: string | null } | null;
  subject: { name: string } | null;
  modules: Module[];
}

const LESSON_TYPES = [
  { value: 'VIDEO', label: 'Video' },
  { value: 'TEXT',  label: 'Text / Article' },
  { value: 'QUIZ',  label: 'Quiz' },
  { value: 'LIVE',  label: 'Live Session' },
];

/* ── Sortable lesson row ──────────────────────────────── */
function SortableLesson({
  lesson, lessonIdx, modId, courseId,
  editLesson, setEditLesson, acting,
  onUpdate, onDelete,
}: {
  lesson: Lesson; lessonIdx: number; modId: string; courseId: string;
  editLesson: Lesson | null; setEditLesson: (l: Lesson | null) => void;
  acting: string | null;
  onUpdate: (lesson: Lesson, moduleId: string) => void;
  onDelete: (moduleId: string, lessonId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: lesson.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="px-4 py-3 border-b border-cloud last:border-0 bg-white"
    >
      {editLesson?.id === lesson.id ? (
        <div className="space-y-3">
          <input value={editLesson.title}
            onChange={e => setEditLesson({ ...editLesson, title: e.target.value })}
            className="w-full rounded-xl border border-azure bg-white px-3 py-2 text-sm text-navy outline-none" />
          {editLesson.type === 'VIDEO' && (
            <input value={editLesson.videoUrl ?? ''}
              onChange={e => setEditLesson({ ...editLesson, videoUrl: e.target.value })}
              placeholder="Video URL (YouTube, Vimeo, direct…)"
              className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
          )}
          {editLesson.type === 'VIDEO' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-navy">Chapters <span className="font-normal text-royal/40">(optional · one per line)</span></span>
                <textarea
                  value={editLesson.chaptersText ?? chaptersToText(editLesson.chapters)}
                  onChange={e => setEditLesson({ ...editLesson, chaptersText: e.target.value })}
                  placeholder={'0:00 Introduction\n2:15 Factorising\n9:40 Worked example'}
                  rows={4}
                  className="w-full rounded-xl border border-cloud bg-white px-3 py-2 font-mono text-xs text-navy outline-none focus:border-azure placeholder:text-royal/40" />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-navy">Transcript <span className="font-normal text-royal/40">(optional · [mm:ss] lines are clickable)</span></span>
                <textarea
                  value={editLesson.transcript ?? ''}
                  onChange={e => setEditLesson({ ...editLesson, transcript: e.target.value })}
                  placeholder={'[0:00] Welcome to this lesson…\n[0:42] First, recall the formula…'}
                  rows={4}
                  className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-xs text-navy outline-none focus:border-azure placeholder:text-royal/40" />
              </label>
            </div>
          )}
          {editLesson.type === 'TEXT' && (
            <RichTextEditor
              value={editLesson.content ?? ''}
              onChange={html => setEditLesson({ ...editLesson, content: html })}
              placeholder="Lesson content…"
              minHeight={160}
            />
          )}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-navy cursor-pointer">
              <input type="checkbox" checked={editLesson.isFree}
                onChange={e => setEditLesson({ ...editLesson, isFree: e.target.checked })}
                className="rounded" />
              Free preview
            </label>
            <div className="ml-auto flex gap-2">
              <Button size="sm" loading={acting === 'edit-' + lesson.id}
                onClick={() => onUpdate(lesson, modId)}>Save</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditLesson(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button {...listeners} {...attributes}
            className="cursor-grab active:cursor-grabbing text-royal/20 hover:text-royal/50 transition flex-shrink-0 touch-none p-1">
            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
              <circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/>
              <circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/>
              <circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
            </svg>
          </button>
          <span className="text-[10px] font-bold text-royal/30 w-4 text-center flex-shrink-0">{lessonIdx + 1}</span>
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-cloud">
            <Icon name={lesson.type === 'VIDEO' ? 'live' : lesson.type === 'TEXT' ? 'file' : 'assignments'} size={12} className="text-azure" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-navy truncate">{lesson.title}</p>
            <p className="text-[10px] text-royal/40">
              {lesson.type}{lesson.isFree ? ' · Free preview' : ''}
              {lesson.type === 'QUIZ' && lesson.passMark ? ` · Pass: ${lesson.passMark}%` : ''}
              {lesson.type === 'QUIZ' && lesson.timeLimitSecs ? ` · ${Math.round(lesson.timeLimitSecs/60)}min` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {lesson.type === 'QUIZ' && (
              <Link
                href={`/teacher/courses/${courseId}/quiz/${lesson.id}`}
                className="rounded-lg border border-azure/40 bg-azure/10 px-2 py-1 text-[10px] font-bold text-azure hover:bg-azure hover:text-white transition">
                Questions
              </Link>
            )}
            <button onClick={() => setEditLesson(lesson)}
              className="rounded-lg border border-cloud p-1.5 text-royal/40 hover:text-navy hover:bg-cloud transition">
              <Icon name="edit" size={11} />
            </button>
            <button onClick={() => onDelete(modId, lesson.id)}
              className="rounded-lg border border-cloud p-1.5 text-royal/40 hover:text-red-500 hover:border-red-200 transition">
              <Icon name="trash" size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sortable module ──────────────────────────────────── */
function SortableModule({
  mod, modIdx, acting, courseId,
  editModuleId, editModuleTitle, setEditModuleId, setEditModuleTitle,
  editLesson, setEditLesson,
  addingLessonTo, setAddingLessonTo, lessonForm, setLessonForm,
  onRename, onDelete, onAddLesson, onUpdateLesson, onDeleteLesson, onLessonsReorder,
}: {
  mod: Module; modIdx: number; acting: string | null; courseId: string;
  editModuleId: string | null; editModuleTitle: string;
  setEditModuleId: (id: string | null) => void; setEditModuleTitle: (t: string) => void;
  editLesson: Lesson | null; setEditLesson: (l: Lesson | null) => void;
  addingLessonTo: string | null; setAddingLessonTo: (id: string | null) => void;
  lessonForm: any; setLessonForm: (f: any) => void;
  onRename: (id: string) => void; onDelete: (id: string) => void;
  onAddLesson: (moduleId: string, e: React.FormEvent) => void;
  onUpdateLesson: (lesson: Lesson, moduleId: string) => void;
  onDeleteLesson: (moduleId: string, lessonId: string) => void;
  onLessonsReorder: (moduleId: string, oldIndex: number, newIndex: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: mod.id });
  const lessonSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleLessonDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = mod.lessons.findIndex(l => l.id === active.id);
    const newIdx = mod.lessons.findIndex(l => l.id === over.id);
    if (oldIdx !== -1 && newIdx !== -1) onLessonsReorder(mod.id, oldIdx, newIdx);
  }

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}>
      <Card padding="none" className="overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 bg-navy/[0.03] px-4 py-3 border-b border-cloud">
          <button {...listeners} {...attributes}
            className="cursor-grab active:cursor-grabbing text-royal/20 hover:text-royal/50 transition flex-shrink-0 touch-none p-1">
            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
              <circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/>
              <circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/>
              <circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
            </svg>
          </button>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy/10 text-xs font-black text-navy flex-shrink-0">
            {modIdx + 1}
          </div>
          {editModuleId === mod.id ? (
            <div className="flex-1 flex items-center gap-2">
              <input value={editModuleTitle} onChange={e => setEditModuleTitle(e.target.value)}
                className="flex-1 rounded-lg border border-azure bg-white px-3 py-1.5 text-sm text-navy outline-none" autoFocus />
              <Button size="sm" loading={acting === mod.id} onClick={() => onRename(mod.id)}>Save</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditModuleId(null)}>Cancel</Button>
            </div>
          ) : (
            <>
              <p className="flex-1 text-sm font-bold text-navy">{mod.title}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-royal/40">{mod.lessons.length} lessons</span>
                <button onClick={() => { setEditModuleId(mod.id); setEditModuleTitle(mod.title); }}
                  className="rounded-lg border border-cloud p-1.5 text-royal/40 hover:text-navy hover:bg-cloud transition">
                  <Icon name="edit" size={12} />
                </button>
                <button onClick={() => onDelete(mod.id)}
                  className="rounded-lg border border-cloud p-1.5 text-royal/40 hover:text-red-500 hover:border-red-200 transition">
                  <Icon name="trash" size={12} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Lessons */}
        <DndContext sensors={lessonSensors} collisionDetection={closestCenter} onDragEnd={handleLessonDragEnd}>
          <SortableContext items={mod.lessons.map(l => l.id)} strategy={verticalListSortingStrategy}>
            {mod.lessons.map((lesson, lessonIdx) => (
              <SortableLesson key={lesson.id}
                lesson={lesson} lessonIdx={lessonIdx} modId={mod.id} courseId={courseId}
                editLesson={editLesson} setEditLesson={setEditLesson}
                acting={acting} onUpdate={onUpdateLesson} onDelete={onDeleteLesson} />
            ))}
          </SortableContext>
        </DndContext>

        {/* Add lesson form */}
        {addingLessonTo === mod.id ? (
          <form onSubmit={e => onAddLesson(mod.id, e)} className="border-t border-cloud bg-azure/5 p-4 space-y-3">
            <input value={lessonForm.title}
              onChange={e => setLessonForm((f: any) => ({ ...f, title: e.target.value }))}
              placeholder="Lesson title *" required
              className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
            <div className="flex gap-2">
              {LESSON_TYPES.map(t => (
                <button key={t.value} type="button"
                  onClick={() => setLessonForm((f: any) => ({ ...f, type: t.value }))}
                  className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition ${
                    lessonForm.type === t.value ? 'border-azure bg-azure/10 text-azure' : 'border-cloud text-navy/60 hover:bg-cloud'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            {lessonForm.type === 'VIDEO' && (
              <input value={lessonForm.videoUrl}
                onChange={e => setLessonForm((f: any) => ({ ...f, videoUrl: e.target.value }))}
                placeholder="Video URL (YouTube, Vimeo, R2…)"
                className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
            )}
            {lessonForm.type === 'TEXT' && (
              <RichTextEditor
                value={lessonForm.content}
                onChange={html => setLessonForm((f: any) => ({ ...f, content: html }))}
                placeholder="Lesson content…"
                minHeight={120}
              />
            )}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs text-navy cursor-pointer">
                <input type="checkbox" checked={lessonForm.isFree}
                  onChange={e => setLessonForm((f: any) => ({ ...f, isFree: e.target.checked }))}
                  className="rounded" />
                Free preview
              </label>
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={acting === 'lesson-' + mod.id}>Add Lesson</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setAddingLessonTo(null)}>Cancel</Button>
              </div>
            </div>
          </form>
        ) : (
          <button onClick={() => setAddingLessonTo(mod.id)}
            className="flex w-full items-center gap-2 px-4 py-3 text-xs font-semibold text-azure hover:bg-azure/5 transition border-t border-cloud">
            <Icon name="add" size={13} /> Add lesson
          </button>
        )}
      </Card>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────── */
export default function CourseBuilderPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ type: 'module' | 'lesson' | 'review'; moduleId?: string; lessonId?: string } | null>(null);

  // Cover image + short description
  const [shortDesc, setShortDesc] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);

  const uploadCover = useCallback(async (file: File) => {
    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/files/upload?folder=covers', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = r.data?.url ?? r.data?.fileUrl ?? r.data;
      await api.patch(`/platform-courses/${courseId}`, { coverUrl: url });
      setCourse(c => c ? { ...c, coverUrl: url } : c);
      notify.success('Cover image updated');
    } catch { notify.error('Upload failed'); }
    finally { setUploadingCover(false); }
  }, [courseId]);

  const { getRootProps: getCoverRootProps, getInputProps: getCoverInputProps, isDragActive: isCoverDrag } = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxSize: 5 * 1024 * 1024,
    multiple: false,
    onDropAccepted: ([file]) => uploadCover(file),
  });

  async function saveMeta() {
    setSavingMeta(true);
    try {
      await api.patch(`/platform-courses/${courseId}`, { shortDescription: shortDesc || null });
      setCourse(c => c ? { ...c, shortDescription: shortDesc || null } : c);
      notify.success('Course details saved');
    } catch { notify.error('Failed to save'); }
    finally { setSavingMeta(false); }
  }

  const [addingModule, setAddingModule] = useState(false);
  const [moduleTitle, setModuleTitle] = useState('');
  const [editModuleId, setEditModuleId] = useState<string | null>(null);
  const [editModuleTitle, setEditModuleTitle] = useState('');

  const [addingLessonTo, setAddingLessonTo] = useState<string | null>(null);
  const [lessonForm, setLessonForm] = useState({ title: '', type: 'VIDEO', videoUrl: '', content: '', isFree: false });
  const [editLesson, setEditLesson] = useState<Lesson | null>(null);

  const moduleSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function load() {
    const r = await api.get(`/platform-courses/${courseId}`);
    setCourse(r.data);
    setShortDesc(r.data.shortDescription ?? '');
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, [courseId]);

  async function handleModuleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !course) return;
    const oldIdx = course.modules.findIndex(m => m.id === active.id);
    const newIdx = course.modules.findIndex(m => m.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(course.modules, oldIdx, newIdx);
    setCourse({ ...course, modules: reordered });
    try {
      await api.post(`/platform-courses/${courseId}/modules/reorder`, {
        orderedIds: reordered.map(m => m.id),
      });
    } catch {
      notify.error('Failed to save module order');
      await load();
    }
  }

  async function handleLessonsReorder(moduleId: string, oldIndex: number, newIndex: number) {
    if (!course) return;
    const modIdx = course.modules.findIndex(m => m.id === moduleId);
    if (modIdx === -1) return;
    const reordered = arrayMove(course.modules[modIdx].lessons, oldIndex, newIndex);
    const newModules = course.modules.map((m, i) => i === modIdx ? { ...m, lessons: reordered } : m);
    setCourse({ ...course, modules: newModules });
    try {
      await api.post(`/platform-courses/${courseId}/modules/${moduleId}/lessons/reorder`, {
        orderedIds: reordered.map(l => l.id),
      });
    } catch {
      notify.error('Failed to save lesson order');
      await load();
    }
  }

  async function addModule(e: React.FormEvent) {
    e.preventDefault(); setActing('module');
    try {
      await api.post(`/platform-courses/${courseId}/modules`, { title: moduleTitle });
      setAddingModule(false); setModuleTitle('');
      notify.success('Module added');
      await load();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setActing(null); }
  }

  async function renameModule(moduleId: string) {
    setActing(moduleId);
    try {
      await api.patch(`/platform-courses/${courseId}/modules/${moduleId}`, { title: editModuleTitle });
      setEditModuleId(null); notify.success('Module renamed'); await load();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setActing(null); }
  }

  async function deleteModule(moduleId: string) {
    setConfirming({ type: 'module', moduleId });
  }

  async function executeDeleteModule(moduleId: string) {
    setConfirming(null);
    setActing(moduleId);
    try {
      await api.delete(`/platform-courses/${courseId}/modules/${moduleId}`);
      notify.success('Module deleted'); await load();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setActing(null); }
  }

  async function addLesson(moduleId: string, e: React.FormEvent) {
    e.preventDefault(); setActing('lesson-' + moduleId);
    try {
      await api.post(`/platform-courses/${courseId}/modules/${moduleId}/lessons`, lessonForm);
      setAddingLessonTo(null);
      setLessonForm({ title: '', type: 'VIDEO', videoUrl: '', content: '', isFree: false });
      notify.success('Lesson added'); await load();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setActing(null); }
  }

  async function updateLesson(lesson: Lesson, moduleId: string) {
    const isVideo = editLesson!.type === 'VIDEO';
    let chapters: { startSec: number; title: string }[] | undefined;
    if (isVideo && editLesson!.chaptersText !== undefined) {
      const parsed = parseChapters(editLesson!.chaptersText);
      if ('error' in parsed) { notify.error(`Couldn't read chapter line: "${parsed.error}". Use "2:15 Title".`); return; }
      chapters = parsed.chapters;
    }
    setActing('edit-' + lesson.id);
    try {
      await api.patch(`/platform-courses/${courseId}/modules/${moduleId}/lessons/${lesson.id}`, {
        title: editLesson!.title, videoUrl: editLesson!.videoUrl,
        content: editLesson!.content, isFree: editLesson!.isFree,
        ...(chapters !== undefined && { chapters }),
        ...(isVideo && { transcript: editLesson!.transcript?.trim() || null }),
      });
      setEditLesson(null); notify.success('Lesson saved'); await load();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setActing(null); }
  }

  async function deleteLesson(moduleId: string, lessonId: string) {
    setConfirming({ type: 'lesson', moduleId, lessonId });
  }

  async function executeDeleteLesson(moduleId: string, lessonId: string) {
    setConfirming(null);
    setActing('del-' + lessonId);
    try {
      await api.delete(`/platform-courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`);
      notify.success('Lesson deleted'); await load();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setActing(null); }
  }

  async function submitForReview() {
    setConfirming({ type: 'review' });
  }

  async function executeSubmitForReview() {
    setConfirming(null);
    setActing('review');
    try {
      await api.post(`/platform-courses/${courseId}/submit`);
      notify.success('Course submitted for review');
      await load();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setActing(null); }
  }

  if (loading || !course) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 flex">
        <div className="w-72 border-r border-cloud bg-white p-4 space-y-2 hidden lg:flex lg:flex-col">
          {[0,1,2,3].map(i => <div key={i} className="h-10 rounded-xl bg-cloud animate-pulse" />)}
        </div>
        <div className="flex-1 p-6 space-y-4">
          <div className="h-40 rounded-2xl bg-cloud animate-pulse" />
          <div className="h-64 rounded-2xl bg-cloud animate-pulse" />
        </div>
      </div>
    </div>
  );
  const totalLessons = course.modules.reduce((a, m) => a + m.lessons.length, 0);

  return (
    <>
    <div className="flex flex-col min-h-full">
      <Topbar
        title={course.title}
        subtitle={[course.programme?.shortName, course.subject?.name].filter(Boolean).join(' · ') || 'Course Builder'}
        backHref={`/teacher/courses/${courseId}`}
        backLabel="Course detail"
      />
      <div className="flex-1 p-6 space-y-5">
        <div className="flex items-center gap-4 text-xs text-royal/50">
          <span className="flex items-center gap-1"><Icon name="notebook" size={12} />{course.modules.length} modules</span>
          <span className="flex items-center gap-1"><Icon name="play" size={12} />{totalLessons} lessons</span>
          <span className={`font-semibold ${course.status === 'PUBLISHED' ? 'text-azure' : course.status === 'PENDING_REVIEW' ? 'text-amber-500' : 'text-royal/50'}`}>
            {course.status.replace(/_/g, ' ')}
          </span>
          {course.status === 'DRAFT' && (
            <button
              onClick={submitForReview}
              disabled={acting === 'review'}
              className="flex items-center gap-1.5 rounded-xl bg-azure px-3 py-1.5 text-xs font-semibold text-white hover:bg-royal transition disabled:opacity-50">
              {acting === 'review' ? 'Submitting…' : 'Submit for Review'}
            </button>
          )}
          <Link href={`/teacher/courses/${courseId}/discussion`}
            className="flex items-center gap-1.5 rounded-xl border border-cloud px-3 py-1.5 text-xs font-semibold text-navy hover:bg-cloud transition">
            <Icon name="community" size={12} /> Discussion
          </Link>
          <span className="text-[10px] text-royal/30 hidden sm:flex items-center gap-1">
            <svg width="8" height="12" viewBox="0 0 10 16" fill="currentColor" className="opacity-50">
              <circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/>
              <circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/>
              <circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
            </svg>
            Drag to reorder
          </span>
          <Link href="/teacher/courses" className="ml-auto text-azure hover:text-royal transition text-xs font-semibold">
            ← Back to courses
          </Link>
        </div>

        {/* Course meta — cover image + short description */}
        <Card padding="md">
          <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-4">Course Details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Cover image */}
            <div>
              <p className="text-xs font-semibold text-navy mb-2">Cover Image</p>
              <div
                {...(getCoverRootProps() as React.HTMLAttributes<HTMLDivElement>)}
                className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed cursor-pointer transition overflow-hidden
                  ${isCoverDrag ? 'border-azure bg-azure/10' : 'border-cloud hover:border-azure hover:bg-azure/5'}
                  ${uploadingCover ? 'opacity-60 pointer-events-none' : ''}`}
                style={{ minHeight: 140 }}
              >
                <input {...getCoverInputProps()} />
                {course.coverUrl ? (
                  <>
                    <Image src={course.coverUrl} alt="Cover" fill className="object-cover rounded-xl" />
                    <div className="absolute inset-0 bg-navy/40 flex items-center justify-center opacity-0 hover:opacity-100 transition rounded-xl">
                      <p className="text-xs font-semibold text-white">Click or drag to replace</p>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-6 text-center px-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cloud">
                      <Icon name="image" size={18} className="text-azure" />
                    </div>
                    <p className="text-xs font-semibold text-navy">
                      {uploadingCover ? 'Uploading…' : 'Drop image or click to upload'}
                    </p>
                    <p className="text-[10px] text-royal/40">JPG, PNG, WEBP · max 5 MB</p>
                  </div>
                )}
              </div>
            </div>

            {/* Short description */}
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs font-semibold text-navy mb-2">Short Description</p>
                <textarea
                  value={shortDesc}
                  onChange={e => setShortDesc(e.target.value)}
                  rows={4}
                  maxLength={200}
                  placeholder="One or two sentences shown on course cards…"
                  className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40 resize-none"
                />
                <p className="text-[10px] text-royal/30 text-right">{shortDesc.length}/200</p>
              </div>
              <Button size="sm" loading={savingMeta} onClick={saveMeta} className="self-start">
                Save Details
              </Button>
            </div>
          </div>
        </Card>

        <DndContext sensors={moduleSensors} collisionDetection={closestCenter} onDragEnd={handleModuleDragEnd}>
          <SortableContext items={course.modules.map(m => m.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {course.modules.map((mod, modIdx) => (
                <SortableModule key={mod.id}
                  mod={mod} modIdx={modIdx} acting={acting} courseId={courseId}
                  editModuleId={editModuleId} editModuleTitle={editModuleTitle}
                  setEditModuleId={setEditModuleId} setEditModuleTitle={setEditModuleTitle}
                  editLesson={editLesson} setEditLesson={setEditLesson}
                  addingLessonTo={addingLessonTo} setAddingLessonTo={setAddingLessonTo}
                  lessonForm={lessonForm} setLessonForm={setLessonForm}
                  onRename={renameModule} onDelete={deleteModule}
                  onAddLesson={addLesson} onUpdateLesson={updateLesson} onDeleteLesson={deleteLesson}
                  onLessonsReorder={handleLessonsReorder}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {addingModule ? (
          <form onSubmit={addModule}>
            <div className="flex items-center gap-2 rounded-2xl border-2 border-azure bg-white px-4 py-3">
              <input value={moduleTitle} onChange={e => setModuleTitle(e.target.value)}
                placeholder="Module title e.g. Introduction to Electricity" required autoFocus
                className="flex-1 bg-transparent text-sm font-semibold text-navy outline-none placeholder:text-royal/40" />
              <Button type="submit" size="sm" loading={acting === 'module'}>Add</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setAddingModule(false)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <button onClick={() => setAddingModule(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-cloud py-4 text-sm font-semibold text-royal/50 hover:border-azure hover:text-azure transition">
            <Icon name="add" size={16} /> Add module
          </button>
        )}
      </div>
    </div>

    {/* Inline confirm dialog */}
    {confirming && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          <p className="text-sm font-bold text-navy mb-1">
            {confirming.type === 'module' ? 'Delete this module?' :
             confirming.type === 'lesson' ? 'Delete this lesson?' :
             'Submit for review?'}
          </p>
          <p className="text-xs text-royal/60 mb-5">
            {confirming.type === 'module'
              ? 'This will permanently delete the module and all its lessons.'
              : confirming.type === 'lesson'
              ? 'This lesson will be permanently removed.'
              : 'Once submitted, the course will be locked for editing until the review is complete.'}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => {
              if (confirming.type === 'module' && confirming.moduleId) executeDeleteModule(confirming.moduleId);
              else if (confirming.type === 'lesson' && confirming.moduleId && confirming.lessonId) executeDeleteLesson(confirming.moduleId, confirming.lessonId);
              else if (confirming.type === 'review') executeSubmitForReview();
            }}>
              {confirming.type === 'review' ? 'Submit' : 'Delete'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(null)}>Cancel</Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
