'use client';

import React, { useState } from 'react';

// Different formats to test
const TEST_FORMATS = {
  array: {
    feedback: ["Array item 1", "Array item 2"],
    suggestions: ["Suggestion 1", "Suggestion 2", "Suggestion 3"]
  },
  string: {
    feedback: "Single string feedback",
    suggestions: "Single string suggestion"
  },
  empty: {
    feedback: [],
    suggestions: []
  },
  nullValues: {
    feedback: null,
    suggestions: null
  },
  undefined: {
    feedback: undefined,
    suggestions: undefined
  }
};

export default function FeedbackTest() {
  const [testFormat, setTestFormat] = useState<string>("array");
  
  // Process feedback based on type
  const processFeedback = (feedback: any): string[] => {
    if (Array.isArray(feedback)) {
      return feedback.length > 0 ? feedback : ["No feedback available."];
    }
    
    if (typeof feedback === 'string' && feedback.trim()) {
      return [feedback];
    }
    
    return ["No feedback available."];
  };
  
  // Get the current test data
  const currentTest = TEST_FORMATS[testFormat as keyof typeof TEST_FORMATS];
  const processedFeedback = processFeedback(currentTest.feedback);
  const processedSuggestions = processFeedback(currentTest.suggestions);
  
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Feedback Format Test</h1>
      
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Select Format:</label>
        <select 
          value={testFormat}
          onChange={(e) => setTestFormat(e.target.value)}
          className="w-full p-2 border rounded"
        >
          {Object.keys(TEST_FORMATS).map(format => (
            <option key={format} value={format}>{format}</option>
          ))}
        </select>
      </div>
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Original Format</h2>
        <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-xs">
          {JSON.stringify(currentTest, null, 2)}
        </pre>
      </div>
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Processed Result</h2>
        
        <div className="mb-6">
          <h3 className="font-bold text-navy text-lg mb-3">Feedback</h3>
          <div className="bg-indigo/5 border border-indigo/20 rounded-xl p-4">
            <ul className="space-y-2.5">
              {processedFeedback.map((item, index) => (
                <li key={index} className="flex">
                  <span className="text-indigo mr-2.5 mt-0.5">•</span>
                  <span className="text-slate">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        <div>
          <h3 className="font-bold text-navy text-lg mb-3">Suggestions</h3>
          <div className="bg-indigo/5 border border-indigo/20 rounded-xl p-4">
            <ul className="space-y-2.5">
              {processedSuggestions.map((item, index) => (
                <li key={index} className="flex">
                  <span className="text-indigo mr-2.5 mt-0.5">{index + 1}.</span>
                  <span className="text-slate">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 