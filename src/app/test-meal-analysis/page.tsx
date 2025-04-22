'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Define the core types needed for testing
interface NutrientDetail {
  name: string;
  value: string | number;
  unit: string;
  isHighlight: boolean;
}

interface DetailedIngredient {
  name: string;
  category: string;
  confidence: number;
  confidenceEmoji?: string;
}

interface AnalysisResult {
  description: string;
  nutrients: NutrientDetail[];
  feedback: string[];
  suggestions: string[];
  goalScore: number | { overall: number; specific: Record<string, number> };
  goalName?: string;
  detailedIngredients: DetailedIngredient[];
  fallback?: boolean;
  lowConfidence?: boolean;
  modelInfo?: {
    model?: string;
    usedFallback?: boolean;
  };
}

// Sample test cases representing different scenarios
const TEST_CASES: Record<string, AnalysisResult> = {
  complete: {
    description: "This meal consists of oranges which are rich in Vitamin C and fiber.",
    nutrients: [
      { name: 'Calories', value: 62, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 1.2, unit: 'g', isHighlight: true },
      { name: 'Carbohydrates', value: 15.4, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0.2, unit: 'g', isHighlight: true },
      { name: 'Fiber', value: 3.1, unit: 'g', isHighlight: true },
      { name: 'Vitamin C', value: 70, unit: 'mg', isHighlight: true }
    ],
    feedback: [
      "Oranges are excellent for immune support due to high vitamin C content.",
      "This fruit is hydrating and provides natural sugars for energy."
    ],
    suggestions: [
      "Consider pairing with a protein source for a more balanced snack.",
      "For better sleep, consume this at least 2 hours before bedtime."
    ],
    goalScore: 8,
    goalName: "Improve Sleep",
    detailedIngredients: [
      { name: "Orange", category: "fruit", confidence: 0.98, confidenceEmoji: "✅" }
    ]
  },
  
  missingDescription: {
    description: "",
    nutrients: [
      { name: 'Calories', value: 62, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 1.2, unit: 'g', isHighlight: true }
    ],
    feedback: ["Limited analysis available for this meal."],
    suggestions: ["Try uploading a clearer image for better results."],
    goalScore: 5,
    goalName: "General Health",
    detailedIngredients: [
      { name: "Food item", category: "unknown", confidence: 0.6, confidenceEmoji: "🟡" }
    ]
  },
  
  zeroValues: {
    description: "Meal analysis completed with limited information.",
    nutrients: [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
    ],
    feedback: ["Unable to analyze nutrients from this image."],
    suggestions: ["Try photographing food from directly above."],
    goalScore: 0,
    goalName: "Weight Loss",
    detailedIngredients: [],
    fallback: true
  },
  
  objectGoalScore: {
    description: "A balanced meal with protein and vegetables.",
    nutrients: [
      { name: 'Calories', value: 450, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 25, unit: 'g', isHighlight: true }
    ],
    feedback: ["This meal contains a good balance of macronutrients."],
    suggestions: ["Add some whole grains for additional fiber."],
    goalScore: {
      overall: 7,
      specific: {
        protein: 8,
        fiber: 6,
        vitamins: 7
      }
    },
    goalName: "Build Muscle",
    detailedIngredients: [
      { name: "Chicken", category: "protein", confidence: 0.95, confidenceEmoji: "✅" },
      { name: "Broccoli", category: "vegetable", confidence: 0.92, confidenceEmoji: "✅" }
    ]
  },
  
  fallback: {
    description: "Unable to analyze this meal properly",
    nutrients: [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
    ],
    feedback: ["We couldn't properly analyze this meal. Please try again with a clearer photo."],
    suggestions: ["Take a photo with better lighting", "Make sure all food items are visible"],
    goalScore: 0,
    goalName: "General Health",
    detailedIngredients: [],
    fallback: true,
    modelInfo: {
      model: "fallback",
      usedFallback: true
    }
  }
};

export default function TestMealAnalysisPage() {
  const [selectedTest, setSelectedTest] = useState<string>("complete");
  const router = useRouter();
  
  const handleSelectTestCase = (testCase: string) => {
    setSelectedTest(testCase);
    
    // Store the test case in sessionStorage
    if (TEST_CASES[testCase]) {
      sessionStorage.setItem('analysisResult', JSON.stringify(TEST_CASES[testCase]));
      sessionStorage.setItem('previewUrl', 'https://images.unsplash.com/photo-1582979512210-99b6a53386f9?q=80&w=1024');
    }
  };

  const handleRunTest = () => {
    // Navigate to the meal analysis page
    router.push('/meal-analysis');
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Test Meal Analysis Display</h1>
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Select Test Case</h2>
        
        <div className="space-y-3">
          {Object.keys(TEST_CASES).map((testCase) => (
            <div key={testCase} className="flex items-center">
              <input
                type="radio"
                id={testCase}
                name="testCase"
                value={testCase}
                checked={selectedTest === testCase}
                onChange={() => handleSelectTestCase(testCase)}
                className="mr-3"
              />
              <label htmlFor={testCase} className="block">
                <span className="font-medium text-navy capitalize">{testCase}</span>
                <p className="text-sm text-slate">
                  {testCase === 'complete' && 'Full analysis with all fields'}
                  {testCase === 'missingDescription' && 'Missing description field'}
                  {testCase === 'zeroValues' && 'All nutrient values are zero'}
                  {testCase === 'objectGoalScore' && 'Goal score as object instead of number'}
                  {testCase === 'fallback' && 'Fallback result with minimal data'}
                </p>
              </label>
            </div>
          ))}
        </div>
        
        <div className="mt-6">
          <button
            onClick={handleRunTest}
            className="bg-primary hover:bg-secondary text-white font-medium py-2 px-4 rounded-lg transition-colors shadow-sm"
          >
            Test Selected Case
          </button>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold mb-4">Preview of Selected Test Case</h2>
        
        <pre className="bg-gray-50 p-4 rounded-lg overflow-auto max-h-96 text-xs">
          {JSON.stringify(TEST_CASES[selectedTest], null, 2)}
        </pre>
      </div>
    </div>
  );
} 