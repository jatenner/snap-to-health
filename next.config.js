/** @type {import('next').NextConfig} */
const webpack = require('webpack');

const nextConfig = {
  reactStrictMode: true,
  // Output builds in the standalone mode for better compatibility with serverless environments
  output: "standalone",
  // Disable Image Optimization API in dev mode to avoid extra complexity
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.githubusercontent.com',
      },
    ],
  },
  // Add headers configuration to bypass authentication for public API routes
  async headers() {
    return [
      {
        source: '/api/public-test-openai',
        headers: [
          {
            key: 'x-vercel-skip-authorization',
            value: 'true',
          },
        ],
      },
      {
        source: '/api/ping-openai',
        headers: [
          {
            key: 'x-vercel-skip-authorization',
            value: 'true',
          },
        ],
      },
      {
        source: '/api/test-vision',
        headers: [
          {
            key: 'x-vercel-skip-authorization',
            value: 'true',
          },
        ],
      },
      {
        source: '/api/test-validator',
        headers: [
          {
            key: 'x-vercel-skip-authorization',
            value: 'true',
          },
        ],
      },
    ];
  },
  // Runtime environment variables for the client
  env: {
    // Nutritionix API credentials - public since they're used on the client
    NEXT_PUBLIC_NUTRITIONIX_APP_ID: process.env.NUTRITIONIX_APP_ID || '',
    NEXT_PUBLIC_NUTRITIONIX_API_KEY: process.env.NUTRITIONIX_API_KEY || '',
    // Firebase public config
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    // Flag to easily enable/disable features in different environments
    NEXT_PUBLIC_ENVIRONMENT: process.env.NODE_ENV,
    // Vercel deployment indicator
    VERCEL: process.env.VERCEL || '1'
  },
  // Configure webpack to handle Tesseract.js worker scripts correctly
  webpack: (config, { isServer, dev }) => {
    // For OCR worker to function properly, we need to handle the worker correctly
    config.module.rules.push({
      test: /tesseract\.js-core\/tesseract-core\.wasm\.js/,
      type: 'javascript/auto',
      loader: 'file-loader',
      options: {
        name: 'static/chunks/[name].[hash].[ext]',
      },
    });

    // Handle Tesseract.js language data files
    config.module.rules.push({
      test: /tesseract\.js-data.*?\/eng.*?\.js$/,
      use: 'null-loader',
    });

    // Prevent Tesseract from causing issues with Next.js SSR
    if (isServer) {
      // Add null loader for tesseract.js on server-side to prevent issues
      config.module.rules.push({
        test: /tesseract\.js/,
        use: 'null-loader',
      });
      
      // Add null loader for undici to prevent issues with Firebase Storage
      config.module.rules.push({
        test: /undici/,
        use: 'null-loader',
      });
      
      // Handle specific Firebase Storage modules that try to import undici
      config.module.rules.push({
        test: /node_modules\/@firebase\/storage/,
        use: {
          loader: 'null-loader',
        },
      });
    }

    // Configure fallbacks for Node.js core modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
      undici: false, // Add explicit fallback for undici
      http: false,
      https: false,
      stream: false,
      zlib: false,
    };

    // Add source maps for better debugging
    config.devtool = 'source-map';

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