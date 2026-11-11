import createNextIntlPlugin from 'next-intl/plugin';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// The version people see: the release (beta until payments are on; then 1.0 and a new release per feature),
// the exact code that's live (its short git id, matching GitHub) and when it was built
const RELEASE_LABEL = '';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const [major, minor, patch] = pkg.version.split('.');
const release = `${major}.${minor}${patch && patch !== '0' ? '.' + patch : ''}${RELEASE_LABEL ? ' ' + RELEASE_LABEL : ''}`;
let commit = '';
try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git checkout */ }

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: release,
    NEXT_PUBLIC_APP_BUILD: commit,
    NEXT_PUBLIC_APP_BUILT_AT: new Date().toISOString(),
  },
  // Standalone output is for the Docker image (set in apps/portal/Dockerfile). Locally on Windows it
  // fails without symlink permission, and `next start` doesn't need it.
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,

  // Silence monorepo lockfile root warning for Turbopack
  turbopack: {
    root: '../../',
  },


  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
