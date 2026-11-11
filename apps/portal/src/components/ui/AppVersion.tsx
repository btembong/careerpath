import { clsx } from 'clsx';

/**
 * Which version of the portal this is: the release, the exact code that's live (matches GitHub) and when it was built.
 * Stamped at build time in next.config.mjs. Release rule: 1.0 when payments are on, then a new release per feature.
 */
export function AppVersion({ className }: { className?: string }) {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  if (!version) return null;
  const build = process.env.NEXT_PUBLIC_APP_BUILD;
  const date = process.env.NEXT_PUBLIC_APP_BUILT_AT;
  const built = date ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  return (
    <p className={clsx('text-[11.5px] text-muted', className)}>
      CareerPath Africa · version {version}{build ? ` · build ${build}` : ''}{built ? ` · ${built}` : ''}
    </p>
  );
}
