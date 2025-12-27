/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable experimental features
  experimental: {
    // Optimize package imports
    optimizePackageImports: ['@stripe/stripe-js'],
  },
  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
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
