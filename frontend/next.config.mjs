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

    const redactorUrl =
      process.env.INTERNAL_BACKEND_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'http://vpti_redactor:5000'
        : 'http://127.0.0.1:5000')

    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },

      {
        source: '/api/:path*',
        destination: `${redactorUrl}/api/:path*`,
      },

    ]

  },
}

export default nextConfig

