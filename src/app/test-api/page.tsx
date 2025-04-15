'use client';

import React, { useState } from 'react';
import axios from 'axios';

export default function TestApiPage() {
  const [testResult, setTestResult] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  
  const testOpenAI = async () => {
    setLoading(true);
    setError(null);
    setTestResult(null);
    
    try {
      const response = await axios.get('/api/test-openai');
      setTestResult(response.data);
    } catch (error: any) {
      console.error('Error testing OpenAI API:', error);
      setError(error.response?.data?.error || error.message || 'Failed to test OpenAI API');
    } finally {
      setLoading(false);
    }
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };
  
  const testVision = async () => {
    if (!file) {
      setError('Please select an image file first');
      return;
    }
    
    setLoading(true);
    setError(null);
    setTestResult(null);
    
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      const response = await axios.post('/api/test-vision', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      setTestResult(response.data);
    } catch (error: any) {
      console.error('Error testing Vision API:', error);
      setError(error.response?.data?.error || error.message || 'Failed to test Vision API');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">API Testing Page</h1>
      
      <div className="space-y-8">
        <div className="p-4 border rounded-lg bg-gray-50">
          <h2 className="text-xl font-semibold mb-4">Test OpenAI API Connection</h2>
          <p className="mb-4 text-gray-600">Tests a simple text request to verify OpenAI API connection.</p>
          <button 
            onClick={testOpenAI}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-blue-300"
          >
            {loading ? 'Testing...' : 'Test OpenAI API'}
          </button>
        </div>
        
        <div className="p-4 border rounded-lg bg-gray-50">
          <h2 className="text-xl font-semibold mb-4">Test GPT-4 Vision API</h2>
          <p className="mb-4 text-gray-600">Tests image upload and GPT-4o with vision capabilities.</p>
          
          <div className="mb-4">
            <label className="block mb-2">Select an image:</label>
            <input 
              type="file" 
              accept="image/*"
              onChange={handleFileChange}
              className="w-full p-2 border rounded"
            />
          </div>
          
          <button 
            onClick={testVision}
            disabled={loading || !file}
            className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-green-300"
          >
            {loading ? 'Testing...' : 'Test Vision API'}
          </button>
        </div>
        
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <h3 className="font-semibold mb-2">Error:</h3>
            <p>{error}</p>
          </div>
        )}
        
        {testResult && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="font-semibold text-green-800 mb-2">Test Result:</h3>
            <pre className="whitespace-pre-wrap overflow-auto text-sm bg-white p-3 rounded border">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
} 