/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['*'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Explicitly enable environment variables to be exposed to the browser
  // These are already prefixed with NEXT_PUBLIC_ so they should be exposed by default,
  // but we're being extra explicit here to ensure they're available
  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  },
  // Configure webpack to handle Tesseract.js worker scripts correctly
  webpack: (config, { isServer, dev }) => {
    // Prevent the issue with .next/worker-script/node/index.js not found
    if (!isServer) {
      // Add fallbacks for Node.js core modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        os: false,
        stream: false,
        util: false,
        buffer: false,
      };

      // Handle Tesseract.js worker script issues
      if (!dev) {
        // In production, ensure Tesseract.js uses CDN for worker files
        config.resolve.alias = {
          ...config.resolve.alias,
          'tesseract.js-core': 'tesseract.js-core/dist/tesseract-core.wasm.js',
        };
      }
    }

    // Configure how worker scripts are handled
    config.module.rules.unshift({
      test: /tesseract\.js-core[\\/]worker\.js$/,
      loader: 'worker-loader',
      options: {
        fallback: true,
        inline: true,
      },
    });

    return config;
  },
  // Increase serverless function timeout for image processing
  serverRuntimeConfig: {
    // Will only be available on the server side
    functionTimeout: 30, // 30 seconds
  },
  // Configure external paths to avoid bundling issues
  experimental: {
    // Prevent Next.js from attempting to bundle certain packages
    externalDir: true,
    // Enable SWC transpilation for faster builds
    swcMinify: true,
  },
};

module.exports = nextConfig; 