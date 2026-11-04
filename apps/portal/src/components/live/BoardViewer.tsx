'use client';
import dynamic from 'next/dynamic';

const Excalidraw = dynamic(
  () => import('@excalidraw/excalidraw').then(m => m.Excalidraw),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center bg-[#121212] text-sm text-white/40">Loading the board…</div> },
);

/** A saved whiteboard, read only: the board exactly as it was left. "Save as image" downloads it. */
export function BoardViewer({ elements, height = 420 }: { elements: unknown[]; height?: number }) {
  if (!elements.length) return <p className="rounded-lg bg-subtle px-4 py-6 text-center text-[13.5px] text-ink2">Nothing was drawn on the board.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-line" style={{ height }}>
      <Excalidraw
        initialData={{ elements: elements as any, appState: { viewBackgroundColor: '#121212' }, scrollToContent: true }}
        viewModeEnabled
        UIOptions={{ canvasActions: { export: false, loadScene: false, saveToActiveFile: false, saveAsImage: true, clearCanvas: false, changeViewBackgroundColor: false, toggleTheme: false } }}
        theme="dark"
      />
    </div>
  );
}
