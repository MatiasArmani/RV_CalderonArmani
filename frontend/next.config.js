/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Allow Next.js dev server to serve /_next/* assets to LAN IPs
  // Only applies in dev mode; add new IPs here when switching networks
  allowedDevOrigins: [
    'https://10.64.196.68:3000',
    'https://192.168.100.153:3000',
    'https://192.168.137.1:3000',
    'https://26.129.197.142:3000',
    'https://10.77.86.68:3000',
  ],

  // Proxy /api/* to the backend so browser calls are same-origin (no CORS)
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ]
  },

  // Image optimization domains (S3)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',
      },
    ],
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
