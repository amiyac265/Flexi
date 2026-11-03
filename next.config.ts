import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: { cpus: 2 },
  outputFileTracingIncludes: {
    '/api-docs/assets/[asset]': [
      './node_modules/swagger-ui-dist/swagger-ui-bundle.js',
      './node_modules/swagger-ui-dist/swagger-ui.css',
    ],
  },
}
export default nextConfig
