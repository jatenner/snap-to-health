# Firebase Storage Webpack Fix for Vercel Deployment

## Problem Description

The project was encountering build errors during Vercel deployment due to conflicts between Firebase Storage and Next.js/Webpack. Specifically, the `@firebase/storage` module was importing `undici`, which created problems during server-side rendering and serverless function deployment.

The error occurred because:
1. Firebase Storage client-side SDK uses private class fields and imports Node.js-specific modules like `undici`
2. Next.js server components and API routes attempted to use these client-side modules
3. Webpack's default handling of these imports caused failures in the Edge runtime environment

## Solution Implementation

We made the following changes to fix the issue:

### 1. Updated Webpack Configuration

In `next.config.js`, we added specific handling for problematic modules:

```javascript
// Handle specific Firebase Storage modules that try to import undici
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
```

### 2. Created Server-Side Storage Implementation

We developed a server-specific storage implementation that uses Firebase Admin SDK instead of the client SDK:

- Created `src/lib/serverStorage.ts` with utilities for server-side storage operations
- Implemented safe initialization of Firebase Admin with proper error handling
- Added methods for uploading files and getting download URLs

### 3. Updated Storage Proxy API Route

We refactored the storage proxy API route to use the new server-side implementation:

- Updated `/api/proxy/storage/route.ts` to use the serverStorage module
- Added specific runtime flags to ensure Node.js runtime is used (not Edge)
- Improved error handling and logging

### 4. Added NPM Dependency

We added the required npm package:
```bash
npm install null-loader --save-dev
```

## Future Considerations

When updating Firebase packages in the future:

1. Check for changes in Firebase Storage implementations that might affect this fix
2. Ensure server and client code remains properly separated
3. Consider using Firebase v10's modular API to better isolate storage functionality
4. Test builds in a similar environment to Vercel before deploying

## Related Documentation

- [Firebase Storage Documentation](https://firebase.google.com/docs/storage)
- [Next.js Webpack Configuration](https://nextjs.org/docs/api-reference/next.config.js/custom-webpack-config)
- [Firebase Admin Storage SDK](https://firebase.google.com/docs/reference/admin/node/firebase-admin.storage) 