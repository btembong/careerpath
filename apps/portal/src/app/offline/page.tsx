'use client';
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <div className="w-full max-w-sm">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-navy mx-auto mb-6">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="text-azure"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
          </svg>
        </div>

        <h1 className="text-2xl font-black text-navy mb-2">You're offline</h1>
        <p className="text-sm text-royal/60 leading-relaxed mb-8">
          It looks like your internet connection is unavailable. Some pages you've visited recently
          may still be accessible — try navigating back.
        </p>

        <div className="rounded-2xl border border-cloud bg-white p-5 mb-6 text-left space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40">You can still access</p>
          <div className="space-y-2">
            {[
              'Previously visited course pages',
              'Cached lesson content',
              'Your dashboard (last loaded)',
            ].map(item => (
              <div key={item} className="flex items-center gap-2.5">
                <div className="h-1.5 w-1.5 rounded-full bg-azure flex-shrink-0" />
                <p className="text-sm text-navy">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="w-full rounded-2xl bg-navy px-6 py-3.5 text-sm font-bold text-white hover:bg-royal transition">
          Try again
        </button>

        <p className="mt-4 text-xs text-royal/30">
          CareerPath Africa works offline for previously viewed content.
        </p>
      </div>
    </div>
  );
}
