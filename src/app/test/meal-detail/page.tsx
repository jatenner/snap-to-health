'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  highConfidenceMeal, 
  lowConfidenceMeal,
  fallbackMeal,
  sessionMeal,
  emptyAnalysisMeal
} from '@/fixtures/test-meals';

// Import the real MealDetailPage component
import MealDetailPage from '@/app/meals/[id]/page';

export default function TestMealDetailPage() {
  const [selectedScenario, setSelectedScenario] = useState('high-confidence');
  
  // Get the meal data based on the selected scenario
  const getMealData = () => {
    switch (selectedScenario) {
      case 'high-confidence':
        return highConfidenceMeal;
      case 'low-confidence':
        return lowConfidenceMeal;
      case 'fallback':
        return fallbackMeal;
      case 'session':
        return sessionMeal;
      case 'empty':
        return emptyAnalysisMeal;
      default:
        return highConfidenceMeal;
    }
  };
  
  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-4 md:p-6 mb-8">
          <h1 className="text-2xl font-bold text-primary mb-4">Meal Detail Test Scenarios</h1>
          <p className="text-gray-600 mb-6">
            This page allows you to view the meal detail page with different test scenarios to validate the UI components.
          </p>
          
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-medium text-gray-800 mb-2">Select a Test Scenario:</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
                <button
                  onClick={() => setSelectedScenario('high-confidence')}
                  className={`p-2 rounded-md transition-colors ${selectedScenario === 'high-confidence' ? 'bg-primary text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  High Confidence
                </button>
                <button
                  onClick={() => setSelectedScenario('low-confidence')}
                  className={`p-2 rounded-md transition-colors ${selectedScenario === 'low-confidence' ? 'bg-primary text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  Low Confidence
                </button>
                <button
                  onClick={() => setSelectedScenario('fallback')}
                  className={`p-2 rounded-md transition-colors ${selectedScenario === 'fallback' ? 'bg-primary text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  Fallback
                </button>
                <button
                  onClick={() => setSelectedScenario('session')}
                  className={`p-2 rounded-md transition-colors ${selectedScenario === 'session' ? 'bg-primary text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  Session Meal
                </button>
                <button
                  onClick={() => setSelectedScenario('empty')}
                  className={`p-2 rounded-md transition-colors ${selectedScenario === 'empty' ? 'bg-primary text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  Empty Analysis
                </button>
              </div>
            </div>
            
            <div className="border-t border-gray-200 pt-4">
              <h2 className="text-lg font-medium text-gray-800 mb-2">
                Testing: <span className="text-primary">{selectedScenario.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
              </h2>
              <div className="bg-gray-50 p-2 rounded-md mb-4">
                <p className="text-xs text-gray-600">
                  Note: This is a test page that uses mock data. The components render as they would in a production environment.
                  Some interactive features like API calls or database updates will not function.
                </p>
              </div>
              
              {/* This would display the actual MealDetailPage component, 
                  but it needs to be mocked for testing purposes */}
              <div className="bg-white rounded-lg shadow-md border border-gray-200">
                <div className="p-4 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center">
                    <Link href="/test/meal-detail" className="text-gray-600 hover:text-primary mr-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </Link>
                    <div className="flex-1">
                      <h1 className="text-lg font-medium text-gray-800">{getMealData().mealName}</h1>
                    </div>
                    <div className="text-xs text-gray-500">
                      {getMealData().createdAt.toLocaleDateString()}
                    </div>
                  </div>
                </div>
                
                {/* Mock image */}
                <div className="h-64 bg-gray-200 flex items-center justify-center">
                  <div className="text-gray-500">
                    [Image: {getMealData().id}]
                  </div>
                </div>
                
                {/* Here we would render the main components */}
                <div className="p-5">
                  <pre className="bg-gray-100 p-4 rounded-md overflow-auto text-xs">
                    {JSON.stringify(getMealData().analysis, null, 2)}
                  </pre>
                </div>
                
                {/* We'd need to create a version of these components that can be tested with mock data */}
                <div className="border-t border-gray-200 p-4">
                  <div className="flex justify-between space-x-4">
                    <button className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-center">
                      Return to Tests
                    </button>
                    <Link 
                      href="/test/meal-detail"
                      className="flex-1 py-2 px-4 bg-primary hover:bg-secondary text-white rounded-md text-center transition-colors"
                    >
                      New Test
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-8 pt-4 border-t border-gray-200">
            <h2 className="text-lg font-medium text-gray-800 mb-4">Next Steps for QA</h2>
            <ul className="list-disc pl-5 space-y-2 text-gray-700">
              <li>Extract components into separate files in <code>src/components/meal-detail/</code></li>
              <li>Implement unit tests for each component with Jest</li>
              <li>Add a "Save this Meal" button for session-based meals</li>
              <li>Create user feedback collection component</li>
              <li>Implement confidence score explainer modal</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 