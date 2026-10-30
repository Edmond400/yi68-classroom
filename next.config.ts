import type { NextConfig } from "next";
import path from 'node:path';

const nextConfig: NextConfig = {
  ...(process.env.YI68_NODE_BUILD === '1' ? { distDir: '.next-server' } : {}),
  output: 'standalone',
  poweredByHeader: false,
  webpack(config, { webpack }) {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^cloudflare:workers$/, path.resolve('lib/node-runtime.ts')));
    return config;
  },
  async headers() { return [{ source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'same-origin' }, { key: 'X-Frame-Options', value: 'DENY' }] }]; },
};

export default nextConfig;
