/**
 * Display test utilities for meal analysis components
 */

import { AnalysisResult } from '@/app/meal-analysis/types';

/**
 * Test cases for meal analysis display
 */
export const TEST_CASES: Record<string, AnalysisResult> = {
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
    ],
    modelInfo: {
      model: "gpt-4o",
      usedFallback: false,
      ocrExtracted: false
    }
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
    fallback: true,
    modelInfo: {
      model: "fallback",
      usedFallback: true,
      ocrExtracted: false
    }
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
  
  stringFeedback: {
    description: "A meal with string-based feedback instead of array.",
    nutrients: [
      { name: 'Calories', value: 300, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 15, unit: 'g', isHighlight: true }
    ],
    feedback: "This is a single string feedback which should be handled correctly.",
    suggestions: "This suggestion is a string rather than an array.",
    goalScore: 6,
    goalName: "General Health",
    detailedIngredients: [
      { name: "Mixed meal", category: "mixed", confidence: 0.8, confidenceEmoji: "✅" }
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
      usedFallback: true,
      ocrExtracted: false
    }
  },
  
  labelDetection: {
    description: "",
    nutrients: [
      { name: 'Calories', value: 90, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 1.3, unit: 'g', isHighlight: true }
    ],
    feedback: [],
    suggestions: [],
    goalScore: 6,
    goalName: "General Health",
    detailedIngredients: [
      { name: "Banana", category: "fruit", confidence: 0.96, confidenceEmoji: "✅" }
    ],
    _meta: {
      usedLabelDetection: true,
      detectedLabel: "Banana",
      labelConfidence: 0.96
    }
  }
};

/**
 * Function to evaluate the display formatting of the meal analysis
 * @param testCase The test case to evaluate
 * @returns An object with test results
 */
export function evaluateDisplayFormatting(testCase: AnalysisResult): Record<string, boolean> {
  return {
    hasDescription: Boolean(testCase.description),
    hasNutrients: Array.isArray(testCase.nutrients) && testCase.nutrients.length > 0,
    hasFeedback: Array.isArray(testCase.feedback) || typeof testCase.feedback === 'string',
    hasSuggestions: Array.isArray(testCase.suggestions) || typeof testCase.suggestions === 'string',
    hasGoalScore: testCase.goalScore !== undefined,
    hasGoalName: Boolean(testCase.goalName),
    hasDetailedIngredients: Array.isArray(testCase.detailedIngredients),
    isFallback: Boolean(testCase.fallback),
    usesLabelDetection: Boolean(testCase._meta?.usedLabelDetection)
  };
} 