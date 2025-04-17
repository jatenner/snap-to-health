'use client';

import React, { useState } from 'react';
import axios from 'axios';

export default function OpenAITestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const testOpenAI = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      
      const response = await axios.get('/api/test-openai');
      console.log('OpenAI API test result:', response.data);
      setResult(response.data);
    } catch (error: any) {
      console.error('Error testing OpenAI API:', error);
      setError(
        error.response?.data?.error || 
        error.message || 
        'Failed to test OpenAI API'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-4">OpenAI API Test</h1>
      
      <div className="bg-white shadow-md rounded-lg p-4 sm:p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Test OpenAI API Connection</h2>
        <p className="mb-4 text-gray-600">
          This page tests the connection to OpenAI API using the API key in your environment variables.
          It will make a simple request to verify the API key is valid and working.
        </p>
        
        <button
          onClick={testOpenAI}
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Testing...' : 'Test OpenAI API'}
        </button>
        
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
            <p className="font-medium">Error:</p>
            <p>{error}</p>
          </div>
        )}
        
        {result && (
          <div className="mt-4">
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded mb-4">
              <p className="font-medium">Status: {result.status}</p>
              <p>API Key: {result.apiKeyFirstChars} (length: {result.apiKeyLength} chars)</p>
            </div>
            
            <div className="p-4 bg-gray-50 border border-gray-200 rounded">
              <p className="font-medium mb-2">Response from OpenAI:</p>
              <p className="text-gray-700">{result.response?.content}</p>
              
              {result.response?.usage && (
                <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                  <p>Model: {result.response.model}</p>
                  <p>Tokens used: {result.response.usage.total_tokens} 
                    (Prompt: {result.response.usage.prompt_tokens}, 
                    Completion: {result.response.usage.completion_tokens})
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      <div className="text-sm text-gray-500">
        <p>
          Note: Vercel environment variables should be copied from .env.local (development) 
          or set directly in the Vercel dashboard (production).
        </p>
      </div>
    </div>
  );
} 