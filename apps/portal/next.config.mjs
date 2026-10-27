import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
