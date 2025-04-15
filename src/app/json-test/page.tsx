'use client';

import React, { useState } from 'react';
import axios from 'axios';

export default function JsonTestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [response, setResponse] = useState<any>(null);
  const [parsedJson, setParsedJson] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResponse(null);
      setParsedJson(null);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResponse(null);
    setParsedJson(null);
    
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      const result = await axios.post('/api/test-vision', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      setResponse(result.data);
      
      if (typeof result.data.response.content === 'object') {
        setParsedJson(result.data.response.content);
      } else {
        try {
          setParsedJson(JSON.parse(result.data.response.content));
        } catch (e) {
          // Try to find JSON in the response
          const match = result.data.response.content.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              setParsedJson(JSON.parse(match[0]));
              setError('Warning: Had to extract JSON from text response');
            } catch (e2) {
              setError('Failed to parse JSON: ' + (e2 as Error).message);
            }
          } else {
            setError('No valid JSON found in response');
          }
        }
      }
    } catch (error: any) {
      console.error('Error testing Vision API:', error);
      setError(error.response?.data?.error || error.message || 'Failed to test Vision API');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">JSON Response Test</h1>
      <p className="mb-6 text-gray-600">
        This page tests if GPT-4o can generate valid, parsable JSON from an image.
      </p>
      
      <form onSubmit={handleSubmit} className="mb-8 space-y-4">
        <div>
          <label className="block mb-2 font-medium">Upload Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="w-full p-2 border rounded"
          />
        </div>
        
        <button
          type="submit"
          disabled={loading || !file}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
        >
          {loading ? 'Testing...' : 'Test JSON Response'}
        </button>
      </form>
      
      {error && (
        <div className="p-4 mb-6 bg-red-50 border border-red-200 rounded text-red-800">
          <h3 className="font-medium mb-1">Error:</h3>
          <p>{error}</p>
        </div>
      )}
      
      {parsedJson && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Parsed JSON</h2>
          <div className="bg-green-50 border border-green-200 p-4 rounded">
            <pre className="whitespace-pre-wrap overflow-auto text-sm bg-white p-3 rounded border">
              {JSON.stringify(parsedJson, null, 2)}
            </pre>
          </div>
        </div>
      )}
      
      {response && (
        <div>
          <h2 className="text-xl font-semibold mb-2">Raw Response</h2>
          <div className="bg-gray-50 border p-4 rounded">
            <pre className="whitespace-pre-wrap overflow-auto text-sm bg-white p-3 rounded border">
              {JSON.stringify(response, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
} 