/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const backendUrl =
      process.env.INTERNAL_BACKEND_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'http://vpti_backend:5000'
        : 'http://127.0.0.1:5000')

    let redactorUrl =
      process.env.INTERNAL_REDACTOR_URL ||
      process.env.REDACTAR_URL ||
      process.env.NEXT_PUBLIC_REDACTAR_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'http://redactor_app:5000'
        : 'http://127.0.0.1:7000')

    // Clean any trailing /api/redactar or slashes
    redactorUrl = redactorUrl.replace(/\/api\/redactar\/?$/, '').replace(/\/+$/, '')

    return [
      {
        source: '/api/redactar',
        destination: `${redactorUrl}/api/redactar`,
      },
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ]

  },
}

export default nextConfig

