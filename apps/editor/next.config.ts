import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const appDirectory = path.dirname(fileURLToPath(import.meta.url))
const portableBuild = process.env.PASCAL_PORTABLE_BUILD === '1'

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  serverExternalPackages: ['pdfjs-dist', 'mammoth', 'fflate'],
  outputFileTracingRoot: path.join(appDirectory, '../..'),
  outputFileTracingIncludes: {
    '/api/script/stage-plan': [
      './lib/scripts/document-worker.mjs',
      '../../node_modules/{pdfjs-dist,mammoth,fflate,@napi-rs/canvas,@napi-rs/canvas-*,@xmldom/xmldom,argparse,base64-js,bluebird,core-util-is,dingbat-to-unicode,duck,immediate,inherits,isarray,jszip,lie,lop,option,pako,path-is-absolute,process-nextick-args,readable-stream,safe-buffer,setimmediate,sprintf-js,string_decoder,underscore,util-deprecate,xmlbuilder}/**/*',
    ],
  },
  ...(portableBuild ? { output: 'standalone' as const } : {}),
  logging: {
    browserToTerminal: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // MCP / package metadata returns `/editor/<id>` (hosted route). This open-source
  // app serves saved scenes at `/scene/<id>` — redirect so links and bookmarks work.
  async redirects() {
    return [
      {
        source: '/editor/:id',
        destination: '/scene/:id',
        permanent: false,
      },
    ]
  },
  transpilePackages: [
    'three',
    '@pascal-app/viewer',
    '@pascal-app/core',
    '@pascal-app/editor',
    '@pascal-app/mcp',
    '@pascal-app/plugin-streetscape',
    '@pascal-app/plugin-trees',
    '@mint/pascal-plugin',
    '@pascal-app/plugin-bones',
    '@dgreenheck/ez-tree',
  ],
  turbopack: {
    resolveAlias: {
      react: './node_modules/react',
      three: './node_modules/three',
      '@react-three/fiber': './node_modules/@react-three/fiber',
      '@react-three/drei': './node_modules/@react-three/drei',
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  images: {
    unoptimized:
      portableBuild ||
      (process.env.NEXT_PUBLIC_ASSETS_CDN_URL?.startsWith('http://localhost') ?? false),
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
}

export default nextConfig
