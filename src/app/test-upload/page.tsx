'use client';

import React, { useState } from 'react';
import axios from 'axios';

export default function TestUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [response, setResponse] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResponse(null);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      // Use the debug endpoint to test image upload
      const result = await axios.post('/api/debug-image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      setResponse(result.data);
    } catch (error: any) {
      console.error('Error uploading image:', error);
      setError(error.response?.data?.error || error.message || 'Failed to upload image');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Image Upload Test</h1>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-2">Select an image:</label>
          <input 
            type="file" 
            accept="image/*"
            onChange={handleFileChange}
            className="w-full p-2 border rounded"
          />
        </div>
        
        {error && (
          <div className="p-3 bg-red-100 border border-red-300 text-red-700 rounded">
            {error}
          </div>
        )}
        
        <button
          type="submit"
          disabled={!file || isLoading}
          className="w-full p-2 bg-blue-500 text-white rounded disabled:bg-blue-300"
        >
          {isLoading ? 'Uploading...' : 'Upload Image'}
        </button>
      </form>
      
      {response && (
        <div className="mt-6 p-4 border rounded bg-gray-50">
          <h2 className="text-lg font-semibold mb-2">Response:</h2>
          <pre className="whitespace-pre-wrap overflow-auto text-xs">
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
} 