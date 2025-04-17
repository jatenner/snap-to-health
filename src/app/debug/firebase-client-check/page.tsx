'use client';

import { useState, useEffect } from 'react';
import { app, auth, db, storage } from '@/lib/firebase';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { ref, listAll } from 'firebase/storage';

export default function FirebaseClientCheckPage() {
  const [status, setStatus] = useState<{
    initialized: boolean;
    apiKey: string;
    projectId: string;
    storageBucket: string;
    firestoreTest: string;
    storageTest: string;
    error: string | null;
    envVars: Record<string, string>;
  }>({
    initialized: false,
    apiKey: '',
    projectId: '',
    storageBucket: '',
    firestoreTest: '',
    storageTest: '',
    error: null,
    envVars: {}
  });

  useEffect(() => {
    async function checkFirebase() {
      try {
        // Check environment variables first
        const envVars: Record<string, string> = {};
        const envVarKeys = [
          'NEXT_PUBLIC_FIREBASE_API_KEY',
          'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
          'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
          'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
          'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
          'NEXT_PUBLIC_FIREBASE_APP_ID'
        ];
        
        envVarKeys.forEach(key => {
          const value = process.env[key];
          envVars[key] = value ? 
            (key === 'NEXT_PUBLIC_FIREBASE_API_KEY' ? 
              `${value.substring(0, 6)}...` : value) : 
            'MISSING';
        });
        
        // Update state with environment variable info
        setStatus(prev => ({
          ...prev,
          envVars
        }));
        
        // Check Firebase app initialization
        if (!app) {
          throw new Error('Firebase app not initialized');
        }

        // Get configuration info
        const apiKey = app.options.apiKey 
          ? `${app.options.apiKey.substring(0, 6)}...` 
          : 'MISSING';
        
        const projectId = app.options.projectId || 'MISSING';
        const storageBucket = app.options.storageBucket || 'MISSING';

        setStatus(prev => ({
          ...prev,
          initialized: true,
          apiKey,
          projectId,
          storageBucket
        }));

        // Check if API key matches environment variable
        if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY && app.options.apiKey !== process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
          console.error("❌ API key mismatch between environment variable and initialized app");
          console.error(`Environment: ${process.env.NEXT_PUBLIC_FIREBASE_API_KEY.substring(0, 6)}...`);
          console.error(`App config: ${app.options.apiKey?.substring(0, 6) || 'undefined'}...`);
        }

        // Test Firestore connection
        try {
          if (!db) throw new Error('Firestore not initialized');
          
          // Try to read from users collection
          const usersRef = collection(db, 'users');
          const querySnapshot = await getDocs(query(usersRef, limit(1)));
          
          setStatus(prev => ({
            ...prev,
            firestoreTest: `Success! Found ${querySnapshot.size} documents in users collection`
          }));
        } catch (firestoreError: any) {
          setStatus(prev => ({
            ...prev,
            firestoreTest: `Error: ${firestoreError.message}`
          }));
        }

        // Test Storage connection
        try {
          if (!storage) throw new Error('Storage not initialized');
          
          // Try to list files at root
          const rootRef = ref(storage, '/');
          const result = await listAll(rootRef);
          
          setStatus(prev => ({
            ...prev,
            storageTest: `Success! Found ${result.items.length} files and ${result.prefixes.length} folders`
          }));
        } catch (storageError: any) {
          setStatus(prev => ({
            ...prev,
            storageTest: `Error: ${storageError.message}`
          }));
        }
      } catch (error: any) {
        setStatus(prev => ({
          ...prev,
          error: error.message
        }));
      }
    }

    checkFirebase();
  }, []);

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Firebase Client Check</h1>
      
      <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
        <div>
          <h2 className="text-lg font-semibold mb-2">Environment Variables</h2>
          <div className="bg-gray-100 p-3 rounded-lg mb-4 overflow-auto max-h-48">
            <pre className="text-xs">
              {JSON.stringify(status.envVars, null, 2)}
            </pre>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="font-semibold">Initialization Status:</div>
          <div>{status.initialized ? '✅ Initialized' : '❌ Not Initialized'}</div>
          
          <div className="font-semibold">API Key:</div>
          <div>{status.apiKey || 'Loading...'}</div>
          
          <div className="font-semibold">Project ID:</div>
          <div>{status.projectId || 'Loading...'}</div>
          
          <div className="font-semibold">Storage Bucket:</div>
          <div>{status.storageBucket || 'Loading...'}</div>
        </div>
        
        <hr className="my-4" />
        
        <div>
          <h2 className="text-lg font-semibold mb-2">Connection Tests</h2>
          
          <div className="space-y-2">
            <div>
              <div className="font-medium">Firestore Test:</div>
              <div className="ml-4 text-sm">{status.firestoreTest || 'Testing...'}</div>
            </div>
            
            <div>
              <div className="font-medium">Storage Test:</div>
              <div className="ml-4 text-sm">{status.storageTest || 'Testing...'}</div>
            </div>
          </div>
        </div>
        
        {status.error && (
          <div className="mt-4 p-3 bg-red-100 text-red-800 rounded">
            <strong>Error:</strong> {status.error}
          </div>
        )}
      </div>
    </div>
  );
} 