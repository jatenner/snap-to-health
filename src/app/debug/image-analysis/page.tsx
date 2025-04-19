'use client';

import React, { useState, useRef } from 'react';

export default function ImageAnalysisDebugPage() {
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check API status on component mount
  React.useEffect(() => {
    checkApiStatus();
  }, []);

  // Check API configuration and status
  const checkApiStatus = async () => {
    try {
      const response = await fetch('/api/debug/analyze-diagnostics');
      if (response.ok) {
        const data = await response.json();
        setApiStatus(data);
      } else {
        setError('Failed to get API status');
      }
    } catch (error) {
      setError('Error connecting to API');
      console.error(error);
    }
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle image submission
  const handleSubmit = async () => {
    if (!image) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setDiagnostics(null);

    try {
      const response = await fetch('/api/analyzeImage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          base64Image: image,
          healthGoals: ['general health'],
          dietaryPreferences: [],
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setResult(data.result);
      } else {
        setError(data.error || 'Analysis failed');
        // Still set the result if there's a fallback response
        if (data.result) {
          setResult(data.result);
        }
      }
      
      // Set diagnostics if available
      if (data.diagnostics) {
        setDiagnostics(data.diagnostics);
      }
      
    } catch (err) {
      setError('Failed to analyze image');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset the form
  const handleReset = () => {
    setImage(null);
    setResult(null);
    setDiagnostics(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Image Analysis Diagnostics</h1>
      
      {/* API Status */}
      <div className="mb-8 p-4 bg-gray-50 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">API Status</h2>
        {apiStatus ? (
          <div className="text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>Environment</div>
              <div className="font-mono">{apiStatus.environment}</div>
              
              <div>Nutritionix App ID</div>
              <div className={`font-mono ${apiStatus.apiKeys.nutritionixAppIdValid ? 'text-green-600' : 'text-red-600'}`}>
                {apiStatus.apiKeys.nutritionixAppId} {apiStatus.apiKeys.nutritionixAppIdValid ? '✓' : '✗'}
              </div>
              
              <div>Nutritionix API Key</div>
              <div className={`font-mono ${apiStatus.apiKeys.nutritionixApiKeyValid ? 'text-green-600' : 'text-red-600'}`}>
                {apiStatus.apiKeys.nutritionixApiKey} {apiStatus.apiKeys.nutritionixApiKeyValid ? '✓' : '✗'}
              </div>
              
              <div>OpenAI API Key</div>
              <div className="font-mono">{apiStatus.apiKeys.openaiApiKey}</div>
              
              <div>OCR Extraction</div>
              <div className="font-mono">{apiStatus.configuration.ocr.enabled ? 'Enabled' : 'Disabled'}</div>
              
              <div>OCR Confidence Threshold</div>
              <div className="font-mono">{apiStatus.configuration.ocr.confidenceThreshold}</div>
              
              <div>OpenAI Timeout</div>
              <div className="font-mono">{apiStatus.configuration.timeout.openaiTimeoutMs}ms</div>
            </div>
            <button 
              onClick={checkApiStatus} 
              className="mt-4 px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm"
            >
              Refresh
            </button>
          </div>
        ) : (
          <p>Loading API status...</p>
        )}
      </div>
      
      {/* Image Upload Form */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Test Image Analysis</h2>
        <div className="mb-4">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            ref={fileInputRef}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>
        
        {image && (
          <div className="mb-4">
            <img src={image} alt="Preview" className="max-w-xs max-h-48 object-contain border rounded" />
          </div>
        )}
        
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={!image || isLoading}
            className={`px-4 py-2 rounded ${
              !image || isLoading
                ? 'bg-gray-300 text-gray-500'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isLoading ? 'Analyzing...' : 'Analyze Image'}
          </button>
          
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Reset
          </button>
        </div>
      </div>
      
      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">
          <h3 className="font-semibold">Error</h3>
          <p>{error}</p>
        </div>
      )}
      
      {/* Analysis Results */}
      {result && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Analysis Results</h2>
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold">{result.description || 'No description'}</h3>
            
            {result.detailedIngredients && result.detailedIngredients.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold">Detected Ingredients:</h4>
                <ul className="list-disc pl-5">
                  {result.detailedIngredients.map((ing: any, i: number) => (
                    <li key={i}>
                      {ing.name} {ing.confidenceEmoji || ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {result.nutrients && result.nutrients.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold">Nutrition Information:</h4>
                <ul className="list-disc pl-5">
                  {result.nutrients.slice(0, 5).map((nut: any, i: number) => (
                    <li key={i}>
                      {nut.name}: {nut.value} {nut.unit}
                    </li>
                  ))}
                  {result.nutrients.length > 5 && <li>... and {result.nutrients.length - 5} more</li>}
                </ul>
              </div>
            )}
            
            {result.feedback && result.feedback.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold">Feedback:</h4>
                <ul className="list-disc pl-5">
                  {result.feedback.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {result.suggestions && result.suggestions.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold">Suggestions:</h4>
                <ul className="list-disc pl-5">
                  {result.suggestions.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {result.modelInfo && (
              <div className="mt-4 text-xs text-gray-500">
                <div>Model: {result.modelInfo.model}</div>
                {result.modelInfo.usedFallback && (
                  <div className="text-orange-500">Used fallback model</div>
                )}
                {result.modelInfo.ocrExtracted && (
                  <div>Text extracted with OCR</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Diagnostics Output */}
      {diagnostics && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Diagnostics</h2>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="mb-2">
              <span className="font-semibold">Request ID:</span> {diagnostics.requestId}
            </div>
            <div className="mb-2">
              <span className="font-semibold">Overall Success:</span>{' '}
              <span className={diagnostics.overallSuccess ? 'text-green-600' : 'text-red-600'}>
                {diagnostics.overallSuccess ? 'Success' : 'Failed'}
              </span>
            </div>
            <div className="mb-2">
              <span className="font-semibold">Total Duration:</span> {diagnostics.totalDurationMs}ms
            </div>
            <div className="mb-2">
              <span className="font-semibold">Summary:</span> {diagnostics.summary}
            </div>
            
            {diagnostics.stages && diagnostics.stages.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold">Processing Stages:</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm mt-1">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-2 py-1 text-left">Stage</th>
                        <th className="px-2 py-1 text-left">Status</th>
                        <th className="px-2 py-1 text-left">Duration</th>
                        <th className="px-2 py-1 text-left">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diagnostics.stages.map((stage: any, i: number) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-2 py-1">{stage.stage}</td>
                          <td className={`px-2 py-1 ${stage.success ? 'text-green-600' : 'text-red-600'}`}>
                            {stage.success ? '✓' : '✗'}
                          </td>
                          <td className="px-2 py-1">{stage.durationMs}ms</td>
                          <td className="px-2 py-1 text-red-600">
                            {stage.error || ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Raw JSON Output */}
      {(result || diagnostics) && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Raw JSON</h2>
          <div className="p-4 bg-gray-50 rounded-lg overflow-auto max-h-96">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {JSON.stringify({ result, diagnostics }, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
} 