"use client";

import React, { useEffect, useState } from 'react';

// Let's check if these UI component libraries exist in the project
// If not, we'll implement a simpler version without these dependencies
export default function PublicEnvTestPage() {
  const [loading, setLoading] = useState(true);
  const [apiInfo, setApiInfo] = useState<any>(null);
  const [serverApiInfo, setServerApiInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Get the public key directly from the browser environment
  const checkClientEnv = () => {
    setLoading(true);
    try {
      const publicKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || '';
      // Only show first and last few characters for security
      const maskedKey = publicKey 
        ? `${publicKey.substring(0, 6)}...${publicKey.substring(publicKey.length - 4)}`
        : 'not set';
      
      setApiInfo({
        key: maskedKey,
        length: publicKey.length,
        isValid: publicKey.startsWith('sk-')
      });
    } catch (err: any) {
      setError(err.message || 'Failed to check environment variables');
    } finally {
      setLoading(false);
    }
  };

  // Call the server API endpoint to get both keys
  const checkServerEnv = async () => {
    try {
      const response = await fetch('/api/test-env');
      const data = await response.json();
      setServerApiInfo(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch from server API');
    }
  };

  useEffect(() => {
    checkClientEnv();
    checkServerEnv();
  }, []);

  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Environment Variables Test</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6" role="alert">
          <div className="font-bold">Error</div>
          <div>{error}</div>
        </div>
      )}

      <div className="grid gap-6">
        <div className="border rounded-lg shadow-sm p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Client-Side Environment Check</h2>
            <p className="text-gray-600">
              Testing if NEXT_PUBLIC_OPENAI_API_KEY is accessible in the browser
            </p>
          </div>
          <div className="p-4">
            {loading ? (
              <p>Loading...</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center">
                  <span className="font-semibold mr-2">Public OpenAI API Key:</span>
                  <span>{apiInfo?.key}</span>
                  {apiInfo?.isValid ? (
                    <span className="ml-2 text-green-500">✓</span>
                  ) : (
                    <span className="ml-2 text-red-500">✗</span>
                  )}
                </div>
                <div>
                  <span className="font-semibold mr-2">Key Length:</span>
                  <span>{apiInfo?.length || 0} characters</span>
                </div>
              </div>
            )}
            <button 
              onClick={checkClientEnv} 
              className="mt-4 px-4 py-2 border rounded hover:bg-gray-100"
            >
              Refresh Client Check
            </button>
          </div>
        </div>

        <div className="border rounded-lg shadow-sm p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Server-Side Environment Check</h2>
            <p className="text-gray-600">
              Results from the /api/test-env endpoint
            </p>
          </div>
          <div className="p-4">
            {!serverApiInfo ? (
              <p>Loading server data...</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">OpenAI API Keys:</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="font-medium">Server Key:</div>
                    <div className="flex items-center">
                      {serverApiInfo.openaiApiKey.server}
                      {serverApiInfo.openaiApiKey.serverValid ? (
                        <span className="ml-2 text-green-500">✓</span>
                      ) : (
                        <span className="ml-2 text-red-500">✗</span>
                      )}
                    </div>
                    
                    <div className="font-medium">Public Key:</div>
                    <div className="flex items-center">
                      {serverApiInfo.openaiApiKey.public}
                      {serverApiInfo.openaiApiKey.publicValid ? (
                        <span className="ml-2 text-green-500">✓</span>
                      ) : (
                        <span className="ml-2 text-red-500">✗</span>
                      )}
                    </div>
                    
                    <div className="font-medium">Keys Match:</div>
                    <div className="flex items-center">
                      {serverApiInfo.openaiApiKey.keysMatch ? 'Yes' : 'No'}
                      {serverApiInfo.openaiApiKey.keysMatch ? (
                        <span className="ml-2 text-green-500">✓</span>
                      ) : (
                        <span className="ml-2 text-red-500">✗</span>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Other Environment Variables:</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(serverApiInfo.envVariables).map(([key, value]: [string, any]) => (
                      <React.Fragment key={key}>
                        <div className="font-medium">{key}:</div>
                        <div>{String(value)}</div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Deployment Info:</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="font-medium">Environment:</div>
                    <div>{serverApiInfo.environment}</div>
                    
                    <div className="font-medium">Is Vercel:</div>
                    <div>{serverApiInfo.isVercel ? 'Yes' : 'No'}</div>
                    
                    <div className="font-medium">Deployment URL:</div>
                    <div>{serverApiInfo.deploymentUrl}</div>
                    
                    <div className="font-medium">Request ID:</div>
                    <div>{serverApiInfo.requestId}</div>
                    
                    <div className="font-medium">Timestamp:</div>
                    <div>{serverApiInfo.timestamp}</div>
                  </div>
                </div>
              </div>
            )}
            <button 
              onClick={checkServerEnv} 
              className="mt-4 px-4 py-2 border rounded hover:bg-gray-100"
            >
              Refresh Server Check
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 