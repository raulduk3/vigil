/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  // Redirect API calls to backend during development
  async rewrites() {
    return process.env.NODE_ENV === 'development'
      ? [
          {
            source: '/api/backend/:path*',
            destination: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/:path*`,
          },
        ]
      : [];
  },
};

module.exports = nextConfig;
