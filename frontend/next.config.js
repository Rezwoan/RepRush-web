/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // Any navigation we haven't cached falls back to the dashboard shell, which
  // then renders from local state — better than the browser's offline error.
  fallbacks: { document: '/dashboard' },
  runtimeCaching: [
    // API reads: serve fresh when possible, fall back to the last good response
    // so the app still has plans, history and profile data with no connection.
    // Writes are never cached — they go through the outbox in lib/offline.ts.
    {
      urlPattern: /\/api\/.*$/i,
      method: 'GET',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'reprush-api',
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
        cacheableResponse: { statuses: [200] },
      },
    },
    // App shell / pages.
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'reprush-pages',
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    // Build assets are content-hashed, so they can be served straight from cache.
    {
      urlPattern: /\/_next\/static\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'reprush-static',
        expiration: { maxEntries: 300, maxAgeSeconds: 365 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'reprush-assets',
        expiration: { maxEntries: 120, maxAgeSeconds: 365 * 24 * 60 * 60 },
      },
    },
  ],
});

const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost'],
  },
};

module.exports = withPWA(nextConfig);
