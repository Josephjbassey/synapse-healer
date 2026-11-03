/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/synapse/:path*',
        destination: 'http://localhost:52773/api/synapse/:path*',
      },
    ];
  },
};

export default nextConfig;
