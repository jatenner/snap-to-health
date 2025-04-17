'use client';

import { useState, useEffect } from 'react';
import { app as clientApp } from '@/lib/firebase';

export default function ApiKeyCheckPage() {
  const [clientConfig, setClientConfig] = useState<Record<string, string>>({});
  const [serverConfig, setServerConfig] = useState<Record<string, string>>({});
  const [selectedKey, setSelectedKey] = useState('');
  const [decodedValue, setDecodedValue] = useState('');
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Firebase environment variables to check
  const clientEnvKeys = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
    'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
  ];

  // Load environment variables when component mounts
  useEffect(() => {
    // Get client-side env variables
    const clientVars: Record<string, string> = {};
    clientEnvKeys.forEach(key => {
      const value = process.env[key];
      clientVars[key] = value ? 
        (key === 'NEXT_PUBLIC_FIREBASE_API_KEY' ? 
          `${value.substring(0, 6)}...` : value) : 
        'MISSING';
    });
    setClientConfig(clientVars);

    // Get Firebase app config if available
    if (clientApp) {
      clientVars['Firebase App Initialized'] = 'Yes';
      clientVars['Firebase Project ID'] = clientApp.options.projectId || 'MISSING';
      clientVars['Firebase Storage Bucket'] = clientApp.options.storageBucket || 'MISSING';
    } else {
      clientVars['Firebase App Initialized'] = 'No';
    }

    // Check server-side Firebase configuration
    fetchServerConfig();
    
    setIsLoading(false);
  }, []);

  // Fetch server-side config
  const fetchServerConfig = async () => {
    try {
      setTestResults({status: 'loading', message: 'Checking server configuration...'});
      
      const response = await fetch('/api/debug/firebase-admin-check');
      const data = await response.json();
      
      setServerConfig(data.config || {});
      setTestResults({
        status: data.success ? 'success' : 'error',
        message: data.message,
        details: data.details || {}
      });
    } catch (error: any) {
      setTestResults({
        status: 'error', 
        message: `Failed to check server config: ${error.message}`
      });
    }
  };

  // Decode base64 value
  const decodeBase64 = () => {
    if (!selectedKey) return;
    
    try {
      // Get raw value from stored config
      const rawValue = 
        selectedKey.startsWith('NEXT_PUBLIC') ? 
          process.env[selectedKey] : 
          serverConfig[selectedKey];
      
      if (!rawValue) {
        setDecodedValue('No value to decode');
        return;
      }
      
      // Decode base64
      const decoded = atob(rawValue);
      
      // Mask sensitive data - show only first and last few chars
      const displayValue = decoded.length > 100 ? 
        `${decoded.substring(0, 50)}...${decoded.substring(decoded.length - 50)}` : 
        decoded;
      
      // Analysis of the decoded value
      const analysis = [];
      
      if (decoded.includes('-----BEGIN PRIVATE KEY-----')) {
        analysis.push('✅ Contains PEM header');
      } else {
        analysis.push('❌ Missing PEM header');
      }
      
      if (decoded.includes('-----END PRIVATE KEY-----')) {
        analysis.push('✅ Contains PEM footer');
      } else {
        analysis.push('❌ Missing PEM footer');
      }
      
      if (decoded.includes('\n')) {
        analysis.push(`✅ Contains newlines (${(decoded.match(/\n/g) || []).length} found)`);
      } else {
        analysis.push('❌ No newlines found');
      }
      
      if (decoded.includes('\\n')) {
        analysis.push('⚠️ Contains escaped newlines (\\n)');
      }
      
      setDecodedValue(`${displayValue}\n\nAnalysis:\n${analysis.join('\n')}`);
    } catch (e) {
      setDecodedValue(`Error decoding: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Test Firebase Admin connection
  const testFirebaseAdminConnection = async () => {
    try {
      setTestResults({status: 'loading', message: 'Testing Firebase Admin connection...'});
      
      const response = await fetch('/api/debug/firebase-admin-test');
      const data = await response.json();
      
      setTestResults({
        status: data.success ? 'success' : 'error',
        message: data.message,
        details: data.details || {}
      });
    } catch (error: any) {
      setTestResults({
        status: 'error', 
        message: `Test failed: ${error.message}`
      });
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Firebase Configuration Debug</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Client-Side Configuration</h2>
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <h3 className="text-md font-medium mb-2">Environment Variables:</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left py-2 px-4">Variable</th>
                  <th className="text-left py-2 px-4">Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(clientConfig).map(([key, value]) => (
                  <tr key={key} className="border-t border-gray-200">
                    <td className="py-2 px-4 font-mono text-xs">{key}</td>
                    <td className="py-2 px-4 font-mono text-xs">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Server-Side Configuration</h2>
        <div className="flex space-x-4 mb-4">
          <button 
            onClick={fetchServerConfig}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Check Server Config
          </button>
          <button 
            onClick={testFirebaseAdminConnection}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Test Firestore Connection
          </button>
        </div>
        
        {testResults.status === 'loading' && (
          <div className="text-blue-500">Loading...</div>
        )}
        
        {testResults.status === 'success' && (
          <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-4">
            <div className="text-green-700 font-medium">✅ {testResults.message}</div>
            {testResults.details && Object.entries(testResults.details).length > 0 && (
              <pre className="mt-2 text-xs overflow-auto bg-green-100 p-2 rounded">
                {JSON.stringify(testResults.details, null, 2)}
              </pre>
            )}
          </div>
        )}
        
        {testResults.status === 'error' && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-4">
            <div className="text-red-700 font-medium">❌ {testResults.message}</div>
            {testResults.details && Object.entries(testResults.details).length > 0 && (
              <pre className="mt-2 text-xs overflow-auto bg-red-100 p-2 rounded">
                {JSON.stringify(testResults.details, null, 2)}
              </pre>
            )}
          </div>
        )}
        
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-md font-medium mb-2">Server Environment Variables:</h3>
          {Object.keys(serverConfig).length === 0 ? (
            <div className="text-gray-500 italic">No data available. Click "Check Server Config".</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left py-2 px-4">Variable</th>
                    <th className="text-left py-2 px-4">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(serverConfig).map(([key, value]) => (
                    <tr key={key} className="border-t border-gray-200">
                      <td className="py-2 px-4 font-mono text-xs">{key}</td>
                      <td className="py-2 px-4 font-mono text-xs">
                        {typeof value === 'string' 
                          ? (key.includes('KEY') || key.includes('SECRET') 
                              ? `${value.substring(0, 8)}...` 
                              : value)
                          : JSON.stringify(value)
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Base64 Decoder Tool</h2>
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Select a key to decode:</label>
            <select 
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="">-- Select a key --</option>
              <optgroup label="Server-side keys">
                <option value="FIREBASE_PRIVATE_KEY_BASE64">FIREBASE_PRIVATE_KEY_BASE64</option>
                {Object.keys(serverConfig)
                  .filter(key => key.includes('BASE64') || key.includes('ENCODED'))
                  .map(key => (
                    <option key={key} value={key}>{key}</option>
                  ))
                }
              </optgroup>
              <optgroup label="Client-side keys">
                {clientEnvKeys
                  .filter(key => process.env[key])
                  .map(key => (
                    <option key={key} value={key}>{key}</option>
                  ))
                }
              </optgroup>
            </select>
          </div>
          
          <button 
            onClick={decodeBase64}
            disabled={!selectedKey}
            className={`px-4 py-2 rounded ${
              selectedKey 
                ? 'bg-blue-500 text-white hover:bg-blue-600' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Decode
          </button>
          
          {decodedValue && (
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">Decoded Value:</label>
              <pre className="bg-gray-100 p-4 rounded whitespace-pre-wrap font-mono text-xs overflow-auto max-h-80">
                {decodedValue}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 