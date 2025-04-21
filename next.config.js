/** @type {import('next').NextConfig} */
const webpack = require('webpack');

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@firebase/auth', '@firebase/storage', 'firebase'],
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
    // Firebase config
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    
    // Explicitly define Nutritionix API keys
    NUTRITIONIX_APP_ID: process.env.NUTRITIONIX_APP_ID,
    NUTRITIONIX_API_KEY: process.env.NUTRITIONIX_API_KEY,
    
    // Add Tesseract.js CDN environment variables
    TESSERACT_WORKER_URL: 'https://cdn.jsdelivr.net/npm/tesseract.js@4.1.1/dist/worker.min.js',
    TESSERACT_CORE_URL: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@4.0.4/tesseract-core.wasm.js',
    TESSERACT_LANG_PATH: 'https://cdn.jsdelivr.net/npm/tesseract.js-data@4.0.0/eng',
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

      // Force Tesseract.js to use CDN paths in all environments
      config.resolve.alias = {
        ...config.resolve.alias,
        'tesseract.js-core': 'tesseract.js-core/dist/tesseract-core.wasm.js',
      };
      
      // Add environment definitions for Tesseract workers
      if (webpack && webpack.DefinePlugin) {
        config.plugins.push(
          new webpack.DefinePlugin({
            'process.env.TESSERACT_WORKER_URL': JSON.stringify('https://cdn.jsdelivr.net/npm/tesseract.js@4.1.1/dist/worker.min.js'),
            'process.env.TESSERACT_CORE_URL': JSON.stringify('https://cdn.jsdelivr.net/npm/tesseract.js-core@4.0.4/tesseract-core.wasm.js'),
            'process.env.TESSERACT_LANG_PATH': JSON.stringify('https://cdn.jsdelivr.net/npm/tesseract.js-data@4.0.0/eng'),
            // Define Nutritionix API keys for client 
            'process.env.NUTRITIONIX_APP_ID': JSON.stringify(process.env.NUTRITIONIX_APP_ID),
            'process.env.NUTRITIONIX_API_KEY': JSON.stringify(process.env.NUTRITIONIX_API_KEY),
          })
        );
      } else {
        console.warn('webpack.DefinePlugin is not available, skipping Tesseract environment variables');
      }
    }

    // Configure asset modules for handling wasm files and worker scripts
    config.module.rules.unshift({
      test: /tesseract\.js-core[\\/].*?\.wasm$/,
      type: 'asset/resource',
      generator: {
        filename: 'static/chunks/[name].[hash][ext]',
      },
    });
    
    config.module.rules.unshift({
      test: /tesseract\.js[\\/]dist[\\/]worker\.min\.js$/,
      type: 'asset/resource',
      generator: {
        filename: 'static/chunks/[name].[hash][ext]',
      },
    });

    // Fix for undici private class fields
    // Exclude undici modules from normal processing
    config.module.rules.push({
      test: /undici\/lib\/web\/fetch\/util\.js$/,
      use: 'null-loader',
      include: [
        /node_modules\/@firebase\/storage\/node_modules\/undici/,
        /node_modules\/firebase\/node_modules\/undici/
      ]
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