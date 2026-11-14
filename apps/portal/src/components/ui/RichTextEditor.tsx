'use client';
import { useRef, useState } from 'react';
import { useEditor, EditorContent as _EditorContent } from '@tiptap/react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EditorContent = _EditorContent as any; // React 19 + pnpm module-identity workaround (TS2786)
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import api from '@/lib/api';
import { notify } from '@/lib/notify';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Lesson editors: pictures (button, paste, drag and drop) and importing a Word document */
  media?: boolean;
}

type ToolbarButtonProps = {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  disabled?: boolean;
};

function ToolbarButton({ onClick, active, title, children, wide, disabled }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 ${wide ? 'px-2 gap-1' : 'w-7'} items-center justify-center rounded text-xs font-bold transition disabled:opacity-50 ${
        active
          ? 'bg-azure text-white'
          : 'text-royal/60 hover:bg-cloud hover:text-navy'
      }`}
    >
      {children}
    </button>
  );
}

const MAX_IMAGE = 10 * 1024 * 1024;
const err = (e: any, f: string) => e?.response?.data?.message ?? f;

/** Put a picture in the lesson files and return its address */
async function uploadImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Pictures must be JPG, PNG, WebP or GIF');
  if (file.size > MAX_IMAGE) throw new Error('Pictures must be 10 MB or smaller');
  const fd = new FormData();
  fd.append('file', file);
  const r = await api.post('/files/upload?folder=lesson-files', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  return r.data.url as string;
}

export function RichTextEditor({ value, onChange, placeholder = 'Write lesson content…', minHeight = 200, media = false }: RichTextEditorProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  // The editor's paste and drop handlers are set once; they reach the latest actions through this
  const actions = useRef<{ addImages: (f: File[]) => Promise<void>; importDoc: (f: File) => Promise<void> } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
      // Pictures are stored as files, never as huge inline data in the lesson
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: value || '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onUpdate({ editor }: { editor: any }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'outline-none',
        style: `min-height: ${minHeight}px; padding: 12px;`,
      },
      // Pasted or dropped pictures are uploaded, then shown where they were put
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handlePaste: (_view: any, event: ClipboardEvent) => {
        const files = [...(event.clipboardData?.files ?? [])].filter(f => f.type.startsWith('image/'));
        if (!media || !files.length) return false;
        event.preventDefault();
        void actions.current?.addImages(files);
        return true;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handleDrop: (_view: any, event: DragEvent) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (!media || !files.length) return false;
        event.preventDefault();
        const docx = files.find(f => /\.docx?$/i.test(f.name));
        if (docx) void actions.current?.importDoc(docx);
        else void actions.current?.addImages(files.filter(f => f.type.startsWith('image/')));
        return true;
      },
    },
  });

  async function addImages(files: File[]) {
    if (!editor || !files.length) return;
    setBusy(files.length > 1 ? `Adding ${files.length} pictures…` : 'Adding the picture…');
    try {
      for (const f of files) {
        const src = await uploadImage(f);
        editor.chain().focus().setImage({ src, alt: f.name.replace(/\.[a-z0-9]+$/i, '') }).run();
      }
    } catch (e: any) { notify.error(err(e, e?.message ?? 'Could not add the picture')); }
    finally { setBusy(null); }
  }

  async function importDoc(file: File) {
    if (!editor) return;
    setBusy('Reading your document…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/files/import-doc', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 });
      const { html, images } = r.data as { html: string; images: number };
      if (editor.isEmpty) editor.commands.setContent(html);
      else editor.chain().focus().insertContent(html).run();
      onChange(editor.getHTML());
      notify.success('Document imported', { description: `${images ? `${images} picture${images === 1 ? '' : 's'} included. ` : ''}Check the formatting, then save the lesson.` });
    } catch (e: any) { notify.error(err(e, 'Could not import that document')); }
    finally { setBusy(null); }
  }

  actions.current = { addImages, importDoc };
  if (!editor) return null;

  return (
    <div className="rounded-xl border border-cloud bg-white overflow-hidden focus-within:border-azure transition">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-cloud px-2 py-1.5 flex-wrap">
        <ToolbarButton title="Bold" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}>
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}>
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')}>
          <span style={{ textDecoration: 'underline' }}>U</span>
        </ToolbarButton>

        <div className="h-4 w-px bg-cloud mx-1" />

        <ToolbarButton title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>
          H2
        </ToolbarButton>
        <ToolbarButton title="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })}>
          H3
        </ToolbarButton>

        <div className="h-4 w-px bg-cloud mx-1" />

        <ToolbarButton title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}>
          •≡
        </ToolbarButton>
        <ToolbarButton title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}>
          1≡
        </ToolbarButton>

        <div className="h-4 w-px bg-cloud mx-1" />

        <ToolbarButton title="Blockquote" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')}>
          "
        </ToolbarButton>
        <ToolbarButton title="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')}>
          {'</>'}
        </ToolbarButton>

        {media && <>
          <div className="h-4 w-px bg-cloud mx-1" />
          <ToolbarButton wide title="Add a picture (you can also paste or drag one in)" disabled={!!busy} onClick={() => imageInput.current?.click()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
            Image
          </ToolbarButton>
          <ToolbarButton wide title="Import a Word document (.docx): its text, headings, lists and pictures" disabled={!!busy} onClick={() => docInput.current?.click()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M12 18v-6M9 15l3 3 3-3" /></svg>
            Import Word
          </ToolbarButton>
          <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden
            onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; void addImages(f); }} />
          <input ref={docInput} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importDoc(f); }} />
        </>}

        <div className="h-4 w-px bg-cloud mx-1" />

        <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()}>
          ↩
        </ToolbarButton>
        <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()}>
          ↪
        </ToolbarButton>
        {busy && <span className="ml-2 text-[11px] font-semibold text-azure" role="status">{busy}</span>}
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none text-navy [&_img]:max-w-full [&_img]:rounded-lg [&_img.ProseMirror-selectednode]:outline [&_img.ProseMirror-selectednode]:outline-2 [&_img.ProseMirror-selectednode]:outline-azure [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-royal/30 [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0"
      />
      {media && <p className="border-t border-cloud bg-cloud/30 px-3 py-1.5 text-[11px] text-royal/50">Paste or drag pictures straight in. Have the lesson in Word? Use Import Word. For a PDF, save the lesson and attach it under “Files for students”.</p>}
    </div>
  );
}
