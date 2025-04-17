'use client';

import { useEffect } from 'react';

/**
 * This component checks Firebase environment variables in client-side code
 * It only performs checks in development mode to avoid console logs in production
 */
export default function FirebaseEnvChecker() {
  useEffect(() => {
    // Only run checks in development mode
    if (process.env.NODE_ENV !== 'development') return;
    
    console.log('🔍 Checking Firebase environment variables on client...');
    
    const requiredVars = [
      'NEXT_PUBLIC_FIREBASE_API_KEY',
      'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
      'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
      'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
      'NEXT_PUBLIC_FIREBASE_APP_ID'
    ];
    
    const missingVars: string[] = [];
    
    // Check if the required vars are defined
    requiredVars.forEach(varName => {
      if (!process.env[varName]) {
        missingVars.push(varName);
      }
    });
    
    if (missingVars.length > 0) {
      console.error('❌ Missing required Firebase environment variables:', missingVars.join(', '));
      console.error('Make sure these variables are properly set in .env.local or Vercel environment variables');
    } else {
      console.log('✅ All required Firebase environment variables are loaded');
      
      // Check API key format
      const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      if (apiKey && (!apiKey.startsWith('AIza') || apiKey.length < 30)) {
        console.error('⚠️ Firebase API key may be invalid - doesn\'t match expected format (AIza...)');
      }
    }
    
    // Check Next.js config
    console.log('🔍 Next.js env configuration:');
    
    if (typeof window !== 'undefined') {
      const config = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.substring(0, 6) + '...',
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      };
      
      console.log(JSON.stringify(config, null, 2));
    }
  }, []);
  
  // This component doesn't render anything
  return null;
} 