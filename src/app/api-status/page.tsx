'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import axios from 'axios';

export default function ApiStatusPage() {
  const [openaiStatus, setOpenaiStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [openaiError, setOpenaiError] = useState<string | null>(null);
  const [openaiDetails, setOpenaiDetails] = useState<any>(null);
  
  useEffect(() => {
    checkOpenAiStatus();
  }, []);
  
  const checkOpenAiStatus = async () => {
    try {
      setOpenaiStatus('loading');
      const response = await axios.get('/api/test-openai');
      setOpenaiDetails(response.data);
      setOpenaiStatus('success');
    } catch (error: any) {
      console.error('Error testing OpenAI:', error);
      setOpenaiStatus('error');
      setOpenaiError(error.response?.data?.error || error.message || 'Unknown error');
    }
  };
  
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">API Status Dashboard</h1>
      
      <div className="space-y-6">
        {/* OpenAI API Status */}
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-100 p-4 border-b">
            <h2 className="text-xl font-semibold">OpenAI API Status</h2>
          </div>
          
          <div className="p-4">
            <div className="flex items-center mb-4">
              <div className={`w-3 h-3 rounded-full mr-2 ${
                openaiStatus === 'loading' ? 'bg-yellow-500' :
                openaiStatus === 'success' ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <span className="font-medium">
                {openaiStatus === 'loading' ? 'Checking...' :
                 openaiStatus === 'success' ? 'Connected' : 'Connection Error'}
              </span>
            </div>
            
            {openaiStatus === 'success' && openaiDetails && (
              <div className="bg-green-50 border border-green-200 rounded p-3 mb-4">
                <p>✅ OpenAI API is working correctly</p>
                <p className="text-sm text-gray-700 mt-1">
                  Response: {openaiDetails.response?.content || 'No content'}
                </p>
              </div>
            )}
            
            {openaiStatus === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
                <p className="text-red-700">❌ OpenAI API connection failed</p>
                {openaiError && (
                  <p className="text-sm text-red-600 mt-1">{openaiError}</p>
                )}
              </div>
            )}
            
            <div className="flex mt-4 space-x-3">
              <button
                onClick={checkOpenAiStatus}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Refresh Status
              </button>
              
              <Link 
                href="/test-api"
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Go to API Tests
              </Link>
            </div>
          </div>
        </div>
        
        {/* Configuration Information */}
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-100 p-4 border-b">
            <h2 className="text-xl font-semibold">API Configuration</h2>
          </div>
          
          <div className="p-4">
            <div className="mb-4">
              <h3 className="font-medium mb-2">OpenAI Vision Integration</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                <li>Using <strong>GPT-4o</strong> model with vision support</li>
                <li>Image data sent as base64-encoded JPEG</li>
                <li>Structured JSON response format</li>
              </ul>
            </div>
            
            <div className="mb-4">
              <h3 className="font-medium mb-2">Testing Tools</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                <li><Link href="/test-api" className="text-blue-600 hover:underline">API Test Page</Link> - Test basic API connectivity</li>
                <li><Link href="/test-upload" className="text-blue-600 hover:underline">Image Upload Test</Link> - Test image upload functionality</li>
                <li><Link href="/json-test" className="text-blue-600 hover:underline">JSON Response Test</Link> - Test JSON parsing from GPT-4o</li>
                <li><Link href="/" className="text-blue-600 hover:underline">Main App</Link> - Use the full application</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 