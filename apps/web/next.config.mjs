/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The browser only ever talks to this same-origin /backend proxy; the NestJS
  // API itself is never exposed cross-origin. The proxy target is resolved
  // server-side from API_BASE_URL, so deployment only reconfigures the server.
  async rewrites() {
    const destination = `${process.env.API_BASE_URL ?? 'http://127.0.0.1:4000/api'}/:path*`;
    return [{ source: '/backend/:path*', destination }];
  },
};

export default nextConfig;
